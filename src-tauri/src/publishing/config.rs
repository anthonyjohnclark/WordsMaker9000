use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::Path;

use super::request::{
    ContactInformation, NodePublishingOverride, PrintInteriorPdfSettings, ProjectType,
    PublishFormat, PublishMetadataOverrides,
};

pub(crate) const PUBLISHING_SCHEMA_VERSION: u32 = 3;
pub(crate) const STRATEGY_VERSION: u32 = 1;
pub(crate) const PRINT_INTERIOR_PROFILE_ID: &str = "print_interior";

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
    #[serde(default)]
    pub ebook: super::request::EbookMetadata,
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
            ebook: value.ebook.clone(),
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
        let print_interior = serde_json::to_value(PrintInteriorPdfSettings::default())
            .expect("default print settings must serialize");
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
            profiles: HashMap::from([(PRINT_INTERIOR_PROFILE_ID.to_string(), print_interior)]),
            default_profile_by_format: HashMap::from([
                ("pdf".to_string(), "proof_pdf".to_string()),
                ("docx".to_string(), "standard_manuscript".to_string()),
                ("epub".to_string(), "reflowable_epub".to_string()),
            ]),
        }
    }

    pub(crate) fn merge_request(
        &mut self,
        metadata: &PublishMetadataOverrides,
        node_roles: &HashMap<String, NodePublishingOverride>,
        confirmed: bool,
        format: PublishFormat,
        profile_id: &str,
        pdf_settings: &PrintInteriorPdfSettings,
    ) {
        self.book_metadata = PublishingBookMetadata::from(metadata);
        self.node_roles = node_roles.clone();
        self.project_type_strategy.confirmed = confirmed;
        if format == PublishFormat::Pdf && profile_id == PRINT_INTERIOR_PROFILE_ID {
            self.profiles.insert(
                PRINT_INTERIOR_PROFILE_ID.to_string(),
                serde_json::to_value(pdf_settings)
                    .expect("validated print interior settings must serialize"),
            );
        }
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
    if config.schema_version == 0 || config.schema_version > PUBLISHING_SCHEMA_VERSION {
        return Err(format!(
            "Unsupported publishing.json schema version {}; expected {}",
            config.schema_version, PUBLISHING_SCHEMA_VERSION
        ));
    }
    if config.schema_version < PUBLISHING_SCHEMA_VERSION {
        config.schema_version = PUBLISHING_SCHEMA_VERSION;
    }
    config
        .default_profile_by_format
        .entry("epub".to_string())
        .or_insert_with(|| "reflowable_epub".to_string());
    config
        .default_profile_by_format
        .entry("pdf".to_string())
        .or_insert_with(|| "proof_pdf".to_string());
    config
        .default_profile_by_format
        .entry("docx".to_string())
        .or_insert_with(|| "standard_manuscript".to_string());
    config
        .profiles
        .entry(PRINT_INTERIOR_PROFILE_ID.to_string())
        .or_insert_with(|| {
            serde_json::to_value(PrintInteriorPdfSettings::default())
                .expect("default print settings must serialize")
        });
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

        assert_eq!(config.schema_version, PUBLISHING_SCHEMA_VERSION);
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

    #[test]
    fn legacy_configuration_migrates_format_and_print_defaults_in_memory() {
        let root = env::temp_dir().join(format!("wm9000-config-{}", uuid::Uuid::new_v4().simple()));
        let path = root.join("publishing.json");
        let mut config = PublishingConfig::defaults(ProjectType::Novel, "Draft");
        config.schema_version = 2;
        config.default_profile_by_format.remove("epub");
        config.default_profile_by_format.remove("pdf");
        config.default_profile_by_format.remove("docx");
        config.profiles.remove(PRINT_INTERIOR_PROFILE_ID);
        let mut legacy = serde_json::to_value(config).unwrap();
        legacy["book_metadata"]
            .as_object_mut()
            .unwrap()
            .remove("ebook");
        fs::create_dir_all(&root).unwrap();
        fs::write(&path, serde_json::to_vec_pretty(&legacy).unwrap()).unwrap();

        let migrated = load_or_default(&path, ProjectType::Novel, "Draft").unwrap();
        assert_eq!(migrated.schema_version, PUBLISHING_SCHEMA_VERSION);
        assert_eq!(
            migrated.default_profile_by_format.get("epub"),
            Some(&"reflowable_epub".to_string())
        );
        assert_eq!(
            migrated.default_profile_by_format.get("pdf"),
            Some(&"proof_pdf".to_string())
        );
        assert_eq!(
            migrated.default_profile_by_format.get("docx"),
            Some(&"standard_manuscript".to_string())
        );
        assert_eq!(
            serde_json::from_value::<PrintInteriorPdfSettings>(
                migrated.profiles[PRINT_INTERIOR_PROFILE_ID].clone()
            )
            .unwrap(),
            PrintInteriorPdfSettings::default()
        );
        assert!(migrated.book_metadata.ebook.include_front_matter);
        assert!(migrated.book_metadata.ebook.include_back_matter);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn successful_print_request_persists_its_profile_settings() {
        let mut config = PublishingConfig::defaults(ProjectType::Novel, "Draft");
        let mut settings = PrintInteriorPdfSettings::default();
        settings.trim_size =
            crate::publishing::request::PrintTrimSize::FivePointFiveByEightPointFive;
        settings.gutter_inches = 0.25;

        config.merge_request(
            &PublishMetadataOverrides::default(),
            &HashMap::new(),
            true,
            PublishFormat::Pdf,
            PRINT_INTERIOR_PROFILE_ID,
            &settings,
        );

        assert_eq!(
            serde_json::from_value::<PrintInteriorPdfSettings>(
                config.profiles[PRINT_INTERIOR_PROFILE_ID].clone()
            )
            .unwrap(),
            settings
        );
    }
}
