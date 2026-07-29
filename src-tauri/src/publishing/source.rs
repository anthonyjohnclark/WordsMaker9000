use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Component, Path, PathBuf};

use crate::export::types::{ExportFileNode, ExportOptions, ExportPayload};

use super::request::ProjectType;

#[derive(Debug)]
pub(crate) struct SourceSnapshot {
    pub project_root: PathBuf,
    pub publishing_path: PathBuf,
    pub project_title: String,
    pub project_type: ProjectType,
    pub payload: ExportPayload,
    pub source_hash: String,
}

#[derive(Debug, Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredProjectMetadata {
    project_name: String,
    project_type: ProjectType,
    #[serde(default)]
    tree_data: Vec<StoredNode>,
}

#[derive(Debug, Deserialize, serde::Serialize)]
struct StoredNode {
    id: i64,
    parent: i64,
    text: String,
    data: Option<StoredNodeData>,
}

#[derive(Debug, Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredNodeData {
    file_type: Option<String>,
    file_id: Option<String>,
}

#[derive(Debug, Deserialize, serde::Serialize)]
struct StoredFile {
    content: Option<String>,
}

pub(crate) fn project_root(app_data_dir: &Path, project_name: &str) -> Result<PathBuf, String> {
    validate_project_name(project_name)?;
    let base = if cfg!(debug_assertions) {
        "Dev_Projects"
    } else {
        "Projects"
    };
    Ok(app_data_dir.join(base).join(project_name))
}

pub(crate) fn validate_project_name(project_name: &str) -> Result<(), String> {
    let path = Path::new(project_name);
    let mut components = path.components();
    let valid = matches!(components.next(), Some(Component::Normal(_)))
        && components.next().is_none()
        && project_name != "."
        && project_name != ".."
        && !project_name.trim().is_empty();
    if valid {
        Ok(())
    } else {
        Err(format!(
            "Invalid project name {project_name:?}; expected one directory name"
        ))
    }
}

pub(crate) fn load_snapshot(
    app_data_dir: &Path,
    project_name: &str,
) -> Result<SourceSnapshot, String> {
    let project_root = project_root(app_data_dir, project_name)?;
    let metadata_path = project_root.join("metadata.json");
    let metadata_content = fs::read_to_string(&metadata_path)
        .map_err(|error| format!("Failed to read {}: {error}", metadata_path.display()))?;
    let metadata: StoredProjectMetadata = serde_json::from_str(&metadata_content)
        .map_err(|error| format!("Invalid project metadata: {error}"))?;

    let mut export_nodes = Vec::with_capacity(metadata.tree_data.len());
    let mut hashed_files = Vec::new();
    for node in &metadata.tree_data {
        let data = node.data.as_ref().ok_or_else(|| {
            format!(
                "Project node \"{}\" (ID {}) has no node data",
                node.text, node.id
            )
        })?;
        let file_type = data.file_type.as_deref().ok_or_else(|| {
            format!(
                "Project node \"{}\" (ID {}) has no file type",
                node.text, node.id
            )
        })?;
        let content = if file_type == "file" {
            let file_id = data.file_id.as_deref().ok_or_else(|| {
                format!("File \"{}\" (node {}) has no file ID", node.text, node.id)
            })?;
            validate_file_id(file_id, node.id, &node.text)?;
            let file_path = project_root.join(format!("{file_id}.json"));
            let stored_content = fs::read_to_string(&file_path).map_err(|error| {
                format!(
                    "Failed to read \"{}\" (node {}) from {}: {error}",
                    node.text,
                    node.id,
                    file_path.display()
                )
            })?;
            let stored: StoredFile = serde_json::from_str(&stored_content).map_err(|error| {
                format!(
                    "Invalid content file for \"{}\" (node {}): {error}",
                    node.text, node.id
                )
            })?;
            let content = stored.content.ok_or_else(|| {
                format!(
                    "File \"{}\" (node {}) has no content field",
                    node.text, node.id
                )
            })?;
            hashed_files.push((file_id.to_string(), content.clone()));
            Some(content)
        } else {
            None
        };

        export_nodes.push(ExportFileNode {
            id: node.id,
            parent: node.parent,
            text: node.text.clone(),
            file_type: file_type.to_string(),
            content,
        });
    }

    let canonical = serde_json::to_vec(&(&metadata, &hashed_files))
        .map_err(|error| format!("Failed to hash source snapshot: {error}"))?;
    let source_hash = format!("{:x}", Sha256::digest(canonical));

    Ok(SourceSnapshot {
        project_root: project_root.clone(),
        publishing_path: project_root.join("publishing.json"),
        project_title: metadata.project_name.clone(),
        project_type: metadata.project_type,
        payload: ExportPayload {
            project_name: project_name.to_string(),
            nodes: export_nodes,
            options: ExportOptions {
                title: metadata.project_name,
                author: String::new(),
                front_matter: None,
                back_matter: None,
            },
        },
        source_hash,
    })
}

fn validate_file_id(file_id: &str, node_id: i64, title: &str) -> Result<(), String> {
    if file_id.is_empty()
        || file_id.contains('/')
        || file_id.contains('\\')
        || file_id == "."
        || file_id == ".."
    {
        Err(format!(
            "File \"{title}\" (node {node_id}) has invalid file ID {file_id:?}"
        ))
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn rejects_project_path_traversal() {
        assert!(validate_project_name("../Draft").is_err());
        assert!(validate_project_name("folder/Draft").is_err());
        assert!(validate_project_name("Draft").is_ok());
    }

    #[test]
    fn source_loader_distinguishes_absent_content_from_empty_content() {
        let app_data =
            env::temp_dir().join(format!("wm9000-source-{}", uuid::Uuid::new_v4().simple()));
        let root = project_root(&app_data, "Draft").unwrap();
        fs::create_dir_all(&root).unwrap();
        fs::write(
            root.join("metadata.json"),
            r#"{"projectName":"Draft","projectType":"novel","treeData":[{"id":1,"parent":0,"text":"One","data":{"fileType":"file","fileId":"one"}}]}"#,
        )
        .unwrap();
        fs::write(root.join("one.json"), r#"{"content":""}"#).unwrap();

        let snapshot = load_snapshot(&app_data, "Draft").unwrap();
        assert_eq!(snapshot.payload.nodes[0].content.as_deref(), Some(""));

        fs::write(root.join("one.json"), "{}").unwrap();
        assert!(load_snapshot(&app_data, "Draft")
            .unwrap_err()
            .contains("no content field"));

        let _ = fs::remove_dir_all(app_data);
    }

    #[test]
    fn source_hash_is_stable_and_changes_with_content_or_tree_order() {
        let app_data =
            env::temp_dir().join(format!("wm9000-source-{}", uuid::Uuid::new_v4().simple()));
        let root = project_root(&app_data, "Draft").unwrap();
        fs::create_dir_all(&root).unwrap();
        let metadata = r#"{"projectName":"Draft","projectType":"novel","treeData":[{"id":1,"parent":0,"text":"One","data":{"fileType":"file","fileId":"one"}},{"id":2,"parent":0,"text":"Two","data":{"fileType":"file","fileId":"two"}}]}"#;
        fs::write(root.join("metadata.json"), metadata).unwrap();
        fs::write(root.join("one.json"), r#"{"content":"First"}"#).unwrap();
        fs::write(root.join("two.json"), r#"{"content":"Second"}"#).unwrap();

        let first = load_snapshot(&app_data, "Draft").unwrap().source_hash;
        let repeated = load_snapshot(&app_data, "Draft").unwrap().source_hash;
        assert_eq!(first, repeated);

        fs::write(root.join("two.json"), r#"{"content":"Changed"}"#).unwrap();
        let changed_content = load_snapshot(&app_data, "Draft").unwrap().source_hash;
        assert_ne!(first, changed_content);

        fs::write(root.join("two.json"), r#"{"content":"Second"}"#).unwrap();
        fs::write(
            root.join("metadata.json"),
            metadata.replace(
                r#"{"id":1,"parent":0,"text":"One","data":{"fileType":"file","fileId":"one"}},{"id":2,"parent":0,"text":"Two","data":{"fileType":"file","fileId":"two"}}"#,
                r#"{"id":2,"parent":0,"text":"Two","data":{"fileType":"file","fileId":"two"}},{"id":1,"parent":0,"text":"One","data":{"fileType":"file","fileId":"one"}}"#,
            ),
        )
        .unwrap();
        let changed_order = load_snapshot(&app_data, "Draft").unwrap().source_hash;
        assert_ne!(first, changed_order);

        let _ = fs::remove_dir_all(app_data);
    }

    #[test]
    #[ignore = "validates generated Dev_Projects when WM_PUBLISH_QA_APP_DATA is set"]
    fn generated_publish_qa_sources_match_expected_successes_and_failures() {
        use crate::publishing::config::{load_or_default, PublishingConfig};
        use crate::publishing::preflight::{
            has_blocking_diagnostics, run_epub_source_preflight, run_preflight,
        };
        use crate::publishing::project_types::apply_project_strategy;
        use crate::publishing::request::{
            PublicationScope, PublishFormat, PublishMetadataOverrides,
        };

        fn request_metadata(config: &PublishingConfig) -> PublishMetadataOverrides {
            PublishMetadataOverrides {
                title: config.book_metadata.title.clone(),
                subtitle: config.book_metadata.subtitle.clone(),
                author: config.book_metadata.author.clone(),
                language: config.book_metadata.language.clone(),
                front_matter: config.book_metadata.front_matter.clone(),
                back_matter: config.book_metadata.back_matter.clone(),
                contact: config.book_metadata.contact.clone(),
                ebook: config.book_metadata.ebook.clone(),
            }
        }

        let app_data = env::var_os("WM_PUBLISH_QA_APP_DATA")
            .map(PathBuf::from)
            .expect("WM_PUBLISH_QA_APP_DATA must point to the WordsMaker9000 app-data root");
        let successful_projects = [
            "Publish QA 01 - Novel Structure",
            "Publish QA 02 - Novella Root Chapters",
            "Publish QA 03 - Collection Scopes",
            "Publish QA 04 - Serial Scopes",
            "Publish QA 05 - Format Inclusion",
            "Publish QA 06 - Formatting and Unicode",
            "Publish QA 92 - Expected Failure - Empty Scope",
            "Publish QA 93 - Expected EPUB Failure - Missing Cover",
        ];

        for project_name in successful_projects {
            let mut snapshot = load_snapshot(&app_data, project_name)
                .unwrap_or_else(|error| panic!("{project_name}: source load failed: {error}"));
            let config = load_or_default(
                &snapshot.publishing_path,
                snapshot.project_type,
                &snapshot.project_title,
            )
            .unwrap_or_else(|error| panic!("{project_name}: config load failed: {error}"));
            let metadata = request_metadata(&config);
            snapshot.payload.options.title = metadata.title.clone();
            snapshot.payload.options.author = metadata.author.clone();
            snapshot.payload.options.front_matter = metadata.front_matter.clone();
            snapshot.payload.options.back_matter = metadata.back_matter.clone();
            let mut document = crate::publishing::compiler::compile(&snapshot.payload)
                .unwrap_or_else(|error| panic!("{project_name}: compile failed: {error}"));
            apply_project_strategy(
                &mut document,
                snapshot.project_type,
                &config.node_roles,
                &PublicationScope::FullProject,
                true,
            )
            .unwrap_or_else(|error| panic!("{project_name}: strategy failed: {error}"));

            if project_name.contains("Empty Scope") {
                let diagnostics = run_preflight(&document, PublishFormat::Pdf, &metadata, true);
                assert!(
                    diagnostics
                        .iter()
                        .any(|diagnostic| diagnostic.code == "PUBLISH_EMPTY_SCOPE"),
                    "{project_name}: expected PUBLISH_EMPTY_SCOPE"
                );
                continue;
            }
            if project_name.contains("Missing Cover") {
                let diagnostics =
                    run_epub_source_preflight(&document, &metadata, &snapshot.project_root);
                assert!(
                    diagnostics
                        .iter()
                        .any(|diagnostic| diagnostic.code == "EPUB_COVER_MISSING"),
                    "{project_name}: expected EPUB_COVER_MISSING"
                );
                continue;
            }

            for format in [PublishFormat::Pdf, PublishFormat::Docx, PublishFormat::Epub] {
                let diagnostics = run_preflight(&document, format, &metadata, true);
                assert!(
                    !has_blocking_diagnostics(&diagnostics),
                    "{project_name}: {format:?} preflight blocked: {diagnostics:?}"
                );
            }
            let diagnostics =
                run_epub_source_preflight(&document, &metadata, &snapshot.project_root);
            assert!(
                !has_blocking_diagnostics(&diagnostics),
                "{project_name}: EPUB source preflight blocked: {diagnostics:?}"
            );
        }

        let unsupported = load_snapshot(
            &app_data,
            "Publish QA 90 - Expected Failure - Unsupported HTML",
        )
        .expect("unsupported-HTML fixture should load before compilation");
        let error = crate::publishing::compiler::compile(&unsupported.payload)
            .expect_err("unsupported-HTML fixture should fail compilation");
        assert!(error.contains("Unsupported Table"));
        assert!(error.contains("<table>"));

        let error = load_snapshot(
            &app_data,
            "Publish QA 91 - Expected Failure - Missing Source",
        )
        .expect_err("missing-source fixture should fail snapshot loading");
        assert!(error.contains("Missing Source File"));
        assert!(error.contains("node 1"));
    }
}
