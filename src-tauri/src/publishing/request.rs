use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::model::{SectionInclusion, SectionRole};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ProjectType {
    Novel,
    Novella,
    Collection,
    Serial,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum PublishFormat {
    Pdf,
    Docx,
    Epub,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum DocxProfileId {
    StandardManuscript,
    CleanHandoff,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum PdfProfileId {
    ProofPdf,
    PrintInterior,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum PrintTrimSize {
    FiveByEight,
    FivePointTwoFiveByEight,
    FivePointFiveByEightPointFive,
    SixByNine,
}

impl Default for PrintTrimSize {
    fn default() -> Self {
        Self::SixByNine
    }
}

impl PrintTrimSize {
    pub(crate) fn dimensions_inches(self) -> (f64, f64) {
        match self {
            Self::FiveByEight => (5.0, 8.0),
            Self::FivePointTwoFiveByEight => (5.25, 8.0),
            Self::FivePointFiveByEightPointFive => (5.5, 8.5),
            Self::SixByNine => (6.0, 9.0),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ChapterStartSide {
    NextPage,
    Recto,
}

impl Default for ChapterStartSide {
    fn default() -> Self {
        Self::Recto
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub(crate) struct PrintInteriorPdfSettings {
    pub trim_size: PrintTrimSize,
    pub top_margin_inches: f64,
    pub bottom_margin_inches: f64,
    pub inside_margin_inches: f64,
    pub outside_margin_inches: f64,
    pub gutter_inches: f64,
    pub chapter_start: ChapterStartSide,
    pub running_headers: bool,
    pub front_matter_page_numbers: bool,
    pub body_page_numbers: bool,
}

impl Default for PrintInteriorPdfSettings {
    fn default() -> Self {
        Self {
            trim_size: PrintTrimSize::SixByNine,
            top_margin_inches: 0.75,
            bottom_margin_inches: 0.75,
            inside_margin_inches: 0.75,
            outside_margin_inches: 0.625,
            gutter_inches: 0.125,
            chapter_start: ChapterStartSide::Recto,
            running_headers: true,
            front_matter_page_numbers: true,
            body_page_numbers: true,
        }
    }
}

impl PrintInteriorPdfSettings {
    pub(crate) fn validation_errors(&self) -> Vec<String> {
        let mut errors = Vec::new();
        for (label, value) in [
            ("top margin", self.top_margin_inches),
            ("bottom margin", self.bottom_margin_inches),
            ("inside margin", self.inside_margin_inches),
            ("outside margin", self.outside_margin_inches),
        ] {
            if !value.is_finite() || !(0.25..=2.0).contains(&value) {
                errors.push(format!("{label} must be between 0.25 and 2 inches"));
            }
        }
        if !self.gutter_inches.is_finite() || !(0.0..=1.0).contains(&self.gutter_inches) {
            errors.push("gutter must be between 0 and 1 inch".to_string());
        }

        let (width, height) = self.trim_size.dimensions_inches();
        let body_width =
            width - self.inside_margin_inches - self.outside_margin_inches - self.gutter_inches;
        if !body_width.is_finite() || body_width < 2.0 {
            errors.push(
                "inside, outside, and gutter settings leave too little page width".to_string(),
            );
        }
        let body_height = height - self.top_margin_inches - self.bottom_margin_inches;
        if !body_height.is_finite() || body_height < 2.0 {
            errors.push("top and bottom margins leave too little page height".to_string());
        }
        errors
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub(crate) enum PublicationScope {
    FullProject,
    SelectedNodes { node_ids: Vec<i64> },
    SingleWork { node_id: i64 },
    SingleInstallment { node_id: i64 },
    Volume { node_id: i64 },
}

impl Default for PublicationScope {
    fn default() -> Self {
        Self::FullProject
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct ContactInformation {
    pub author_name: String,
    pub email: String,
    pub phone: String,
    pub mailing_address: String,
    pub header_surname: String,
    pub short_title: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum PageProgressionDirection {
    LeftToRight,
    RightToLeft,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct EbookCover {
    pub source: String,
    pub alt_text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct EbookMetadata {
    pub identifier: Option<String>,
    pub publisher: Option<String>,
    pub description: Option<String>,
    pub rights: Option<String>,
    pub cover: Option<EbookCover>,
    pub page_progression_direction: Option<PageProgressionDirection>,
    #[serde(default = "default_include_shared_matter")]
    pub include_front_matter: bool,
    #[serde(default = "default_include_shared_matter")]
    pub include_back_matter: bool,
}

impl Default for EbookMetadata {
    fn default() -> Self {
        Self {
            identifier: None,
            publisher: None,
            description: None,
            rights: None,
            cover: None,
            page_progression_direction: None,
            include_front_matter: true,
            include_back_matter: true,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct PublishMetadataOverrides {
    pub title: String,
    pub subtitle: Option<String>,
    pub author: String,
    pub language: Option<String>,
    pub front_matter: Option<String>,
    pub back_matter: Option<String>,
    pub contact: ContactInformation,
    #[serde(default)]
    pub ebook: EbookMetadata,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct NodePublishingOverride {
    pub role: SectionRole,
    pub inclusion: SectionInclusion,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct PublishRequest {
    pub export_id: String,
    pub project_name: String,
    pub project_type: ProjectType,
    #[serde(default)]
    pub scope: PublicationScope,
    pub format: PublishFormat,
    pub profile_id: String,
    #[serde(default)]
    pub pdf_settings: PrintInteriorPdfSettings,
    pub metadata: PublishMetadataOverrides,
    #[serde(default)]
    pub node_overrides: HashMap<String, NodePublishingOverride>,
    #[serde(default)]
    pub outline_confirmed: bool,
    #[serde(default = "default_include_shared_matter")]
    pub include_shared_matter: bool,
    pub destination: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub(crate) struct PublishRecipe {
    pub project_type: ProjectType,
    #[serde(default)]
    pub scope: PublicationScope,
    pub format: PublishFormat,
    pub profile_id: String,
    #[serde(default)]
    pub pdf_settings: PrintInteriorPdfSettings,
    pub metadata: PublishMetadataOverrides,
    #[serde(default)]
    pub node_overrides: HashMap<String, NodePublishingOverride>,
    #[serde(default)]
    pub outline_confirmed: bool,
    #[serde(default = "default_include_shared_matter")]
    pub include_shared_matter: bool,
}

impl PublishRecipe {
    pub(crate) fn from_request(request: &PublishRequest) -> Self {
        Self {
            project_type: request.project_type,
            scope: request.scope.clone(),
            format: request.format,
            profile_id: request.profile_id.clone(),
            pdf_settings: request.pdf_settings.clone(),
            metadata: request.metadata.clone(),
            node_overrides: request.node_overrides.clone(),
            outline_confirmed: request.outline_confirmed,
            include_shared_matter: request.include_shared_matter,
        }
    }

    pub(crate) fn into_request(
        self,
        export_id: String,
        project_name: String,
        destination: Option<String>,
    ) -> PublishRequest {
        PublishRequest {
            export_id,
            project_name,
            project_type: self.project_type,
            scope: self.scope,
            format: self.format,
            profile_id: self.profile_id,
            pdf_settings: self.pdf_settings,
            metadata: self.metadata,
            node_overrides: self.node_overrides,
            outline_confirmed: self.outline_confirmed,
            include_shared_matter: self.include_shared_matter,
            destination,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub(crate) struct SavedPublishingProfile {
    pub id: String,
    pub name: String,
    pub recipe: PublishRecipe,
}

fn default_include_shared_matter() -> bool {
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn print_trim_presets_have_exact_dimensions() {
        assert_eq!(PrintTrimSize::FiveByEight.dimensions_inches(), (5.0, 8.0));
        assert_eq!(
            PrintTrimSize::FivePointTwoFiveByEight.dimensions_inches(),
            (5.25, 8.0)
        );
        assert_eq!(
            PrintTrimSize::FivePointFiveByEightPointFive.dimensions_inches(),
            (5.5, 8.5)
        );
        assert_eq!(PrintTrimSize::SixByNine.dimensions_inches(), (6.0, 9.0));
    }

    #[test]
    fn default_print_settings_are_valid_and_round_trip() {
        let settings = PrintInteriorPdfSettings::default();
        assert!(settings.validation_errors().is_empty());

        let serialized = serde_json::to_string(&settings).unwrap();
        assert_eq!(
            serde_json::from_str::<PrintInteriorPdfSettings>(&serialized).unwrap(),
            settings
        );
    }

    #[test]
    fn publish_recipe_round_trips_without_job_or_destination_identity() {
        let request = PublishRequest {
            export_id: uuid::Uuid::new_v4().to_string(),
            project_name: "Draft".to_string(),
            project_type: ProjectType::Novel,
            scope: PublicationScope::SelectedNodes { node_ids: vec![7] },
            format: PublishFormat::Docx,
            profile_id: "clean_handoff".to_string(),
            pdf_settings: PrintInteriorPdfSettings::default(),
            metadata: PublishMetadataOverrides {
                title: "The Draft".to_string(),
                author: "Author Name".to_string(),
                ..PublishMetadataOverrides::default()
            },
            node_overrides: HashMap::new(),
            outline_confirmed: true,
            include_shared_matter: false,
            destination: Some("old.docx".to_string()),
        };

        let recipe = PublishRecipe::from_request(&request);
        let replayed = recipe.clone().into_request(
            "new-export".to_string(),
            "Draft".to_string(),
            Some("new.docx".to_string()),
        );

        assert_eq!(PublishRecipe::from_request(&replayed), recipe);
        assert_eq!(replayed.export_id, "new-export");
        assert_eq!(replayed.destination.as_deref(), Some("new.docx"));
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum DiagnosticSeverity {
    Error,
    Warning,
    Info,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct Diagnostic {
    pub code: String,
    pub severity: DiagnosticSeverity,
    pub message: String,
    pub node_id: Option<i64>,
    pub remediation: Option<String>,
}

impl Diagnostic {
    pub(crate) fn error(
        code: &str,
        message: impl Into<String>,
        node_id: Option<i64>,
        remediation: impl Into<Option<String>>,
    ) -> Self {
        Self {
            code: code.to_string(),
            severity: DiagnosticSeverity::Error,
            message: message.into(),
            node_id,
            remediation: remediation.into(),
        }
    }

    pub(crate) fn warning(
        code: &str,
        message: impl Into<String>,
        node_id: Option<i64>,
        remediation: impl Into<Option<String>>,
    ) -> Self {
        Self {
            code: code.to_string(),
            severity: DiagnosticSeverity::Warning,
            message: message.into(),
            node_id,
            remediation: remediation.into(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum PublishPhase {
    Snapshot,
    Compile,
    Preflight,
    Render,
    Validate,
    Copy,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct PublishProgress {
    pub export_id: String,
    pub phase: PublishPhase,
    pub message: String,
    pub current: usize,
    pub total: usize,
    pub severity: DiagnosticSeverity,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct PublishResult {
    pub export_id: String,
    pub manifest_path: String,
    pub primary_artifact_path: String,
    pub diagnostics: Vec<Diagnostic>,
}
