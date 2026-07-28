use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use super::request::{Diagnostic, PublishFormat};

pub(crate) const MANIFEST_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct ArtifactFile {
    pub format: PublishFormat,
    pub profile_id: String,
    pub filename: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct ArtifactManifest {
    pub schema_version: u32,
    pub export_id: String,
    pub project_name: String,
    pub created_at: String,
    pub application_version: String,
    pub source_hash: String,
    pub artifacts: Vec<ArtifactFile>,
    pub diagnostics: Vec<Diagnostic>,
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

    pub(crate) fn artifact_path(&self, filename: &str) -> PathBuf {
        self.staging_dir.join(filename)
    }

    pub(crate) fn staging_dir(&self) -> &Path {
        &self.staging_dir
    }

    pub(crate) fn commit(
        self,
        manifest: &ArtifactManifest,
        destination: Option<&Path>,
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

        let staged_destination = destination
            .map(|destination| stage_destination_copy(&staged_artifact, destination))
            .transpose()?;
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

pub(crate) fn manifest_for(
    export_id: &str,
    project_name: &str,
    source_hash: &str,
    artifact_path: &Path,
    format: PublishFormat,
    profile_id: &str,
    diagnostics: Vec<Diagnostic>,
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
    })
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
            let manifest_content = fs::read_to_string(&manifest_path)
                .map_err(|error| format!("Failed to read {}: {error}", manifest_path.display()))?;
            let manifest: ArtifactManifest = serde_json::from_str(&manifest_content)
                .map_err(|error| format!("Invalid {}: {error}", manifest_path.display()))?;
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
                });
            }
            continue;
        }

        if path.is_file()
            && matches!(
                path.extension().and_then(|extension| extension.to_str()),
                Some("pdf" | "docx")
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

fn format_name(format: PublishFormat) -> &'static str {
    match format {
        PublishFormat::Pdf => "pdf",
        PublishFormat::Docx => "docx",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

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
}
