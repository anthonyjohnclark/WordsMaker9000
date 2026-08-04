use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};

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
    LargePrint,
    Hardcover,
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum LargePrintTrimSize {
    SixByNine,
    SevenByTen,
    EightByTen,
}

impl Default for LargePrintTrimSize {
    fn default() -> Self {
        Self::SevenByTen
    }
}

impl LargePrintTrimSize {
    pub(crate) fn dimensions_inches(self) -> (f64, f64) {
        match self {
            Self::SixByNine => (6.0, 9.0),
            Self::SevenByTen => (7.0, 10.0),
            Self::EightByTen => (8.0, 10.0),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub(crate) struct LargePrintPdfSettings {
    pub trim_size: LargePrintTrimSize,
    pub top_margin_inches: f64,
    pub bottom_margin_inches: f64,
    pub inside_margin_inches: f64,
    pub outside_margin_inches: f64,
    pub gutter_inches: f64,
    pub base_font_size_points: f64,
    pub line_spacing: f64,
    pub max_line_length_characters: f64,
    pub heading_scale: f64,
    pub paragraph_spacing_points: f64,
    pub running_headers: bool,
    pub front_matter_page_numbers: bool,
    pub body_page_numbers: bool,
    pub page_furniture_size_points: f64,
}

impl Default for LargePrintPdfSettings {
    fn default() -> Self {
        Self {
            trim_size: LargePrintTrimSize::SevenByTen,
            top_margin_inches: 0.75,
            bottom_margin_inches: 0.75,
            inside_margin_inches: 0.8,
            outside_margin_inches: 0.7,
            gutter_inches: 0.15,
            base_font_size_points: 16.0,
            line_spacing: 1.5,
            max_line_length_characters: 50.0,
            heading_scale: 1.5,
            paragraph_spacing_points: 6.0,
            running_headers: true,
            front_matter_page_numbers: true,
            body_page_numbers: true,
            page_furniture_size_points: 11.0,
        }
    }
}

impl LargePrintPdfSettings {
    pub(crate) fn effective_horizontal_margins_inches(&self) -> (f64, f64) {
        let (width, _) = self.trim_size.dimensions_inches();
        let inside = self.inside_margin_inches + self.gutter_inches;
        let available = width - inside - self.outside_margin_inches;
        // A deterministic 0.45em average glyph estimate caps the text measure
        // without claiming exact character counts for proportional type.
        let requested = self.max_line_length_characters * self.base_font_size_points * 0.45 / 72.0;
        let padding = ((available - requested) / 2.0).max(0.0);
        (inside + padding, self.outside_margin_inches + padding)
    }

    pub(crate) fn validation_errors(&self) -> Vec<String> {
        let mut errors = Vec::new();
        for (label, value) in [
            ("top margin", self.top_margin_inches),
            ("bottom margin", self.bottom_margin_inches),
            ("inside margin", self.inside_margin_inches),
            ("outside margin", self.outside_margin_inches),
        ] {
            if !value.is_finite() || !(0.5..=2.0).contains(&value) {
                errors.push(format!("{label} must be between 0.5 and 2 inches"));
            }
        }
        if !self.gutter_inches.is_finite() || !(0.0..=1.0).contains(&self.gutter_inches) {
            errors.push("gutter must be between 0 and 1 inch".to_string());
        }
        if !self.base_font_size_points.is_finite()
            || !(14.0..=24.0).contains(&self.base_font_size_points)
        {
            errors.push("base type size must be between 14 and 24 points".to_string());
        }
        if !self.line_spacing.is_finite() || !(1.2..=2.0).contains(&self.line_spacing) {
            errors.push("line spacing must be between 1.2 and 2.0".to_string());
        }
        if !self.max_line_length_characters.is_finite()
            || self.max_line_length_characters.fract() != 0.0
            || !(35.0..=65.0).contains(&self.max_line_length_characters)
        {
            errors.push("maximum line length must be between 35 and 65 characters".to_string());
        }
        if !self.heading_scale.is_finite() || !(1.2..=2.0).contains(&self.heading_scale) {
            errors.push("heading scale must be between 1.2 and 2.0".to_string());
        }
        if !self.paragraph_spacing_points.is_finite()
            || !(0.0..=18.0).contains(&self.paragraph_spacing_points)
        {
            errors.push("paragraph spacing must be between 0 and 18 points".to_string());
        }
        if !self.page_furniture_size_points.is_finite()
            || !(10.0..=18.0).contains(&self.page_furniture_size_points)
        {
            errors.push("page furniture must be between 10 and 18 points".to_string());
        } else if self.page_furniture_size_points > self.base_font_size_points {
            errors.push("page furniture cannot be larger than the body type".to_string());
        }

        let (_, height) = self.trim_size.dimensions_inches();
        let (inside, outside) = self.effective_horizontal_margins_inches();
        let (width, _) = self.trim_size.dimensions_inches();
        if !inside.is_finite() || !outside.is_finite() || width - inside - outside < 3.0 {
            errors.push("large-print geometry leaves too little page width".to_string());
        }
        if height - self.top_margin_inches - self.bottom_margin_inches < 4.0 {
            errors.push("large-print geometry leaves too little page height".to_string());
        }
        errors
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum HardcoverTrimSize {
    FivePointFiveByEightPointFive,
    SixByNine,
    SevenByTen,
}

impl Default for HardcoverTrimSize {
    fn default() -> Self {
        Self::SixByNine
    }
}

impl HardcoverTrimSize {
    pub(crate) fn dimensions_inches(self) -> (f64, f64) {
        match self {
            Self::FivePointFiveByEightPointFive => (5.5, 8.5),
            Self::SixByNine => (6.0, 9.0),
            Self::SevenByTen => (7.0, 10.0),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub(crate) struct HardcoverPdfSettings {
    pub trim_size: HardcoverTrimSize,
    pub top_margin_inches: f64,
    pub bottom_margin_inches: f64,
    pub inside_margin_inches: f64,
    pub outside_margin_inches: f64,
    pub gutter_inches: f64,
    pub chapter_start: ChapterStartSide,
    pub intentional_blank_pages: bool,
    pub running_headers: bool,
    pub front_matter_page_numbers: bool,
    pub body_page_numbers: bool,
}

impl Default for HardcoverPdfSettings {
    fn default() -> Self {
        Self {
            trim_size: HardcoverTrimSize::SixByNine,
            top_margin_inches: 0.875,
            bottom_margin_inches: 0.875,
            inside_margin_inches: 0.875,
            outside_margin_inches: 0.75,
            gutter_inches: 0.25,
            chapter_start: ChapterStartSide::Recto,
            intentional_blank_pages: true,
            running_headers: true,
            front_matter_page_numbers: true,
            body_page_numbers: true,
        }
    }
}

impl HardcoverPdfSettings {
    pub(crate) fn validation_errors(&self) -> Vec<String> {
        let mut errors = Vec::new();
        for (label, value, minimum) in [
            ("top margin", self.top_margin_inches, 0.625),
            ("bottom margin", self.bottom_margin_inches, 0.625),
            ("inside margin", self.inside_margin_inches, 0.625),
            ("outside margin", self.outside_margin_inches, 0.5),
        ] {
            if !value.is_finite() || !(minimum..=2.0).contains(&value) {
                errors.push(format!("{label} must be between {minimum} and 2 inches"));
            }
        }
        if !self.gutter_inches.is_finite() || !(0.125..=1.0).contains(&self.gutter_inches) {
            errors.push("hardcover gutter must be between 0.125 and 1 inch".to_string());
        }
        if self.inside_margin_inches + self.gutter_inches < 1.0 {
            errors.push("hardcover inside margin plus gutter must be at least 1 inch".to_string());
        }
        if self.chapter_start == ChapterStartSide::Recto && !self.intentional_blank_pages {
            errors.push("recto chapter starts require intentional blank verso pages".to_string());
        }
        let (width, height) = self.trim_size.dimensions_inches();
        let body_width =
            width - self.inside_margin_inches - self.outside_margin_inches - self.gutter_inches;
        if !body_width.is_finite() || body_width < 2.75 {
            errors.push("hardcover geometry leaves too little page width".to_string());
        }
        if height - self.top_margin_inches - self.bottom_margin_inches < 4.0 {
            errors.push("hardcover geometry leaves too little page height".to_string());
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
pub(crate) struct MatterTemplateSelection {
    pub template_id: String,
    pub template_version: u32,
    #[serde(default)]
    pub variables: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct MasterPageSelection {
    pub template_id: String,
    pub template_version: u32,
}

impl Default for MasterPageSelection {
    fn default() -> Self {
        Self {
            template_id: "profile_default".to_string(),
            template_version: 1,
        }
    }
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
    #[serde(default)]
    pub large_print_settings: LargePrintPdfSettings,
    #[serde(default)]
    pub hardcover_settings: HardcoverPdfSettings,
    pub metadata: PublishMetadataOverrides,
    #[serde(default)]
    pub node_overrides: HashMap<String, NodePublishingOverride>,
    #[serde(default)]
    pub outline_confirmed: bool,
    #[serde(default = "default_include_shared_matter")]
    pub include_shared_matter: bool,
    #[serde(default)]
    pub matter_templates: Vec<MatterTemplateSelection>,
    #[serde(default)]
    pub master_page: MasterPageSelection,
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
    #[serde(default)]
    pub large_print_settings: LargePrintPdfSettings,
    #[serde(default)]
    pub hardcover_settings: HardcoverPdfSettings,
    pub metadata: PublishMetadataOverrides,
    #[serde(default)]
    pub node_overrides: HashMap<String, NodePublishingOverride>,
    #[serde(default)]
    pub outline_confirmed: bool,
    #[serde(default = "default_include_shared_matter")]
    pub include_shared_matter: bool,
    #[serde(default)]
    pub matter_templates: Vec<MatterTemplateSelection>,
    #[serde(default)]
    pub master_page: MasterPageSelection,
}

impl PublishRecipe {
    pub(crate) fn from_request(request: &PublishRequest) -> Self {
        Self {
            project_type: request.project_type,
            scope: request.scope.clone(),
            format: request.format,
            profile_id: request.profile_id.clone(),
            pdf_settings: request.pdf_settings.clone(),
            large_print_settings: request.large_print_settings.clone(),
            hardcover_settings: request.hardcover_settings.clone(),
            metadata: request.metadata.clone(),
            node_overrides: request.node_overrides.clone(),
            outline_confirmed: request.outline_confirmed,
            include_shared_matter: request.include_shared_matter,
            matter_templates: request.matter_templates.clone(),
            master_page: request.master_page.clone(),
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
            large_print_settings: self.large_print_settings,
            hardcover_settings: self.hardcover_settings,
            metadata: self.metadata,
            node_overrides: self.node_overrides,
            outline_confirmed: self.outline_confirmed,
            include_shared_matter: self.include_shared_matter,
            matter_templates: self.matter_templates,
            master_page: self.master_page,
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
    fn advanced_pdf_defaults_are_valid_and_use_distinct_trim_catalogs() {
        let large_print = LargePrintPdfSettings::default();
        assert!(large_print.validation_errors().is_empty());
        assert_eq!(large_print.trim_size.dimensions_inches(), (7.0, 10.0));
        let (inside, outside) = large_print.effective_horizontal_margins_inches();
        assert!((inside - 1.125).abs() < f64::EPSILON);
        assert!((outside - 0.875).abs() < 1e-12);

        let hardcover = HardcoverPdfSettings::default();
        assert!(hardcover.validation_errors().is_empty());
        assert_eq!(hardcover.trim_size.dimensions_inches(), (6.0, 9.0));
    }

    #[test]
    fn advanced_pdf_preflight_enforces_legibility_and_binding_rules() {
        let mut large_print = LargePrintPdfSettings::default();
        large_print.base_font_size_points = 12.0;
        large_print.page_furniture_size_points = 9.0;
        assert_eq!(large_print.validation_errors().len(), 2);

        let mut hardcover = HardcoverPdfSettings::default();
        hardcover.gutter_inches = 0.0;
        hardcover.intentional_blank_pages = false;
        let errors = hardcover.validation_errors();
        assert!(errors
            .iter()
            .any(|error| error.contains("hardcover gutter")));
        assert!(errors
            .iter()
            .any(|error| error.contains("intentional blank verso")));
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
            large_print_settings: LargePrintPdfSettings::default(),
            hardcover_settings: HardcoverPdfSettings::default(),
            metadata: PublishMetadataOverrides {
                title: "The Draft".to_string(),
                author: "Author Name".to_string(),
                ..PublishMetadataOverrides::default()
            },
            node_overrides: HashMap::new(),
            outline_confirmed: true,
            include_shared_matter: false,
            matter_templates: vec![MatterTemplateSelection {
                template_id: "dedication".to_string(),
                template_version: 1,
                variables: BTreeMap::from([("text".to_string(), "For the reader".to_string())]),
            }],
            master_page: MasterPageSelection {
                template_id: "minimal_book".to_string(),
                template_version: 1,
            },
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
