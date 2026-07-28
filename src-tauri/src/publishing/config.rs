use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::Path;

use super::request::{
    ContactInformation, NodePublishingOverride, ProjectType, PublishMetadataOverrides,
};

pub(crate) const PUBLISHING_SCHEMA_VERSION: u32 = 1;
pub(crate) const STRATEGY_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct ProjectTypeStrategyConfig {
    pub project_type: ProjectType,
    pub version: u32,
    pub confirmed: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct PublishingBookMetadata {
    pub title: String,
    pub subtitle: Option<String>,
    pub author: String,
    pub language: Option<String>,
    pub front_matter: Option<String>,
    pub back_matter: Option<String>,
    pub contact: ContactInformation,
}

impl From<&PublishMetadataOverrides> for PublishingBookMetadata {
    fn from(value: &PublishMetadataOverrides) -> Self {
        Self {
            title: value.title.clone(),
            subtitle: value.subtitle.clone(),
            author: value.author.clone(),
            language: value.language.clone(),
            front_matter: value.front_matter.clone(),
            back_matter: value.back_matter.clone(),
            contact: value.contact.clone(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub(crate) struct PublishingConfig {
    pub schema_version: u32,
    pub project_type_strategy: ProjectTypeStrategyConfig,
    pub book_metadata: PublishingBookMetadata,
    pub node_roles: HashMap<String, NodePublishingOverride>,
    pub profiles: HashMap<String, serde_json::Value>,
    pub default_profile_by_format: HashMap<String, String>,
}

impl PublishingConfig {
    pub(crate) fn defaults(project_type: ProjectType, project_title: &str) -> Self {
        Self {
            schema_version: PUBLISHING_SCHEMA_VERSION,
            project_type_strategy: ProjectTypeStrategyConfig {
                project_type,
                version: STRATEGY_VERSION,
                confirmed: false,
            },
            book_metadata: PublishingBookMetadata {
                title: project_title.to_string(),
                ..PublishingBookMetadata::default()
            },
            node_roles: HashMap::new(),
            profiles: HashMap::new(),
            default_profile_by_format: HashMap::from([
                ("pdf".to_string(), "proof_pdf".to_string()),
                ("docx".to_string(), "standard_manuscript".to_string()),
            ]),
        }
    }

    pub(crate) fn merge_request(
        &mut self,
        metadata: &PublishMetadataOverrides,
        node_roles: &HashMap<String, NodePublishingOverride>,
        confirmed: bool,
    ) {
        self.book_metadata = PublishingBookMetadata::from(metadata);
        self.node_roles = node_roles.clone();
        self.project_type_strategy.confirmed = confirmed;
    }
}

pub(crate) fn load_or_default(
    path: &Path,
    project_type: ProjectType,
    project_title: &str,
) -> Result<PublishingConfig, String> {
    if !path.exists() {
        return Ok(PublishingConfig::defaults(project_type, project_title));
    }

    let content = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read {}: {error}", path.display()))?;
    let mut config: PublishingConfig = serde_json::from_str(&content)
        .map_err(|error| format!("Invalid publishing configuration: {error}"))?;
    if config.schema_version != PUBLISHING_SCHEMA_VERSION {
        return Err(format!(
            "Unsupported publishing.json schema version {}; expected {}",
            config.schema_version, PUBLISHING_SCHEMA_VERSION
        ));
    }
    if config.project_type_strategy.version > STRATEGY_VERSION {
        return Err(format!(
            "Unsupported publishing strategy version {}; expected at most {}",
            config.project_type_strategy.version, STRATEGY_VERSION
        ));
    }
    if config.project_type_strategy.version < STRATEGY_VERSION
        || config.project_type_strategy.project_type != project_type
    {
        config.project_type_strategy = ProjectTypeStrategyConfig {
            project_type,
            version: STRATEGY_VERSION,
            confirmed: false,
        };
    }
    Ok(config)
}

pub(crate) fn save_atomic(path: &Path, config: &PublishingConfig) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "publishing.json has no parent directory".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Failed to create publishing directory: {error}"))?;

    let serialized = serde_json::to_string_pretty(config)
        .map_err(|error| format!("Failed to serialize publishing configuration: {error}"))?;
    let mut temp = tempfile::NamedTempFile::new_in(parent)
        .map_err(|error| format!("Failed to create temporary publishing configuration: {error}"))?;
    temp.write_all(serialized.as_bytes())
        .map_err(|error| format!("Failed to write temporary publishing configuration: {error}"))?;
    temp.as_file()
        .sync_all()
        .map_err(|error| format!("Failed to sync publishing configuration: {error}"))?;
    temp.persist(path)
        .map(|_| ())
        .map_err(|error| format!("Failed to atomically commit publishing configuration: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn absent_config_uses_lazy_schema_defaults_without_writing() {
        let path = env::temp_dir().join(format!(
            "wm9000-config-{}.json",
            uuid::Uuid::new_v4().simple()
        ));
        let config = load_or_default(&path, ProjectType::Novel, "Draft").unwrap();

        assert_eq!(config.schema_version, 1);
        assert_eq!(config.book_metadata.title, "Draft");
        assert!(!config.project_type_strategy.confirmed);
        assert!(!path.exists());
    }

    #[test]
    fn atomic_save_round_trips_and_rejects_unknown_schema() {
        let root = env::temp_dir().join(format!("wm9000-config-{}", uuid::Uuid::new_v4().simple()));
        let path = root.join("publishing.json");
        let config = PublishingConfig::defaults(ProjectType::Collection, "Stories");
        save_atomic(&path, &config).unwrap();

        assert_eq!(
            load_or_default(&path, ProjectType::Collection, "Ignored").unwrap(),
            config
        );

        let migrated = load_or_default(&path, ProjectType::Serial, "Ignored").unwrap();
        assert_eq!(
            migrated.project_type_strategy.project_type,
            ProjectType::Serial
        );
        assert!(!migrated.project_type_strategy.confirmed);

        let mut invalid = config;
        invalid.schema_version = 99;
        save_atomic(&path, &invalid).unwrap();
        assert!(load_or_default(&path, ProjectType::Novel, "Ignored")
            .unwrap_err()
            .contains("schema version 99"));

        let _ = fs::remove_dir_all(root);
    }
}
