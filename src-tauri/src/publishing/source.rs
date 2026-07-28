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
}
