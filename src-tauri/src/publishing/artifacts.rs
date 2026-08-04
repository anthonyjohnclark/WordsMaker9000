use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use super::request::{Diagnostic, PublishFormat, PublishRecipe};

pub(crate) const MANIFEST_SCHEMA_VERSION: u32 = 2;
pub(crate) const CANCELLED_ERROR: &str = "Publishing cancelled.";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct ArtifactFile {
    pub format: PublishFormat,
    pub profile_id: String,
    pub filename: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub(crate) struct ArtifactManifest {
    pub schema_version: u32,
    pub export_id: String,
    pub project_name: String,
    pub created_at: String,
    pub application_version: String,
    pub source_hash: String,
    pub artifacts: Vec<ArtifactFile>,
    pub diagnostics: Vec<Diagnostic>,
    #[serde(default)]
    pub recipe: Option<PublishRecipe>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct ArtifactHistoryEntry {
    pub export_id: Option<String>,
    pub filename: String,
    pub path: String,
    pub modified: String,
    pub format: String,
    pub profile_id: Option<String>,
    pub legacy: bool,
    pub diagnostics: Vec<Diagnostic>,
    pub can_regenerate: bool,
}

pub(crate) struct ArtifactWorkspace {
    exports_dir: PathBuf,
    staging_dir: PathBuf,
    final_dir: PathBuf,
}

impl ArtifactWorkspace {
    pub(crate) fn create(project_root: &Path, export_id: &str) -> Result<Self, String> {
        validate_export_id(export_id)?;
        let exports_dir = project_root.join("exports");
        fs::create_dir_all(&exports_dir)
            .map_err(|error| format!("Failed to create exports directory: {error}"))?;
        let staging_dir = exports_dir.join(format!(".{export_id}.tmp"));
        let final_dir = exports_dir.join(export_id);
        if staging_dir.exists() || final_dir.exists() {
            return Err(format!("Export ID {export_id:?} already exists"));
        }
        fs::create_dir(&staging_dir)
            .map_err(|error| format!("Failed to create export workspace: {error}"))?;
        Ok(Self {
            exports_dir,
            staging_dir,
            final_dir,
        })
    }

    #[allow(dead_code)]
    pub(crate) fn artifact_path(&self, filename: &str) -> PathBuf {
        self.staging_dir.join(filename)
    }

    pub(crate) fn staging_dir(&self) -> &Path {
        &self.staging_dir
    }

    #[allow(dead_code)]
    pub(crate) fn commit(
        self,
        manifest: &ArtifactManifest,
        destination: Option<&Path>,
    ) -> Result<(PathBuf, PathBuf), String> {
        self.commit_with_cancellation(manifest, destination, None)
    }

    pub(crate) fn commit_with_cancellation(
        self,
        manifest: &ArtifactManifest,
        destination: Option<&Path>,
        cancelled: Option<&AtomicBool>,
    ) -> Result<(PathBuf, PathBuf), String> {
        let artifact = manifest
            .artifacts
            .first()
            .ok_or_else(|| "Artifact manifest contains no files".to_string())?;
        let staged_artifact = self.staging_dir.join(&artifact.filename);
        if !staged_artifact.is_file() {
            return Err(format!(
                "Rendered artifact {} is missing",
                staged_artifact.display()
            ));
        }

        let manifest_path = self.staging_dir.join("manifest.json");
        let manifest_json = serde_json::to_string_pretty(manifest)
            .map_err(|error| format!("Failed to serialize artifact manifest: {error}"))?;
        fs::write(&manifest_path, manifest_json)
            .map_err(|error| format!("Failed to write artifact manifest: {error}"))?;

        ensure_not_cancelled(cancelled)?;
        let staged_destination = destination
            .map(|destination| stage_destination_copy(&staged_artifact, destination, cancelled))
            .transpose()?;
        ensure_not_cancelled(cancelled)?;
        fs::rename(&self.staging_dir, &self.final_dir)
            .map_err(|error| format!("Failed to commit artifact history: {error}"))?;
        let final_artifact = self.final_dir.join(&artifact.filename);

        if let Some((temp, destination)) = staged_destination {
            if let Err(error) = temp.persist(&destination) {
                let _ = fs::remove_dir_all(&self.final_dir);
                return Err(format!(
                    "Failed to atomically commit destination artifact: {error}"
                ));
            }
        }

        Ok((self.final_dir.join("manifest.json"), final_artifact))
    }

    pub(crate) fn cleanup(&self) {
        if self.staging_dir.starts_with(&self.exports_dir) && self.staging_dir.exists() {
            let _ = fs::remove_dir_all(&self.staging_dir);
        }
    }
}

impl Drop for ArtifactWorkspace {
    fn drop(&mut self) {
        self.cleanup();
    }
}

#[allow(dead_code)]
pub(crate) fn manifest_for(
    export_id: &str,
    project_name: &str,
    source_hash: &str,
    artifact_path: &Path,
    format: PublishFormat,
    profile_id: &str,
    diagnostics: Vec<Diagnostic>,
) -> Result<ArtifactManifest, String> {
    manifest_for_with_recipe(
        export_id,
        project_name,
        source_hash,
        artifact_path,
        format,
        profile_id,
        diagnostics,
        None,
    )
}

pub(crate) fn manifest_for_with_recipe(
    export_id: &str,
    project_name: &str,
    source_hash: &str,
    artifact_path: &Path,
    format: PublishFormat,
    profile_id: &str,
    diagnostics: Vec<Diagnostic>,
    recipe: Option<PublishRecipe>,
) -> Result<ArtifactManifest, String> {
    let metadata = fs::metadata(artifact_path)
        .map_err(|error| format!("Failed to inspect rendered artifact: {error}"))?;
    let filename = artifact_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Rendered artifact has an invalid filename".to_string())?;

    Ok(ArtifactManifest {
        schema_version: MANIFEST_SCHEMA_VERSION,
        export_id: export_id.to_string(),
        project_name: project_name.to_string(),
        created_at: Utc::now().to_rfc3339(),
        application_version: env!("CARGO_PKG_VERSION").to_string(),
        source_hash: source_hash.to_string(),
        artifacts: vec![ArtifactFile {
            format,
            profile_id: profile_id.to_string(),
            filename: filename.to_string(),
            size_bytes: metadata.len(),
        }],
        diagnostics,
        recipe,
    })
}

pub(crate) fn load_manifest(
    project_root: &Path,
    export_id: &str,
) -> Result<ArtifactManifest, String> {
    validate_export_id(export_id)?;
    let path = project_root
        .join("exports")
        .join(export_id)
        .join("manifest.json");
    let content = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read {}: {error}", path.display()))?;
    let manifest: ArtifactManifest = serde_json::from_str(&content)
        .map_err(|error| format!("Invalid {}: {error}", path.display()))?;
    if manifest.schema_version == 0 || manifest.schema_version > MANIFEST_SCHEMA_VERSION {
        return Err(format!(
            "Unsupported artifact manifest schema version {}",
            manifest.schema_version
        ));
    }
    if manifest.export_id != export_id {
        return Err(format!(
            "Artifact manifest export ID {:?} does not match its directory",
            manifest.export_id
        ));
    }
    Ok(manifest)
}

pub(crate) fn resolve_history_artifact(
    project_root: &Path,
    export_id: Option<&str>,
    filename: &str,
) -> Result<PathBuf, String> {
    validate_artifact_filename(filename)?;
    let path = if let Some(export_id) = export_id {
        let manifest = load_manifest(project_root, export_id)?;
        if !manifest
            .artifacts
            .iter()
            .any(|artifact| artifact.filename == filename)
        {
            return Err(format!(
                "Artifact {filename:?} is not recorded in export {export_id:?}"
            ));
        }
        project_root.join("exports").join(export_id).join(filename)
    } else {
        project_root.join("exports").join(filename)
    };
    if !path.is_file() {
        return Err(format!("Artifact {} does not exist", path.display()));
    }
    Ok(path)
}

pub(crate) fn copy_history_artifact(
    project_root: &Path,
    export_id: Option<&str>,
    filename: &str,
    destination: &Path,
) -> Result<(), String> {
    let source = resolve_history_artifact(project_root, export_id, filename)?;
    let (temporary, destination) = stage_destination_copy(&source, destination, None)?;
    temporary
        .persist(&destination)
        .map(|_| ())
        .map_err(|error| format!("Failed to atomically copy artifact: {error}"))
}

pub(crate) fn delete_history_entry(
    project_root: &Path,
    export_id: Option<&str>,
    filename: &str,
) -> Result<(), String> {
    let artifact = resolve_history_artifact(project_root, export_id, filename)?;
    if let Some(export_id) = export_id {
        let export_dir = project_root.join("exports").join(export_id);
        if artifact.parent() != Some(export_dir.as_path()) {
            return Err("Artifact is outside its export directory".to_string());
        }
        fs::remove_dir_all(&export_dir)
            .map_err(|error| format!("Failed to delete export history: {error}"))
    } else {
        fs::remove_file(&artifact)
            .map_err(|error| format!("Failed to delete legacy export: {error}"))
    }
}

pub(crate) fn list_history(project_root: &Path) -> Result<Vec<ArtifactHistoryEntry>, String> {
    let exports_dir = project_root.join("exports");
    if !exports_dir.exists() {
        return Ok(vec![]);
    }

    let mut entries = Vec::new();
    for entry in fs::read_dir(&exports_dir)
        .map_err(|error| format!("Failed to read exports directory: {error}"))?
    {
        let entry = entry.map_err(|error| format!("Failed to read export entry: {error}"))?;
        let path = entry.path();
        if path.is_dir() && !entry.file_name().to_string_lossy().starts_with('.') {
            let manifest_path = path.join("manifest.json");
            if !manifest_path.exists() {
                continue;
            }
            let export_id = entry.file_name().to_string_lossy().to_string();
            let manifest = load_manifest(project_root, &export_id)?;
            let diagnostics = manifest.diagnostics.clone();
            let can_regenerate = manifest.recipe.is_some();
            for artifact in manifest.artifacts {
                let artifact_path = path.join(&artifact.filename);
                entries.push(ArtifactHistoryEntry {
                    export_id: Some(manifest.export_id.clone()),
                    filename: artifact.filename,
                    path: artifact_path.to_string_lossy().to_string(),
                    modified: manifest.created_at.clone(),
                    format: format_name(artifact.format).to_string(),
                    profile_id: Some(artifact.profile_id),
                    legacy: false,
                    diagnostics: diagnostics.clone(),
                    can_regenerate,
                });
            }
            continue;
        }

        if path.is_file()
            && matches!(
                path.extension().and_then(|extension| extension.to_str()),
                Some("pdf" | "docx" | "epub")
            )
        {
            let modified = entry
                .metadata()
                .ok()
                .and_then(|metadata| metadata.modified().ok())
                .map(|time| chrono::DateTime::<Utc>::from(time).to_rfc3339())
                .unwrap_or_default();
            let filename = entry.file_name().to_string_lossy().to_string();
            let format = path
                .extension()
                .and_then(|extension| extension.to_str())
                .unwrap_or_default()
                .to_ascii_lowercase();
            entries.push(ArtifactHistoryEntry {
                export_id: None,
                filename,
                path: path.to_string_lossy().to_string(),
                modified,
                format,
                profile_id: None,
                legacy: true,
                diagnostics: Vec::new(),
                can_regenerate: false,
            });
        }
    }
    entries.sort_by(|left, right| right.modified.cmp(&left.modified));
    Ok(entries)
}

pub(crate) fn safe_filename(title: &str, suffix: &str, extension: &str) -> String {
    let sanitized: String = title
        .chars()
        .map(|character| {
            if character.is_alphanumeric()
                || character == ' '
                || character == '-'
                || character == '_'
            {
                character
            } else {
                '_'
            }
        })
        .collect();
    let base = sanitized.trim();
    let base = if base.is_empty() { "Untitled" } else { base };
    if suffix.is_empty() {
        format!("{base}.{extension}")
    } else {
        format!("{base} - {suffix}.{extension}")
    }
}

fn validate_export_id(export_id: &str) -> Result<(), String> {
    uuid::Uuid::parse_str(export_id)
        .map(|_| ())
        .map_err(|_| format!("Invalid export ID {export_id:?}"))
}

fn stage_destination_copy(
    source: &Path,
    destination: &Path,
    cancelled: Option<&AtomicBool>,
) -> Result<(tempfile::NamedTempFile, PathBuf), String> {
    let parent = destination
        .parent()
        .ok_or_else(|| "Destination has no parent directory".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Failed to create destination directory: {error}"))?;
    let mut input = fs::File::open(source)
        .map_err(|error| format!("Failed to open rendered artifact: {error}"))?;
    let mut temp = tempfile::NamedTempFile::new_in(parent)
        .map_err(|error| format!("Failed to create temporary destination artifact: {error}"))?;
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        ensure_not_cancelled(cancelled)?;
        let read = input
            .read(&mut buffer)
            .map_err(|error| format!("Failed to read rendered artifact: {error}"))?;
        if read == 0 {
            break;
        }
        temp.write_all(&buffer[..read])
            .map_err(|error| format!("Failed to copy artifact to destination: {error}"))?;
    }
    temp.as_file()
        .sync_all()
        .map_err(|error| format!("Failed to sync destination artifact: {error}"))?;
    Ok((temp, destination.to_path_buf()))
}

fn ensure_not_cancelled(cancelled: Option<&AtomicBool>) -> Result<(), String> {
    if cancelled
        .map(|flag| flag.load(Ordering::SeqCst))
        .unwrap_or(false)
    {
        Err(CANCELLED_ERROR.to_string())
    } else {
        Ok(())
    }
}

fn validate_artifact_filename(filename: &str) -> Result<(), String> {
    let path = Path::new(filename);
    if filename.is_empty()
        || path.components().count() != 1
        || !matches!(
            path.components().next(),
            Some(std::path::Component::Normal(_))
        )
        || !matches!(
            path.extension().and_then(|extension| extension.to_str()),
            Some("pdf" | "docx" | "epub")
        )
    {
        return Err(format!("Invalid artifact filename {filename:?}"));
    }
    Ok(())
}

fn format_name(format: PublishFormat) -> &'static str {
    match format {
        PublishFormat::Pdf => "pdf",
        PublishFormat::Docx => "docx",
        PublishFormat::Epub => "epub",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::publishing::request::{
        PrintInteriorPdfSettings, ProjectType, PublicationScope, PublishMetadataOverrides,
        PublishRecipe,
    };
    use std::env;

    fn recipe() -> PublishRecipe {
        PublishRecipe {
            project_type: ProjectType::Novel,
            scope: PublicationScope::FullProject,
            format: PublishFormat::Docx,
            profile_id: "clean_handoff".to_string(),
            pdf_settings: PrintInteriorPdfSettings::default(),
            large_print_settings: Default::default(),
            hardcover_settings: Default::default(),
            metadata: PublishMetadataOverrides {
                title: "Book".to_string(),
                author: "Writer".to_string(),
                ..PublishMetadataOverrides::default()
            },
            node_overrides: Default::default(),
            outline_confirmed: true,
            include_shared_matter: true,
            matter_templates: vec![],
            master_page: Default::default(),
        }
    }

    #[test]
    fn filename_sanitization_is_stable() {
        assert_eq!(
            safe_filename("A: Book / Draft", "Standard Manuscript", "docx"),
            "A_ Book _ Draft - Standard Manuscript.docx"
        );
    }

    #[test]
    fn manifest_history_keeps_new_artifacts_and_legacy_pdfs() {
        let project = env::temp_dir().join(format!(
            "wm9000-artifacts-{}",
            uuid::Uuid::new_v4().simple()
        ));
        fs::create_dir_all(project.join("exports")).unwrap();
        fs::write(project.join("exports").join("legacy.pdf"), b"pdf").unwrap();
        let export_id = uuid::Uuid::new_v4().to_string();
        let workspace = ArtifactWorkspace::create(&project, &export_id).unwrap();
        let staged = workspace.artifact_path("Book.docx");
        fs::write(&staged, b"docx").unwrap();
        let manifest = manifest_for(
            &export_id,
            "Book",
            "hash",
            &staged,
            PublishFormat::Docx,
            "clean_handoff",
            vec![],
        )
        .unwrap();
        workspace.commit(&manifest, None).unwrap();

        let entries = list_history(&project).unwrap();
        assert_eq!(entries.len(), 2);
        assert!(entries.iter().any(|entry| entry.legacy));
        assert!(entries.iter().any(|entry| !entry.legacy));
        assert!(entries.iter().all(|entry| !entry.can_regenerate));

        let _ = fs::remove_dir_all(project);
    }

    #[test]
    fn failed_destination_copy_leaves_no_manifest_or_temporary_workspace() {
        let project = env::temp_dir().join(format!(
            "wm9000-artifacts-{}",
            uuid::Uuid::new_v4().simple()
        ));
        fs::create_dir_all(project.join("exports")).unwrap();
        let export_id = uuid::Uuid::new_v4().to_string();
        let workspace = ArtifactWorkspace::create(&project, &export_id).unwrap();
        let staged = workspace.artifact_path("Book.docx");
        fs::write(&staged, b"docx").unwrap();
        let manifest = manifest_for(
            &export_id,
            "Book",
            "hash",
            &staged,
            PublishFormat::Docx,
            "clean_handoff",
            vec![],
        )
        .unwrap();
        let invalid_parent = project.join("not-a-directory");
        fs::write(&invalid_parent, b"file").unwrap();

        assert!(workspace
            .commit(&manifest, Some(&invalid_parent.join("Book.docx")))
            .is_err());
        assert!(!project.join("exports").join(&export_id).exists());
        assert!(!project
            .join("exports")
            .join(format!(".{export_id}.tmp"))
            .exists());

        let _ = fs::remove_dir_all(project);
    }

    #[test]
    fn manifest_recipe_enables_regeneration_and_survives_history_loading() {
        let project = env::temp_dir().join(format!(
            "wm9000-artifacts-{}",
            uuid::Uuid::new_v4().simple()
        ));
        fs::create_dir_all(project.join("exports")).unwrap();
        let export_id = uuid::Uuid::new_v4().to_string();
        let workspace = ArtifactWorkspace::create(&project, &export_id).unwrap();
        let staged = workspace.artifact_path("Book.docx");
        fs::write(&staged, b"docx").unwrap();
        let manifest = manifest_for_with_recipe(
            &export_id,
            "Book",
            "hash",
            &staged,
            PublishFormat::Docx,
            "clean_handoff",
            vec![Diagnostic::warning(
                "TEST_WARNING",
                "Review this.",
                None,
                None,
            )],
            Some(recipe()),
        )
        .unwrap();
        workspace.commit(&manifest, None).unwrap();

        let loaded = load_manifest(&project, &export_id).unwrap();
        assert_eq!(loaded.recipe, Some(recipe()));
        let entries = list_history(&project).unwrap();
        assert_eq!(entries.len(), 1);
        assert!(entries[0].can_regenerate);
        assert_eq!(entries[0].diagnostics[0].code, "TEST_WARNING");

        let _ = fs::remove_dir_all(project);
    }

    #[test]
    fn legacy_v1_manifest_without_a_recipe_remains_readable() {
        let project = env::temp_dir().join(format!(
            "wm9000-artifacts-{}",
            uuid::Uuid::new_v4().simple()
        ));
        let export_id = uuid::Uuid::new_v4().to_string();
        let export_dir = project.join("exports").join(&export_id);
        fs::create_dir_all(&export_dir).unwrap();
        fs::write(export_dir.join("Book.pdf"), b"pdf").unwrap();
        let manifest = serde_json::json!({
            "schema_version": 1,
            "export_id": export_id.clone(),
            "project_name": "Book",
            "created_at": "2026-07-30T00:00:00Z",
            "application_version": "0.1.0",
            "source_hash": "hash",
            "artifacts": [{
                "format": "pdf",
                "profile_id": "proof_pdf",
                "filename": "Book.pdf",
                "size_bytes": 3
            }],
            "diagnostics": []
        });
        fs::write(
            export_dir.join("manifest.json"),
            serde_json::to_vec_pretty(&manifest).unwrap(),
        )
        .unwrap();

        let loaded = load_manifest(&project, &export_id).unwrap();
        assert_eq!(loaded.schema_version, 1);
        assert!(loaded.recipe.is_none());
        assert!(!list_history(&project).unwrap()[0].can_regenerate);

        let _ = fs::remove_dir_all(project);
    }

    #[test]
    fn copy_and_delete_history_actions_are_scoped_to_recorded_artifacts() {
        let project = env::temp_dir().join(format!(
            "wm9000-artifacts-{}",
            uuid::Uuid::new_v4().simple()
        ));
        fs::create_dir_all(project.join("exports")).unwrap();
        let export_id = uuid::Uuid::new_v4().to_string();
        let workspace = ArtifactWorkspace::create(&project, &export_id).unwrap();
        let staged = workspace.artifact_path("Book.docx");
        fs::write(&staged, b"docx").unwrap();
        let manifest = manifest_for(
            &export_id,
            "Book",
            "hash",
            &staged,
            PublishFormat::Docx,
            "clean_handoff",
            vec![],
        )
        .unwrap();
        workspace.commit(&manifest, None).unwrap();

        let copied = project.join("copies").join("Book.docx");
        copy_history_artifact(&project, Some(&export_id), "Book.docx", &copied).unwrap();
        assert_eq!(fs::read(&copied).unwrap(), b"docx");
        assert!(resolve_history_artifact(&project, Some(&export_id), "../Book.docx").is_err());

        delete_history_entry(&project, Some(&export_id), "Book.docx").unwrap();
        assert!(!project.join("exports").join(&export_id).exists());

        let _ = fs::remove_dir_all(project);
    }

    #[test]
    fn cancelled_destination_copy_never_commits_history_or_destination() {
        let project = env::temp_dir().join(format!(
            "wm9000-artifacts-{}",
            uuid::Uuid::new_v4().simple()
        ));
        fs::create_dir_all(project.join("exports")).unwrap();
        let export_id = uuid::Uuid::new_v4().to_string();
        let workspace = ArtifactWorkspace::create(&project, &export_id).unwrap();
        let staged = workspace.artifact_path("Book.docx");
        fs::write(&staged, vec![1_u8; 256 * 1024]).unwrap();
        let manifest = manifest_for(
            &export_id,
            "Book",
            "hash",
            &staged,
            PublishFormat::Docx,
            "clean_handoff",
            vec![],
        )
        .unwrap();
        let destination = project.join("copy.docx");
        let cancelled = AtomicBool::new(true);

        let error = workspace
            .commit_with_cancellation(&manifest, Some(&destination), Some(&cancelled))
            .unwrap_err();
        assert_eq!(error, CANCELLED_ERROR);
        assert!(!destination.exists());
        assert!(!project.join("exports").join(&export_id).exists());

        let _ = fs::remove_dir_all(project);
    }
}
