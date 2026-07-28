use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use super::adapters::docx::{render_docx, DocxRenderOptions};
use super::artifacts::{
    list_history, manifest_for, safe_filename, ArtifactHistoryEntry, ArtifactWorkspace,
};
use super::compiler::compile;
use super::config::{load_or_default, save_atomic, PublishingConfig};
use super::model::{BookDocument, BookSection, SectionInclusion, SectionRole};
use super::preflight::{has_blocking_diagnostics, run_preflight};
use super::project_types::apply_project_strategy;
use super::request::{
    Diagnostic, DiagnosticSeverity, DocxProfileId, PublishFormat, PublishPhase, PublishProgress,
    PublishRequest, PublishResult,
};
use super::source::{load_snapshot, project_root};
use crate::export::pdf_adapter::generate_pdf;

#[derive(Debug, Clone, Serialize)]
pub(crate) struct PublishingOutlineNode {
    pub id: Option<i64>,
    pub title: Option<String>,
    pub role: SectionRole,
    pub inclusion: SectionInclusion,
    pub children: Vec<PublishingOutlineNode>,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct PublishingSetup {
    pub config: PublishingConfig,
    pub project_type: super::request::ProjectType,
    pub outline: Vec<PublishingOutlineNode>,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct PublishFailure {
    pub message: String,
    pub diagnostics: Vec<Diagnostic>,
}

impl PublishFailure {
    fn source(message: String) -> Self {
        Self {
            diagnostics: vec![Diagnostic::error(
                "PUBLISH_SOURCE_ERROR",
                message.clone(),
                None,
                Some("Resolve the source error and retry the publish.".to_string()),
            )],
            message,
        }
    }

    fn rendering(message: String, diagnostics: Vec<Diagnostic>) -> Self {
        let mut diagnostics = diagnostics;
        diagnostics.push(Diagnostic::error(
            "PUBLISH_RENDER_FAILED",
            message.clone(),
            None,
            Some("Resolve the rendering error and retry the publish.".to_string()),
        ));
        Self {
            message,
            diagnostics,
        }
    }

    fn compilation(message: String) -> Self {
        let code = if message.to_ascii_lowercase().contains("unsupported") {
            "PUBLISH_UNSUPPORTED_CONTENT"
        } else {
            "PUBLISH_TREE_INVALID"
        };
        Self {
            diagnostics: vec![Diagnostic::error(
                code,
                message.clone(),
                None,
                Some("Resolve the named source or outline problem and retry.".to_string()),
            )],
            message,
        }
    }
}

#[tauri::command]
pub(crate) async fn get_publishing_setup(
    app: AppHandle,
    project_name: String,
) -> Result<PublishingSetup, PublishFailure> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| PublishFailure::source(format!("Failed to resolve app data: {error}")))?;
    tauri::async_runtime::spawn_blocking(move || {
        let snapshot =
            load_snapshot(&app_data_dir, &project_name).map_err(PublishFailure::source)?;
        let mut config = load_or_default(
            &snapshot.publishing_path,
            snapshot.project_type,
            &snapshot.project_title,
        )
        .map_err(PublishFailure::source)?;
        let mut payload = snapshot.payload;
        payload.options.title = config.book_metadata.title.clone();
        payload.options.author = config.book_metadata.author.clone();
        payload.options.front_matter = config.book_metadata.front_matter.clone();
        payload.options.back_matter = config.book_metadata.back_matter.clone();
        let mut document = compile(&payload).map_err(PublishFailure::compilation)?;
        document.metadata.subtitle = config.book_metadata.subtitle.clone();
        document.metadata.language = config.book_metadata.language.clone();
        apply_project_strategy(
            &mut document,
            snapshot.project_type,
            &config.node_roles,
            &super::request::PublicationScope::FullProject,
            true,
        )
        .map_err(PublishFailure::compilation)?;
        if !outline_requires_confirmation(&document) {
            config.project_type_strategy.confirmed = true;
        }
        Ok(PublishingSetup {
            config,
            project_type: snapshot.project_type,
            outline: document.sections.iter().map(outline_node).collect(),
        })
    })
    .await
    .map_err(|error| PublishFailure::source(format!("Publishing setup task failed: {error}")))?
}

#[tauri::command]
pub(crate) async fn publish_project(
    app: AppHandle,
    request: PublishRequest,
) -> Result<PublishResult, PublishFailure> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| PublishFailure::source(format!("Failed to resolve app data: {error}")))?;
    let worker_app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        publish_blocking(&worker_app, &app_data_dir, request)
    })
    .await
    .map_err(|error| PublishFailure::source(format!("Publishing task failed: {error}")))?
}

#[tauri::command]
pub(crate) async fn list_publication_history(
    app: AppHandle,
    project_name: String,
) -> Result<Vec<ArtifactHistoryEntry>, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data: {error}"))?;
    tauri::async_runtime::spawn_blocking(move || {
        let root = project_root(&app_data_dir, &project_name)?;
        list_history(&root)
    })
    .await
    .map_err(|error| format!("History task failed: {error}"))?
}

fn publish_blocking(
    app: &AppHandle,
    app_data_dir: &Path,
    mut request: PublishRequest,
) -> Result<PublishResult, PublishFailure> {
    emit_progress(
        app,
        &request.export_id,
        PublishPhase::Snapshot,
        "Loading the saved project snapshot",
        0,
        6,
    );
    let mut snapshot =
        load_snapshot(app_data_dir, &request.project_name).map_err(PublishFailure::source)?;
    if snapshot.project_type != request.project_type {
        return Err(PublishFailure::source(format!(
            "Project type changed from {:?} to {:?}; reopen publishing settings and retry.",
            request.project_type, snapshot.project_type
        )));
    }

    let derived_diagnostics = derive_docx_defaults(&mut request);
    snapshot.payload.options.title = request.metadata.title.clone();
    snapshot.payload.options.author = request.metadata.author.clone();
    snapshot.payload.options.front_matter = request.metadata.front_matter.clone();
    snapshot.payload.options.back_matter = request.metadata.back_matter.clone();

    emit_progress(
        app,
        &request.export_id,
        PublishPhase::Compile,
        "Compiling the publication document",
        1,
        6,
    );
    let mut document = compile(&snapshot.payload).map_err(PublishFailure::compilation)?;
    apply_metadata(&mut document, &request);
    apply_project_strategy(
        &mut document,
        request.project_type,
        &request.node_overrides,
        &request.scope,
        request.include_shared_matter,
    )
    .map_err(PublishFailure::compilation)?;

    emit_progress(
        app,
        &request.export_id,
        PublishPhase::Preflight,
        "Checking the publication",
        2,
        6,
    );
    let mut diagnostics = run_preflight(
        &document,
        request.format,
        &request.metadata,
        request.outline_confirmed || !outline_requires_confirmation(&document),
    );
    diagnostics.extend(derived_diagnostics);
    validate_profile(&request, &mut diagnostics);
    if has_blocking_diagnostics(&diagnostics) {
        return Err(PublishFailure {
            message: "Publishing preflight found blocking problems.".to_string(),
            diagnostics,
        });
    }

    let workspace = ArtifactWorkspace::create(&snapshot.project_root, &request.export_id)
        .map_err(PublishFailure::source)?;
    emit_progress(
        app,
        &request.export_id,
        PublishPhase::Render,
        "Rendering the publication artifact",
        3,
        6,
    );
    let rendered = render_artifact(&workspace, &document, &request, app);
    let artifact_path = match rendered {
        Ok(path) => path,
        Err(message) => {
            workspace.cleanup();
            return Err(PublishFailure::rendering(message, diagnostics));
        }
    };

    emit_progress(
        app,
        &request.export_id,
        PublishPhase::Validate,
        "Validating and recording the artifact",
        4,
        6,
    );
    let mut config = load_or_default(
        &snapshot.publishing_path,
        snapshot.project_type,
        &snapshot.project_title,
    )
    .map_err(|message| {
        workspace.cleanup();
        PublishFailure::source(message)
    })?;
    config.merge_request(
        &request.metadata,
        &request.node_overrides,
        request.outline_confirmed,
    );
    config.default_profile_by_format.insert(
        format_name(request.format).to_string(),
        request.profile_id.clone(),
    );
    if let Err(message) = save_atomic(&snapshot.publishing_path, &config) {
        workspace.cleanup();
        return Err(PublishFailure::source(message));
    }

    let manifest = manifest_for(
        &request.export_id,
        &request.project_name,
        &snapshot.source_hash,
        &artifact_path,
        request.format,
        &request.profile_id,
        diagnostics.clone(),
    )
    .map_err(|message| {
        workspace.cleanup();
        PublishFailure::rendering(message, diagnostics.clone())
    })?;

    emit_progress(
        app,
        &request.export_id,
        PublishPhase::Copy,
        "Committing the artifact",
        5,
        6,
    );
    let destination = request.destination.as_deref().map(Path::new);
    let (manifest_path, primary_artifact_path) = workspace
        .commit(&manifest, destination)
        .map_err(|message| PublishFailure::rendering(message, diagnostics.clone()))?;
    emit_progress(
        app,
        &request.export_id,
        PublishPhase::Copy,
        "Publication complete",
        6,
        6,
    );

    Ok(PublishResult {
        export_id: request.export_id,
        manifest_path: manifest_path.to_string_lossy().to_string(),
        primary_artifact_path: primary_artifact_path.to_string_lossy().to_string(),
        diagnostics,
    })
}

fn render_artifact(
    workspace: &ArtifactWorkspace,
    document: &BookDocument,
    request: &PublishRequest,
    app: &AppHandle,
) -> Result<PathBuf, String> {
    match request.format {
        PublishFormat::Pdf => generate_pdf(document, workspace.staging_dir(), Some(app)),
        PublishFormat::Docx => {
            let profile = parse_docx_profile(&request.profile_id)?;
            let filename = safe_filename(&request.metadata.title, profile_label(profile), "docx");
            let path = workspace.artifact_path(&filename);
            render_docx(
                document,
                &DocxRenderOptions {
                    profile,
                    author: request.metadata.author.clone(),
                    contact: request.metadata.contact.clone(),
                },
                &path,
            )?;
            Ok(path)
        }
    }
}

fn parse_docx_profile(profile_id: &str) -> Result<DocxProfileId, String> {
    match profile_id {
        "standard_manuscript" => Ok(DocxProfileId::StandardManuscript),
        "clean_handoff" => Ok(DocxProfileId::CleanHandoff),
        other => Err(format!("Unknown DOCX profile {other:?}")),
    }
}

fn validate_profile(request: &PublishRequest, diagnostics: &mut Vec<Diagnostic>) {
    let valid = match request.format {
        PublishFormat::Pdf => request.profile_id == "proof_pdf",
        PublishFormat::Docx => parse_docx_profile(&request.profile_id).is_ok(),
    };
    if !valid {
        diagnostics.push(Diagnostic::error(
            "PUBLISH_PROFILE_INVALID",
            format!(
                "Profile {:?} is not valid for {} output.",
                request.profile_id,
                format_name(request.format).to_uppercase()
            ),
            None,
            Some("Choose one of the available profiles for this format.".to_string()),
        ));
    }
}

fn derive_docx_defaults(request: &mut PublishRequest) -> Vec<Diagnostic> {
    if request.format != PublishFormat::Docx || request.profile_id != "standard_manuscript" {
        return vec![];
    }
    let mut diagnostics = Vec::new();
    if request.metadata.contact.author_name.trim().is_empty() {
        request.metadata.contact.author_name = request.metadata.author.clone();
    }
    if request.metadata.contact.header_surname.trim().is_empty() {
        diagnostics.push(Diagnostic::warning(
            "DOCX_HEADER_SURNAME_MISSING",
            "The manuscript header surname was missing and was derived from the author name.",
            None,
            Some("Review the derived surname in publishing settings.".to_string()),
        ));
        request.metadata.contact.header_surname = request
            .metadata
            .author
            .split_whitespace()
            .last()
            .unwrap_or_default()
            .to_string();
    }
    if request.metadata.contact.short_title.trim().is_empty() {
        diagnostics.push(Diagnostic::warning(
            "DOCX_SHORT_TITLE_MISSING",
            "The manuscript short title was missing and was derived from the full title.",
            None,
            Some("Review the derived short title in publishing settings.".to_string()),
        ));
        request.metadata.contact.short_title = request.metadata.title.clone();
    }
    diagnostics
}

fn apply_metadata(document: &mut BookDocument, request: &PublishRequest) {
    document.metadata.title = request.metadata.title.clone();
    document.metadata.subtitle = request.metadata.subtitle.clone();
    document.metadata.language = request.metadata.language.clone();
    if let Some(author) = document.metadata.contributors.first_mut() {
        author.name = request.metadata.author.clone();
    }
}

fn outline_node(section: &BookSection) -> PublishingOutlineNode {
    PublishingOutlineNode {
        id: section.source_node_id,
        title: section.title.clone(),
        role: section.role.clone(),
        inclusion: section.inclusion.clone(),
        children: section.children.iter().map(outline_node).collect(),
    }
}

fn outline_requires_confirmation(document: &BookDocument) -> bool {
    fn section_is_ambiguous(section: &BookSection) -> bool {
        section.role == SectionRole::Unassigned || section.children.iter().any(section_is_ambiguous)
    }

    document.sections.iter().any(section_is_ambiguous)
}

fn emit_progress(
    app: &AppHandle,
    export_id: &str,
    phase: PublishPhase,
    message: &str,
    current: usize,
    total: usize,
) {
    let _ = app.emit(
        "publish-progress",
        PublishProgress {
            export_id: export_id.to_string(),
            phase,
            message: message.to_string(),
            current,
            total,
            severity: DiagnosticSeverity::Info,
        },
    );
}

fn format_name(format: PublishFormat) -> &'static str {
    match format {
        PublishFormat::Pdf => "pdf",
        PublishFormat::Docx => "docx",
    }
}

fn profile_label(profile: DocxProfileId) -> &'static str {
    match profile {
        DocxProfileId::StandardManuscript => "Standard Manuscript",
        DocxProfileId::CleanHandoff => "Clean Handoff",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::publishing::request::{
        ContactInformation, ProjectType, PublicationScope, PublishMetadataOverrides,
    };
    use std::collections::HashMap;

    fn request(format: PublishFormat, profile_id: &str) -> PublishRequest {
        PublishRequest {
            export_id: uuid::Uuid::new_v4().to_string(),
            project_name: "Draft".to_string(),
            project_type: ProjectType::Novel,
            scope: PublicationScope::FullProject,
            format,
            profile_id: profile_id.to_string(),
            metadata: PublishMetadataOverrides {
                title: "Book".to_string(),
                author: "A. Writer".to_string(),
                contact: ContactInformation::default(),
                ..PublishMetadataOverrides::default()
            },
            node_overrides: HashMap::new(),
            outline_confirmed: true,
            include_shared_matter: true,
            destination: None,
        }
    }

    #[test]
    fn profile_validation_is_format_specific() {
        let invalid = request(PublishFormat::Pdf, "clean_handoff");
        let mut diagnostics = vec![];
        validate_profile(&invalid, &mut diagnostics);
        assert_eq!(diagnostics[0].code, "PUBLISH_PROFILE_INVALID");

        let valid = request(PublishFormat::Docx, "clean_handoff");
        let mut diagnostics = vec![];
        validate_profile(&valid, &mut diagnostics);
        assert!(diagnostics.is_empty());
    }

    #[test]
    fn manuscript_header_defaults_are_deterministic() {
        let mut request = request(PublishFormat::Docx, "standard_manuscript");
        let diagnostics = derive_docx_defaults(&mut request);
        assert_eq!(request.metadata.contact.author_name, "A. Writer");
        assert_eq!(request.metadata.contact.header_surname, "Writer");
        assert_eq!(request.metadata.contact.short_title, "Book");
        assert_eq!(diagnostics.len(), 2);
    }

    #[test]
    fn compilation_failures_use_stable_diagnostic_codes() {
        let unsupported = PublishFailure::compilation("Unsupported element <table>".to_string());
        assert_eq!(
            unsupported.diagnostics[0].code,
            "PUBLISH_UNSUPPORTED_CONTENT"
        );

        let invalid_tree = PublishFailure::compilation("Duplicate node ID 4".to_string());
        assert_eq!(invalid_tree.diagnostics[0].code, "PUBLISH_TREE_INVALID");
    }
}
