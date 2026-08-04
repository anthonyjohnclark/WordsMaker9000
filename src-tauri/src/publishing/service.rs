use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use chrono::Utc;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_opener::OpenerExt;

use super::adapters::docx::{render_docx, DocxRenderOptions};
use super::adapters::epub::{render_epub, EpubCover as RenderedEpubCover, EpubRenderOptions};
use super::artifacts::{
    copy_history_artifact, delete_history_entry, list_history, load_manifest,
    manifest_for_with_recipe, resolve_history_artifact, safe_filename, ArtifactHistoryEntry,
    ArtifactWorkspace, CANCELLED_ERROR,
};
use super::assets::as_book_assets;
use super::compiler::compile_with_assets;
use super::config::{
    load_or_default, save_atomic, PublishingConfig, HARDCOVER_PROFILE_ID, LARGE_PRINT_PROFILE_ID,
    PRINT_INTERIOR_PROFILE_ID,
};
use super::model::{
    AssetSource, BookAsset, BookDocument, BookSection, SectionInclusion, SectionRole,
};
use super::preflight::{
    has_blocking_diagnostics, run_asset_source_preflight, run_epub_source_preflight, run_preflight,
};
use super::project_types::apply_project_strategy;
use super::request::{
    Diagnostic, DiagnosticSeverity, DocxProfileId, PdfProfileId, PrintInteriorPdfSettings,
    PublishFormat, PublishMetadataOverrides, PublishPhase, PublishProgress, PublishRecipe,
    PublishRequest, PublishResult, SavedPublishingProfile,
};
use super::source::{load_snapshot, project_root};
use super::templates::{
    apply_matter_templates, master_page_catalog, matter_template_catalog, resolve_master_page,
    resolve_matter_templates, MasterPageDefinition, MatterTemplateDefinition,
    PROFILE_DEFAULT_MASTER_PAGE_ID,
};
use crate::export::pdf_typst_adapter::generate_pdf_for_profile_with_root_and_settings;

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
    pub matter_template_catalog: Vec<MatterTemplateDefinition>,
    pub master_page_catalog: Vec<MasterPageDefinition>,
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

    fn template(message: String) -> Self {
        Self {
            diagnostics: vec![Diagnostic::error(
                "PUBLISH_TEMPLATE_INVALID",
                message.clone(),
                None,
                Some("Review the selected matter and master-page templates.".to_string()),
            )],
            message,
        }
    }

    fn cancelled() -> Self {
        Self {
            diagnostics: vec![Diagnostic::warning(
                "PUBLISH_CANCELLED",
                "Publishing was cancelled before the artifact was committed.",
                None,
                Some("No successful artifact or manifest was created.".to_string()),
            )],
            message: CANCELLED_ERROR.to_string(),
        }
    }
}

type CancellationFlag = Arc<AtomicBool>;
static ACTIVE_PUBLISHES: OnceLock<Mutex<HashMap<String, CancellationFlag>>> = OnceLock::new();

fn active_publishes() -> &'static Mutex<HashMap<String, CancellationFlag>> {
    ACTIVE_PUBLISHES.get_or_init(|| Mutex::new(HashMap::new()))
}

fn register_publish(export_id: &str) -> Result<CancellationFlag, PublishFailure> {
    uuid::Uuid::parse_str(export_id)
        .map_err(|_| PublishFailure::source(format!("Invalid publish job ID {export_id:?}")))?;
    let mut active = active_publishes().lock().map_err(|_| {
        PublishFailure::source("Publishing job registry is unavailable.".to_string())
    })?;
    if active.contains_key(export_id) {
        return Err(PublishFailure::source(format!(
            "Publish job {export_id:?} is already active."
        )));
    }
    let flag = Arc::new(AtomicBool::new(false));
    active.insert(export_id.to_string(), flag.clone());
    Ok(flag)
}

fn unregister_publish(export_id: &str) {
    if let Ok(mut active) = active_publishes().lock() {
        active.remove(export_id);
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
        let assets = as_book_assets(&snapshot.asset_registry);
        let mut payload = snapshot.payload;
        payload.options.title = config.book_metadata.title.clone();
        payload.options.author = config.book_metadata.author.clone();
        payload.options.front_matter = config.book_metadata.front_matter.clone();
        payload.options.back_matter = config.book_metadata.back_matter.clone();
        let mut document =
            compile_with_assets(&payload, assets).map_err(PublishFailure::compilation)?;
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
        config.matter_templates = resolve_matter_templates(
            &config.matter_templates,
            &PublishMetadataOverrides::from(&config.book_metadata),
        )
        .map_err(PublishFailure::template)?;
        resolve_master_page(&config.master_page, &PrintInteriorPdfSettings::default())
            .map_err(PublishFailure::template)?;
        apply_matter_templates(&mut document, &config.matter_templates)
            .map_err(PublishFailure::template)?;
        if !outline_requires_confirmation(&document) {
            config.project_type_strategy.confirmed = true;
        }
        Ok(PublishingSetup {
            config,
            project_type: snapshot.project_type,
            outline: document.sections.iter().map(outline_node).collect(),
            matter_template_catalog: matter_template_catalog(),
            master_page_catalog: master_page_catalog(),
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
    let export_id = request.export_id.clone();
    let cancellation = register_publish(&export_id)?;
    let worker_app = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        publish_blocking_with_cancellation(
            Some(&worker_app),
            &app_data_dir,
            request,
            Some(&cancellation),
        )
    })
    .await;
    unregister_publish(&export_id);
    result.map_err(|error| PublishFailure::source(format!("Publishing task failed: {error}")))?
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

#[tauri::command]
pub(crate) fn cancel_publish(export_id: String) -> Result<bool, String> {
    uuid::Uuid::parse_str(&export_id)
        .map_err(|_| format!("Invalid publish job ID {export_id:?}"))?;
    let active = active_publishes()
        .lock()
        .map_err(|_| "Publishing job registry is unavailable.".to_string())?;
    if let Some(flag) = active.get(&export_id) {
        flag.store(true, Ordering::SeqCst);
        Ok(true)
    } else {
        Ok(false)
    }
}

#[tauri::command]
pub(crate) async fn save_publishing_profile(
    app: AppHandle,
    project_name: String,
    mut profile: SavedPublishingProfile,
) -> Result<PublishingConfig, PublishFailure> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| PublishFailure::source(format!("Failed to resolve app data: {error}")))?;
    tauri::async_runtime::spawn_blocking(move || {
        uuid::Uuid::parse_str(&profile.id)
            .map_err(|_| PublishFailure::source("Saved profile has an invalid ID.".to_string()))?;
        profile.name = profile.name.trim().to_string();
        if profile.name.is_empty() || profile.name.chars().count() > 80 {
            return Err(PublishFailure::source(
                "Saved profile names must contain 1 to 80 characters.".to_string(),
            ));
        }
        let snapshot =
            load_snapshot(&app_data_dir, &project_name).map_err(PublishFailure::source)?;
        if profile.recipe.project_type != snapshot.project_type {
            return Err(PublishFailure::source(
                "Saved profile project type does not match this project.".to_string(),
            ));
        }
        let mut validation_request = profile.recipe.clone().into_request(
            uuid::Uuid::new_v4().to_string(),
            project_name,
            None,
        );
        let mut diagnostics = Vec::new();
        resolve_request_templates(&mut validation_request)?;
        validate_profile(&validation_request, &mut diagnostics);
        if has_blocking_diagnostics(&diagnostics) {
            return Err(PublishFailure {
                message: "Saved profile contains invalid format settings.".to_string(),
                diagnostics,
            });
        }
        ensure_epub_identifier(&mut validation_request);
        persist_epub_cover(&snapshot.project_root, &mut validation_request)
            .map_err(PublishFailure::source)?;
        profile.recipe = PublishRecipe::from_request(&validation_request);

        let mut config = load_or_default(
            &snapshot.publishing_path,
            snapshot.project_type,
            &snapshot.project_title,
        )
        .map_err(PublishFailure::source)?;
        if config.saved_profiles.iter().any(|existing| {
            existing.id != profile.id && existing.name.eq_ignore_ascii_case(&profile.name)
        }) {
            return Err(PublishFailure::source(format!(
                "A saved profile named {:?} already exists.",
                profile.name
            )));
        }
        if let Some(existing) = config
            .saved_profiles
            .iter_mut()
            .find(|existing| existing.id == profile.id)
        {
            *existing = profile;
        } else {
            config.saved_profiles.push(profile);
        }
        config
            .saved_profiles
            .sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
        save_atomic(&snapshot.publishing_path, &config).map_err(PublishFailure::source)?;
        Ok(config)
    })
    .await
    .map_err(|error| PublishFailure::source(format!("Save profile task failed: {error}")))?
}

#[tauri::command]
pub(crate) async fn delete_publishing_profile(
    app: AppHandle,
    project_name: String,
    profile_id: String,
) -> Result<PublishingConfig, PublishFailure> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| PublishFailure::source(format!("Failed to resolve app data: {error}")))?;
    tauri::async_runtime::spawn_blocking(move || {
        uuid::Uuid::parse_str(&profile_id)
            .map_err(|_| PublishFailure::source("Saved profile has an invalid ID.".to_string()))?;
        let snapshot =
            load_snapshot(&app_data_dir, &project_name).map_err(PublishFailure::source)?;
        let mut config = load_or_default(
            &snapshot.publishing_path,
            snapshot.project_type,
            &snapshot.project_title,
        )
        .map_err(PublishFailure::source)?;
        let original_len = config.saved_profiles.len();
        config
            .saved_profiles
            .retain(|profile| profile.id != profile_id);
        if config.saved_profiles.len() == original_len {
            return Err(PublishFailure::source(
                "The named publishing profile no longer exists.".to_string(),
            ));
        }
        save_atomic(&snapshot.publishing_path, &config).map_err(PublishFailure::source)?;
        Ok(config)
    })
    .await
    .map_err(|error| PublishFailure::source(format!("Delete profile task failed: {error}")))?
}

#[tauri::command]
pub(crate) async fn copy_publication_artifact(
    app: AppHandle,
    project_name: String,
    export_id: Option<String>,
    filename: String,
    destination: String,
) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data: {error}"))?;
    tauri::async_runtime::spawn_blocking(move || {
        let root = project_root(&app_data_dir, &project_name)?;
        copy_history_artifact(
            &root,
            export_id.as_deref(),
            &filename,
            Path::new(&destination),
        )
    })
    .await
    .map_err(|error| format!("Copy artifact task failed: {error}"))?
}

#[tauri::command]
pub(crate) async fn reveal_publication_artifact(
    app: AppHandle,
    project_name: String,
    export_id: Option<String>,
    filename: String,
) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data: {error}"))?;
    let folder = tauri::async_runtime::spawn_blocking(move || {
        let root = project_root(&app_data_dir, &project_name)?;
        let artifact = resolve_history_artifact(&root, export_id.as_deref(), &filename)?;
        artifact
            .parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| "Artifact has no containing folder.".to_string())
    })
    .await
    .map_err(|error| format!("Reveal artifact task failed: {error}"))??;
    app.opener()
        .open_path(folder.to_string_lossy().to_string(), None::<String>)
        .map_err(|error| format!("Failed to reveal artifact folder: {error}"))
}

#[tauri::command]
pub(crate) async fn delete_publication_history_entry(
    app: AppHandle,
    project_name: String,
    export_id: Option<String>,
    filename: String,
) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data: {error}"))?;
    tauri::async_runtime::spawn_blocking(move || {
        let root = project_root(&app_data_dir, &project_name)?;
        delete_history_entry(&root, export_id.as_deref(), &filename)
    })
    .await
    .map_err(|error| format!("Delete artifact task failed: {error}"))?
}

#[tauri::command]
pub(crate) async fn regenerate_publication(
    app: AppHandle,
    project_name: String,
    export_id: String,
    new_export_id: String,
    destination: Option<String>,
) -> Result<PublishResult, PublishFailure> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| PublishFailure::source(format!("Failed to resolve app data: {error}")))?;
    let cancellation = register_publish(&new_export_id)?;
    let worker_app = app.clone();
    let job_id = new_export_id.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let root = project_root(&app_data_dir, &project_name).map_err(PublishFailure::source)?;
        let manifest = load_manifest(&root, &export_id).map_err(PublishFailure::source)?;
        if manifest.project_name != project_name {
            return Err(PublishFailure::source(
                "Artifact history belongs to a different project.".to_string(),
            ));
        }
        let recipe = manifest.recipe.ok_or_else(|| {
            PublishFailure::source(
                "This legacy artifact does not contain a replayable publishing recipe.".to_string(),
            )
        })?;
        let request = recipe.into_request(new_export_id, project_name, destination);
        publish_blocking_with_cancellation(
            Some(&worker_app),
            &app_data_dir,
            request,
            Some(&cancellation),
        )
    })
    .await;
    unregister_publish(&job_id);
    result.map_err(|error| PublishFailure::source(format!("Regenerate task failed: {error}")))?
}

#[allow(dead_code)]
pub(crate) fn publish_blocking(
    app: Option<&AppHandle>,
    app_data_dir: &Path,
    request: PublishRequest,
) -> Result<PublishResult, PublishFailure> {
    publish_blocking_with_cancellation(app, app_data_dir, request, None)
}

fn publish_blocking_with_cancellation(
    app: Option<&AppHandle>,
    app_data_dir: &Path,
    mut request: PublishRequest,
    cancellation: Option<&AtomicBool>,
) -> Result<PublishResult, PublishFailure> {
    check_cancelled(cancellation)?;
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
    check_cancelled(cancellation)?;
    if snapshot.project_type != request.project_type {
        return Err(PublishFailure::source(format!(
            "Project type changed from {:?} to {:?}; reopen publishing settings and retry.",
            request.project_type, snapshot.project_type
        )));
    }

    let derived_diagnostics = derive_docx_defaults(&mut request);
    resolve_request_templates(&mut request)?;
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
    check_cancelled(cancellation)?;
    let mut document =
        compile_with_assets(&snapshot.payload, as_book_assets(&snapshot.asset_registry))
            .map_err(PublishFailure::compilation)?;
    apply_metadata(&mut document, &request);
    apply_project_strategy(
        &mut document,
        request.project_type,
        &request.node_overrides,
        &request.scope,
        request.include_shared_matter,
    )
    .map_err(PublishFailure::compilation)?;
    if request.include_shared_matter {
        apply_matter_templates(&mut document, &request.matter_templates)
            .map_err(PublishFailure::template)?;
    }
    check_cancelled(cancellation)?;

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
    diagnostics.extend(run_asset_source_preflight(
        &document,
        request.format,
        &request.metadata,
        &snapshot.project_root,
    ));
    if request.format == PublishFormat::Epub {
        diagnostics.extend(run_epub_source_preflight(
            &document,
            &request.metadata,
            &snapshot.project_root,
        ));
    }
    validate_profile(&request, &mut diagnostics);
    if has_blocking_diagnostics(&diagnostics) {
        return Err(PublishFailure {
            message: "Publishing preflight found blocking problems.".to_string(),
            diagnostics,
        });
    }
    check_cancelled(cancellation)?;
    ensure_epub_identifier(&mut request);
    persist_epub_cover(&snapshot.project_root, &mut request).map_err(PublishFailure::source)?;

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
    let rendered = render_artifact(
        workspace.staging_dir(),
        &document,
        &request,
        &snapshot.project_root,
        app,
    );
    let artifact_path = match rendered {
        Ok(path) => path,
        Err(message) => {
            workspace.cleanup();
            return Err(PublishFailure::rendering(message, diagnostics));
        }
    };
    if let Err(error) = check_cancelled(cancellation) {
        workspace.cleanup();
        return Err(error);
    }

    emit_progress(
        app,
        &request.export_id,
        PublishPhase::Validate,
        "Validating and recording the artifact",
        4,
        6,
    );
    if let Err(error) = check_cancelled(cancellation) {
        workspace.cleanup();
        return Err(error);
    }
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
        request.format,
        &request.profile_id,
        &request.pdf_settings,
        &request.large_print_settings,
        &request.hardcover_settings,
        &request.matter_templates,
        &request.master_page,
    );
    config.default_profile_by_format.insert(
        format_name(request.format).to_string(),
        request.profile_id.clone(),
    );
    if let Err(message) = save_atomic(&snapshot.publishing_path, &config) {
        workspace.cleanup();
        return Err(PublishFailure::source(message));
    }

    let source_hash = publication_source_hash(
        &snapshot.source_hash,
        &request,
        &snapshot.project_root,
        &document.assets,
    )
    .map_err(|message| {
        workspace.cleanup();
        PublishFailure::source(message)
    })?;
    if let Err(error) = check_cancelled(cancellation) {
        workspace.cleanup();
        return Err(error);
    }
    let manifest = manifest_for_with_recipe(
        &request.export_id,
        &request.project_name,
        &source_hash,
        &artifact_path,
        request.format,
        &request.profile_id,
        diagnostics.clone(),
        Some(PublishRecipe::from_request(&request)),
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
    if let Err(error) = check_cancelled(cancellation) {
        workspace.cleanup();
        return Err(error);
    }
    let destination = request.destination.as_deref().map(Path::new);
    let (manifest_path, primary_artifact_path) = workspace
        .commit_with_cancellation(&manifest, destination, cancellation)
        .map_err(|message| {
            if message == CANCELLED_ERROR {
                PublishFailure::cancelled()
            } else {
                PublishFailure::rendering(message, diagnostics.clone())
            }
        })?;
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

fn check_cancelled(cancellation: Option<&AtomicBool>) -> Result<(), PublishFailure> {
    if cancellation
        .map(|flag| flag.load(Ordering::SeqCst))
        .unwrap_or(false)
    {
        Err(PublishFailure::cancelled())
    } else {
        Ok(())
    }
}

fn render_artifact(
    output_dir: &Path,
    document: &BookDocument,
    request: &PublishRequest,
    project_root: &Path,
    app: Option<&AppHandle>,
) -> Result<PathBuf, String> {
    match request.format {
        PublishFormat::Pdf => generate_pdf_for_profile_with_root_and_settings(
            document,
            project_root,
            output_dir,
            app,
            parse_pdf_profile(&request.profile_id)?,
            &request.pdf_settings,
            &request.large_print_settings,
            &request.hardcover_settings,
        ),
        PublishFormat::Docx => {
            let profile = parse_docx_profile(&request.profile_id)?;
            let filename = safe_filename(&request.metadata.title, profile_label(profile), "docx");
            let path = output_dir.join(filename);
            render_docx(
                document,
                &DocxRenderOptions {
                    profile,
                    author: request.metadata.author.clone(),
                    contact: request.metadata.contact.clone(),
                    project_root: project_root.to_path_buf(),
                },
                &path,
            )?;
            Ok(path)
        }
        PublishFormat::Epub => {
            let filename = safe_filename(&request.metadata.title, "Reflowable EPUB", "epub");
            let path = output_dir.join(filename);
            let cover = request
                .metadata
                .ebook
                .cover
                .as_ref()
                .map(|cover| {
                    resolve_ebook_source(project_root, &cover.source).map(|source_path| {
                        RenderedEpubCover {
                            source_path,
                            alt_text: cover.alt_text.clone(),
                        }
                    })
                })
                .transpose()?;
            let identifier = request
                .metadata
                .ebook
                .identifier
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .map(str::to_string)
                .unwrap_or_else(|| format!("urn:uuid:{}", request.export_id));
            render_epub(
                document,
                &EpubRenderOptions {
                    project_root: project_root.to_path_buf(),
                    identifier,
                    modified_utc: Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
                    cover,
                    page_progression_direction: request
                        .metadata
                        .ebook
                        .page_progression_direction
                        .clone(),
                    include_front_matter: request.metadata.ebook.include_front_matter,
                    include_back_matter: request.metadata.ebook.include_back_matter,
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

fn parse_pdf_profile(profile_id: &str) -> Result<PdfProfileId, String> {
    match profile_id {
        "proof_pdf" => Ok(PdfProfileId::ProofPdf),
        PRINT_INTERIOR_PROFILE_ID => Ok(PdfProfileId::PrintInterior),
        LARGE_PRINT_PROFILE_ID => Ok(PdfProfileId::LargePrint),
        HARDCOVER_PROFILE_ID => Ok(PdfProfileId::Hardcover),
        other => Err(format!("Unknown PDF profile {other:?}")),
    }
}

fn resolve_request_templates(request: &mut PublishRequest) -> Result<(), PublishFailure> {
    request.matter_templates =
        resolve_matter_templates(&request.matter_templates, &request.metadata)
            .map_err(PublishFailure::template)?;
    if request.master_page.template_id != PROFILE_DEFAULT_MASTER_PAGE_ID
        && (request.format != PublishFormat::Pdf || request.profile_id != PRINT_INTERIOR_PROFILE_ID)
    {
        return Err(PublishFailure::template(
            "Master-page templates are currently available only for Print Interior PDF."
                .to_string(),
        ));
    }
    request.pdf_settings = resolve_master_page(&request.master_page, &request.pdf_settings)
        .map_err(PublishFailure::template)?;
    Ok(())
}

fn validate_profile(request: &PublishRequest, diagnostics: &mut Vec<Diagnostic>) {
    let valid = match request.format {
        PublishFormat::Pdf => parse_pdf_profile(&request.profile_id).is_ok(),
        PublishFormat::Docx => parse_docx_profile(&request.profile_id).is_ok(),
        PublishFormat::Epub => request.profile_id == "reflowable_epub",
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
        return;
    }
    if request.format == PublishFormat::Pdf && request.profile_id == PRINT_INTERIOR_PROFILE_ID {
        let errors = request.pdf_settings.validation_errors();
        if !errors.is_empty() {
            diagnostics.push(Diagnostic::error(
                "PDF_SETTINGS_INVALID",
                format!(
                    "Print Interior settings are invalid: {}.",
                    errors.join("; ")
                ),
                None,
                Some("Adjust the trim, margins, or gutter and retry.".to_string()),
            ));
        }
    }
    if request.format == PublishFormat::Pdf && request.profile_id == LARGE_PRINT_PROFILE_ID {
        let errors = request.large_print_settings.validation_errors();
        if !errors.is_empty() {
            diagnostics.push(Diagnostic::error(
                "PDF_LARGE_PRINT_SETTINGS_INVALID",
                format!("Large Print settings are invalid: {}.", errors.join("; ")),
                None,
                Some(
                    "Adjust the type, line length, page furniture, or geometry and retry."
                        .to_string(),
                ),
            ));
        }
    }
    if request.format == PublishFormat::Pdf && request.profile_id == HARDCOVER_PROFILE_ID {
        let errors = request.hardcover_settings.validation_errors();
        if !errors.is_empty() {
            diagnostics.push(Diagnostic::error(
                "PDF_HARDCOVER_SETTINGS_INVALID",
                format!("Hardcover settings are invalid: {}.", errors.join("; ")),
                None,
                Some(
                    "Adjust the hardcover trim, binding margins, gutter, or chapter starts and retry."
                        .to_string(),
                ),
            ));
        }
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
    document.metadata.identifier = request.metadata.ebook.identifier.clone();
    document.metadata.publisher = request.metadata.ebook.publisher.clone();
    document.metadata.description = request.metadata.ebook.description.clone();
    document.metadata.rights = request.metadata.ebook.rights.clone();
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
    app: Option<&AppHandle>,
    export_id: &str,
    phase: PublishPhase,
    message: &str,
    current: usize,
    total: usize,
) {
    let Some(app) = app else {
        return;
    };
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
        PublishFormat::Epub => "epub",
    }
}

fn resolve_ebook_source(project_root: &Path, source: &str) -> Result<PathBuf, String> {
    let path = Path::new(source);
    if path.is_absolute() {
        return Ok(path.to_path_buf());
    }
    if path.as_os_str().is_empty()
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(format!(
            "Ebook cover path {source:?} is not a safe project-relative path."
        ));
    }
    Ok(project_root.join(path))
}

fn persist_epub_cover(project_root: &Path, request: &mut PublishRequest) -> Result<(), String> {
    if request.format != PublishFormat::Epub {
        return Ok(());
    }
    let Some(cover) = request.metadata.ebook.cover.as_mut() else {
        return Ok(());
    };
    let source_path = resolve_ebook_source(project_root, &cover.source)?;
    if !source_path.is_absolute() || !source_path.is_file() {
        return Ok(());
    }
    let canonical_project_root = project_root
        .canonicalize()
        .unwrap_or_else(|_| project_root.to_path_buf());
    if source_path
        .canonicalize()
        .map(|path| path.starts_with(&canonical_project_root))
        .unwrap_or(false)
    {
        if let Ok(relative) = source_path.strip_prefix(project_root) {
            cover.source = relative.to_string_lossy().replace('\\', "/");
        }
        return Ok(());
    }

    let bytes = fs::read(&source_path)
        .map_err(|error| format!("Failed to read selected ebook cover: {error}"))?;
    let digest = hex_digest(&bytes);
    let extension = source_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("img")
        .to_ascii_lowercase();
    let relative =
        PathBuf::from("publishing-assets").join(format!("cover-{}.{}", &digest[..12], extension));
    let destination = project_root.join(&relative);
    let parent = destination
        .parent()
        .ok_or_else(|| "Ebook cover destination has no parent directory.".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Failed to create publishing asset directory: {error}"))?;
    if !destination.exists() {
        let mut temporary = tempfile::NamedTempFile::new_in(parent)
            .map_err(|error| format!("Failed to stage ebook cover: {error}"))?;
        temporary
            .write_all(&bytes)
            .map_err(|error| format!("Failed to stage ebook cover: {error}"))?;
        temporary
            .as_file()
            .sync_all()
            .map_err(|error| format!("Failed to sync ebook cover: {error}"))?;
        temporary
            .persist(&destination)
            .map_err(|error| format!("Failed to save ebook cover: {error}"))?;
    }
    cover.source = relative.to_string_lossy().replace('\\', "/");
    Ok(())
}

fn ensure_epub_identifier(request: &mut PublishRequest) {
    if request.format == PublishFormat::Epub
        && request
            .metadata
            .ebook
            .identifier
            .as_deref()
            .map(str::trim)
            .unwrap_or_default()
            .is_empty()
    {
        request.metadata.ebook.identifier = Some(format!("urn:uuid:{}", uuid::Uuid::new_v4()));
    }
}

fn publication_source_hash(
    snapshot_hash: &str,
    request: &PublishRequest,
    project_root: &Path,
    assets: &[BookAsset],
) -> Result<String, String> {
    let mut hasher = Sha256::new();
    hasher.update(snapshot_hash.as_bytes());
    hasher.update(
        serde_json::to_vec(&request.metadata)
            .map_err(|error| format!("Failed to hash publishing metadata: {error}"))?,
    );
    hasher.update(
        serde_json::to_vec(&request.scope)
            .map_err(|error| format!("Failed to hash publication scope: {error}"))?,
    );
    hasher.update(format_name(request.format).as_bytes());
    hasher.update(request.profile_id.as_bytes());
    hasher.update(
        serde_json::to_vec(&request.matter_templates)
            .map_err(|error| format!("Failed to hash matter templates: {error}"))?,
    );
    hasher.update(
        serde_json::to_vec(&request.master_page)
            .map_err(|error| format!("Failed to hash master-page template: {error}"))?,
    );
    if request.format == PublishFormat::Pdf && request.profile_id == PRINT_INTERIOR_PROFILE_ID {
        hasher.update(
            serde_json::to_vec(&request.pdf_settings)
                .map_err(|error| format!("Failed to hash PDF settings: {error}"))?,
        );
    }
    if request.format == PublishFormat::Pdf && request.profile_id == LARGE_PRINT_PROFILE_ID {
        hasher.update(
            serde_json::to_vec(&request.large_print_settings)
                .map_err(|error| format!("Failed to hash Large Print settings: {error}"))?,
        );
    }
    if request.format == PublishFormat::Pdf && request.profile_id == HARDCOVER_PROFILE_ID {
        hasher.update(
            serde_json::to_vec(&request.hardcover_settings)
                .map_err(|error| format!("Failed to hash Hardcover settings: {error}"))?,
        );
    }
    let mut overrides: Vec<_> = request.node_overrides.iter().collect();
    overrides.sort_by(|left, right| left.0.cmp(right.0));
    for (id, value) in overrides {
        hasher.update(id.as_bytes());
        hasher.update(
            serde_json::to_vec(value)
                .map_err(|error| format!("Failed to hash publishing override: {error}"))?,
        );
    }
    let mut assets: Vec<_> = assets.iter().collect();
    assets.sort_by(|left, right| left.id.0.cmp(&right.id.0));
    for asset in assets {
        hasher.update(asset.id.0.as_bytes());
        hasher.update(asset.media_type.as_bytes());
        let AssetSource::ProjectRelativePath { path } = &asset.source;
        let relative = Path::new(path);
        if relative.as_os_str().is_empty()
            || relative
                .components()
                .any(|component| !matches!(component, Component::Normal(_)))
        {
            return Err(format!(
                "Publication asset path {path:?} is not project-relative."
            ));
        }
        hasher.update(path.as_bytes());
        hasher.update(
            fs::read(project_root.join(relative))
                .map_err(|error| format!("Failed to hash publication asset {path:?}: {error}"))?,
        );
    }
    if request.format == PublishFormat::Epub {
        if let Some(cover) = &request.metadata.ebook.cover {
            let path = resolve_ebook_source(project_root, &cover.source)?;
            hasher.update(
                fs::read(path).map_err(|error| format!("Failed to hash ebook cover: {error}"))?,
            );
        }
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn hex_digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
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
        ContactInformation, EbookCover, MatterTemplateSelection, ProjectType, PublicationScope,
        PublishMetadataOverrides,
    };
    use std::collections::{BTreeMap, HashMap};

    fn request(format: PublishFormat, profile_id: &str) -> PublishRequest {
        PublishRequest {
            export_id: uuid::Uuid::new_v4().to_string(),
            project_name: "Draft".to_string(),
            project_type: ProjectType::Novel,
            scope: PublicationScope::FullProject,
            format,
            profile_id: profile_id.to_string(),
            pdf_settings: Default::default(),
            large_print_settings: Default::default(),
            hardcover_settings: Default::default(),
            metadata: PublishMetadataOverrides {
                title: "Book".to_string(),
                author: "A. Writer".to_string(),
                contact: ContactInformation::default(),
                ..PublishMetadataOverrides::default()
            },
            node_overrides: HashMap::new(),
            outline_confirmed: true,
            include_shared_matter: true,
            matter_templates: vec![],
            master_page: Default::default(),
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

        let valid = request(PublishFormat::Epub, "reflowable_epub");
        let mut diagnostics = vec![];
        validate_profile(&valid, &mut diagnostics);
        assert!(diagnostics.is_empty());

        let valid = request(PublishFormat::Pdf, "print_interior");
        let mut diagnostics = vec![];
        validate_profile(&valid, &mut diagnostics);
        assert!(diagnostics.is_empty());

        for profile in ["large_print", "hardcover"] {
            let valid = request(PublishFormat::Pdf, profile);
            let mut diagnostics = vec![];
            validate_profile(&valid, &mut diagnostics);
            assert!(diagnostics.is_empty(), "{profile}: {diagnostics:#?}");
        }
    }

    #[test]
    fn non_default_master_pages_are_limited_to_print_interior_pdf() {
        let mut docx_request = request(PublishFormat::Docx, "clean_handoff");
        docx_request.master_page.template_id = "classic_book".to_string();
        let failure = resolve_request_templates(&mut docx_request).unwrap_err();
        assert_eq!(failure.diagnostics[0].code, "PUBLISH_TEMPLATE_INVALID");

        let mut print = request(PublishFormat::Pdf, "print_interior");
        print.master_page.template_id = "minimal_book".to_string();
        print.pdf_settings.gutter_inches = 0.375;
        resolve_request_templates(&mut print).unwrap();
        assert_eq!(print.pdf_settings.gutter_inches, 0.375);
        assert!(!print.pdf_settings.running_headers);
    }

    #[test]
    fn invalid_print_geometry_is_a_blocking_profile_diagnostic() {
        let mut request = request(PublishFormat::Pdf, "print_interior");
        request.pdf_settings.inside_margin_inches = 4.0;
        let mut diagnostics = vec![];

        validate_profile(&request, &mut diagnostics);

        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].code, "PDF_SETTINGS_INVALID");
        assert_eq!(diagnostics[0].severity, DiagnosticSeverity::Error);
    }

    #[test]
    fn advanced_pdf_legibility_and_binding_fail_closed() {
        let mut large_print = request(PublishFormat::Pdf, "large_print");
        large_print.large_print_settings.base_font_size_points = 12.0;
        let mut diagnostics = vec![];
        validate_profile(&large_print, &mut diagnostics);
        assert_eq!(diagnostics[0].code, "PDF_LARGE_PRINT_SETTINGS_INVALID");

        let mut hardcover = request(PublishFormat::Pdf, "hardcover");
        hardcover.hardcover_settings.gutter_inches = 0.0;
        let mut diagnostics = vec![];
        validate_profile(&hardcover, &mut diagnostics);
        assert_eq!(diagnostics[0].code, "PDF_HARDCOVER_SETTINGS_INVALID");
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

    #[test]
    fn selected_epub_cover_is_copied_into_a_content_addressed_project_asset() {
        let project = tempfile::tempdir().unwrap();
        let selected = tempfile::tempdir().unwrap();
        let source = selected.path().join("cover.png");
        fs::write(&source, b"cover-bytes").unwrap();
        let mut request = request(PublishFormat::Epub, "reflowable_epub");
        request.metadata.ebook.cover = Some(EbookCover {
            source: source.to_string_lossy().to_string(),
            alt_text: "Cover".to_string(),
        });

        persist_epub_cover(project.path(), &mut request).unwrap();

        let stored = &request.metadata.ebook.cover.as_ref().unwrap().source;
        assert!(stored.starts_with("publishing-assets/cover-"));
        assert_eq!(
            fs::read(project.path().join(stored)).unwrap(),
            b"cover-bytes"
        );
    }

    #[test]
    fn publication_hash_changes_with_epub_metadata() {
        let project = tempfile::tempdir().unwrap();
        let mut request = request(PublishFormat::Epub, "reflowable_epub");
        let first = publication_source_hash("snapshot", &request, project.path(), &[]).unwrap();
        request.metadata.ebook.publisher = Some("Publisher".to_string());
        let second = publication_source_hash("snapshot", &request, project.path(), &[]).unwrap();
        assert_ne!(first, second);
    }

    #[test]
    fn publication_hash_includes_resolved_templates_and_master_page_version() {
        let project = tempfile::tempdir().unwrap();
        let mut request = request(PublishFormat::Pdf, "print_interior");
        let first = publication_source_hash("snapshot", &request, project.path(), &[]).unwrap();
        request.matter_templates.push(MatterTemplateSelection {
            template_id: "dedication".to_string(),
            template_version: 1,
            variables: BTreeMap::from([("text".to_string(), "For one reader".to_string())]),
        });
        let with_matter =
            publication_source_hash("snapshot", &request, project.path(), &[]).unwrap();
        assert_ne!(first, with_matter);

        request.master_page.template_id = "classic_book".to_string();
        let with_master =
            publication_source_hash("snapshot", &request, project.path(), &[]).unwrap();
        assert_ne!(with_matter, with_master);
    }

    #[test]
    fn generated_epub_identifier_is_stable_once_added_to_a_recipe() {
        let mut request = request(PublishFormat::Epub, "reflowable_epub");
        ensure_epub_identifier(&mut request);
        let identifier = request.metadata.ebook.identifier.clone().unwrap();

        ensure_epub_identifier(&mut request);

        assert_eq!(
            request.metadata.ebook.identifier.as_deref(),
            Some(identifier.as_str())
        );
        assert!(identifier.starts_with("urn:uuid:"));
    }

    #[test]
    fn print_settings_change_only_the_print_interior_source_hash() {
        let project = tempfile::tempdir().unwrap();
        let mut print = request(PublishFormat::Pdf, "print_interior");
        let first = publication_source_hash("snapshot", &print, project.path(), &[]).unwrap();
        print.pdf_settings.gutter_inches = 0.25;
        let second = publication_source_hash("snapshot", &print, project.path(), &[]).unwrap();
        assert_ne!(first, second);

        let mut proof = request(PublishFormat::Pdf, "proof_pdf");
        let proof_first = publication_source_hash("snapshot", &proof, project.path(), &[]).unwrap();
        proof.pdf_settings.gutter_inches = 0.25;
        let proof_second =
            publication_source_hash("snapshot", &proof, project.path(), &[]).unwrap();
        assert_eq!(proof_first, proof_second);
    }

    #[test]
    fn advanced_pdf_settings_change_only_their_active_profile_hash() {
        let project = tempfile::tempdir().unwrap();
        let mut large = request(PublishFormat::Pdf, "large_print");
        let first = publication_source_hash("snapshot", &large, project.path(), &[]).unwrap();
        large.large_print_settings.base_font_size_points = 18.0;
        let second = publication_source_hash("snapshot", &large, project.path(), &[]).unwrap();
        assert_ne!(first, second);

        let mut hardcover = request(PublishFormat::Pdf, "hardcover");
        let first = publication_source_hash("snapshot", &hardcover, project.path(), &[]).unwrap();
        hardcover.hardcover_settings.gutter_inches = 0.375;
        let second = publication_source_hash("snapshot", &hardcover, project.path(), &[]).unwrap();
        assert_ne!(first, second);

        let mut proof = request(PublishFormat::Pdf, "proof_pdf");
        let first = publication_source_hash("snapshot", &proof, project.path(), &[]).unwrap();
        proof.large_print_settings.base_font_size_points = 18.0;
        proof.hardcover_settings.gutter_inches = 0.375;
        let second = publication_source_hash("snapshot", &proof, project.path(), &[]).unwrap();
        assert_eq!(first, second);
    }

    #[test]
    fn missing_epub_cover_does_not_block_pdf_or_docx_hashing() {
        let project = tempfile::tempdir().unwrap();

        for (format, profile_id) in [
            (PublishFormat::Pdf, "proof_pdf"),
            (PublishFormat::Docx, "clean_handoff"),
        ] {
            let mut request = request(format, profile_id);
            request.metadata.ebook.cover = Some(EbookCover {
                source: "missing-cover.svg".to_string(),
                alt_text: "Intentionally missing cover".to_string(),
            });

            publication_source_hash("snapshot", &request, project.path(), &[]).unwrap();
        }
    }

    #[test]
    fn epub_hashing_requires_the_selected_cover_to_exist() {
        let project = tempfile::tempdir().unwrap();
        let mut request = request(PublishFormat::Epub, "reflowable_epub");
        request.metadata.ebook.cover = Some(EbookCover {
            source: "missing-cover.svg".to_string(),
            alt_text: "Intentionally missing cover".to_string(),
        });

        let error = publication_source_hash("snapshot", &request, project.path(), &[]).unwrap_err();
        assert!(error.starts_with("Failed to hash ebook cover:"));
    }

    #[test]
    fn cancellation_registry_is_job_scoped_and_reports_cancelled() {
        let export_id = uuid::Uuid::new_v4().to_string();
        let flag = register_publish(&export_id).unwrap();
        assert!(!flag.load(Ordering::SeqCst));
        assert!(cancel_publish(export_id.clone()).unwrap());
        assert!(flag.load(Ordering::SeqCst));
        assert_eq!(
            check_cancelled(Some(&flag)).unwrap_err().diagnostics[0].code,
            "PUBLISH_CANCELLED"
        );
        unregister_publish(&export_id);
        assert!(!cancel_publish(export_id).unwrap());
    }

    #[test]
    fn duplicate_active_publish_ids_are_rejected() {
        let export_id = uuid::Uuid::new_v4().to_string();
        let _flag = register_publish(&export_id).unwrap();
        let error = register_publish(&export_id).unwrap_err();
        assert!(error.message.contains("already active"));
        unregister_publish(&export_id);
    }
}
