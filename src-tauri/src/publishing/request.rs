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
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum DocxProfileId {
    StandardManuscript,
    CleanHandoff,
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

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct PublishMetadataOverrides {
    pub title: String,
    pub subtitle: Option<String>,
    pub author: String,
    pub language: Option<String>,
    pub front_matter: Option<String>,
    pub back_matter: Option<String>,
    pub contact: ContactInformation,
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
    pub metadata: PublishMetadataOverrides,
    #[serde(default)]
    pub node_overrides: HashMap<String, NodePublishingOverride>,
    #[serde(default)]
    pub outline_confirmed: bool,
    #[serde(default = "default_include_shared_matter")]
    pub include_shared_matter: bool,
    pub destination: Option<String>,
}

fn default_include_shared_matter() -> bool {
    true
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
