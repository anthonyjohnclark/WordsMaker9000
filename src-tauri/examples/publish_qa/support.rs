use std::fs;
use std::path::Path;

use chrono::Utc;
use serde::Serialize;

use crate::publishing::config::{load_or_default, PublishingConfig, PRINT_INTERIOR_PROFILE_ID};
use crate::publishing::request::{
    Diagnostic, PrintInteriorPdfSettings, PublicationScope, PublishFormat,
    PublishMetadataOverrides, PublishRequest,
};
use crate::publishing::service::{publish_blocking, PublishFailure};
use crate::publishing::source::load_snapshot;

const QA_PROJECTS: &[&str] = &[
    "Publish QA 01 - Novel Structure",
    "Publish QA 02 - Novella Root Chapters",
    "Publish QA 03 - Collection Scopes",
    "Publish QA 04 - Serial Scopes",
    "Publish QA 05 - Format Inclusion",
    "Publish QA 06 - Formatting and Unicode",
    "Publish QA 07 - Accessible Images",
    "Publish QA 90 - Expected Failure - Unsupported HTML",
    "Publish QA 91 - Expected Failure - Missing Source",
    "Publish QA 92 - Expected Failure - Empty Scope",
    "Publish QA 93 - Expected EPUB Failure - Missing Cover",
];

#[derive(Clone)]
struct Attempt {
    project: &'static str,
    scope_label: &'static str,
    scope: PublicationScope,
    format: PublishFormat,
    profile_id: &'static str,
    file_label: &'static str,
    extension: &'static str,
    expected_failure: Option<&'static str>,
}

#[derive(Debug)]
struct HarnessFailure {
    code: String,
    message: String,
    diagnostics: Vec<Diagnostic>,
}

#[derive(Debug, Serialize)]
struct QaReport {
    generated_at: String,
    source_app_data: String,
    output_directory: String,
    generated_artifacts: usize,
    expected_failures: usize,
    unexpected_results: usize,
    attempts: Vec<AttemptReport>,
}

#[derive(Debug, Serialize)]
struct AttemptReport {
    project: String,
    scope: String,
    format: String,
    profile_id: String,
    outcome: String,
    artifact: Option<String>,
    manifest: Option<String>,
    diagnostic_codes: Vec<String>,
    message: Option<String>,
}

pub(crate) fn generate_publish_qa_outputs(
    source_app_data: &Path,
    output_directory: &Path,
) -> Result<(), String> {
    prepare_empty_output_directory(output_directory)?;
    let source_projects = source_app_data.join(projects_directory_name());
    if !source_projects.is_dir() {
        return Err(format!(
            "Publish QA project directory does not exist: {}",
            source_projects.display()
        ));
    }

    let temporary_app_data = tempfile::tempdir()
        .map_err(|error| format!("Failed to create temporary QA app-data root: {error}"))?;
    let temporary_projects = temporary_app_data.path().join(projects_directory_name());
    fs::create_dir_all(&temporary_projects)
        .map_err(|error| format!("Failed to create temporary QA projects directory: {error}"))?;

    for project in QA_PROJECTS {
        let source = source_projects.join(project);
        if !source.is_dir() {
            return Err(format!(
                "Required Publish QA project is missing: {}",
                source.display()
            ));
        }
        copy_project(&source, &temporary_projects.join(project))?;
        let project_output = output_directory.join(safe_directory_name(project));
        fs::create_dir_all(&project_output).map_err(|error| {
            format!(
                "Failed to create QA output directory {}: {error}",
                project_output.display()
            )
        })?;
        let expectation = source.join("PUBLISH_QA_EXPECTATIONS.md");
        if expectation.is_file() {
            fs::copy(&expectation, project_output.join("EXPECTATIONS.md")).map_err(|error| {
                format!(
                    "Failed to copy {} into the inspection output: {error}",
                    expectation.display()
                )
            })?;
        }
    }

    let attempts = qa_attempts();
    let mut reports = Vec::with_capacity(attempts.len());
    let mut generated_artifacts = 0;
    let mut expected_failures = 0;
    let mut unexpected_results = 0;

    for attempt in attempts {
        let project_output = output_directory.join(safe_directory_name(attempt.project));
        fs::create_dir_all(&project_output).map_err(|error| {
            format!(
                "Failed to create QA output directory {}: {error}",
                project_output.display()
            )
        })?;
        let filename = format!(
            "{}--{}.{}",
            attempt.scope_label, attempt.file_label, attempt.extension
        );
        let destination = project_output.join(filename);
        let result = run_attempt(temporary_app_data.path(), &attempt, &destination);

        let report = match (result, attempt.expected_failure) {
            (Ok(result), None) => {
                let manifest_destination = destination
                    .with_file_name(format!("{}.manifest.json", file_name(&destination)));
                fs::copy(&result.manifest_path, &manifest_destination).map_err(|error| {
                    format!(
                        "Failed to copy QA manifest to {}: {error}",
                        manifest_destination.display()
                    )
                })?;
                generated_artifacts += 1;
                println!(
                    "GENERATED  {} / {} / {} -> {}",
                    attempt.project,
                    attempt.scope_label,
                    attempt.profile_id,
                    destination.display()
                );
                AttemptReport {
                    project: attempt.project.to_string(),
                    scope: attempt.scope_label.to_string(),
                    format: format_name(attempt.format).to_string(),
                    profile_id: attempt.profile_id.to_string(),
                    outcome: "generated".to_string(),
                    artifact: Some(relative_path(output_directory, &destination)),
                    manifest: Some(relative_path(output_directory, &manifest_destination)),
                    diagnostic_codes: diagnostic_codes(&result.diagnostics),
                    message: None,
                }
            }
            (Err(failure), Some(expected_code))
                if failure.code == expected_code
                    || failure
                        .diagnostics
                        .iter()
                        .any(|diagnostic| diagnostic.code == expected_code) =>
            {
                expected_failures += 1;
                println!(
                    "EXPECTED   {} / {} / {} -> {}",
                    attempt.project, attempt.scope_label, attempt.profile_id, expected_code
                );
                AttemptReport {
                    project: attempt.project.to_string(),
                    scope: attempt.scope_label.to_string(),
                    format: format_name(attempt.format).to_string(),
                    profile_id: attempt.profile_id.to_string(),
                    outcome: "expected_failure".to_string(),
                    artifact: None,
                    manifest: None,
                    diagnostic_codes: diagnostic_codes(&failure.diagnostics),
                    message: Some(failure.message),
                }
            }
            (Ok(result), Some(expected_code)) => {
                unexpected_results += 1;
                println!(
                    "UNEXPECTED {} / {} / {} succeeded; expected {}",
                    attempt.project, attempt.scope_label, attempt.profile_id, expected_code
                );
                AttemptReport {
                    project: attempt.project.to_string(),
                    scope: attempt.scope_label.to_string(),
                    format: format_name(attempt.format).to_string(),
                    profile_id: attempt.profile_id.to_string(),
                    outcome: "unexpected_success".to_string(),
                    artifact: destination
                        .is_file()
                        .then(|| relative_path(output_directory, &destination)),
                    manifest: None,
                    diagnostic_codes: diagnostic_codes(&result.diagnostics),
                    message: Some(format!("Expected diagnostic {expected_code}")),
                }
            }
            (Err(failure), expected_code) => {
                unexpected_results += 1;
                println!(
                    "FAILED     {} / {} / {} -> {}",
                    attempt.project, attempt.scope_label, attempt.profile_id, failure.message
                );
                AttemptReport {
                    project: attempt.project.to_string(),
                    scope: attempt.scope_label.to_string(),
                    format: format_name(attempt.format).to_string(),
                    profile_id: attempt.profile_id.to_string(),
                    outcome: "unexpected_failure".to_string(),
                    artifact: None,
                    manifest: None,
                    diagnostic_codes: diagnostic_codes(&failure.diagnostics),
                    message: Some(match expected_code {
                        Some(code) => {
                            format!("Expected {code}, received: {}", failure.message)
                        }
                        None => failure.message,
                    }),
                }
            }
        };
        reports.push(report);
    }

    let report = QaReport {
        generated_at: Utc::now().to_rfc3339(),
        source_app_data: source_app_data.to_string_lossy().to_string(),
        output_directory: output_directory.to_string_lossy().to_string(),
        generated_artifacts,
        expected_failures,
        unexpected_results,
        attempts: reports,
    };
    write_report(output_directory, &report)?;
    write_readme(output_directory, &report)?;

    println!();
    println!(
        "Publish QA complete: {} artifacts, {} expected failures, {} unexpected results.",
        report.generated_artifacts, report.expected_failures, report.unexpected_results
    );
    println!("Inspection output: {}", output_directory.display());

    if unexpected_results > 0 {
        Err(format!(
            "Publish QA completed with {unexpected_results} unexpected result(s); inspect qa-results.json"
        ))
    } else {
        Ok(())
    }
}

fn run_attempt(
    temporary_app_data: &Path,
    attempt: &Attempt,
    destination: &Path,
) -> Result<crate::publishing::request::PublishResult, HarnessFailure> {
    let request = request_for_attempt(temporary_app_data, attempt, destination)?;
    publish_blocking(None, temporary_app_data, request).map_err(publish_failure)
}

fn request_for_attempt(
    temporary_app_data: &Path,
    attempt: &Attempt,
    destination: &Path,
) -> Result<PublishRequest, HarnessFailure> {
    let snapshot =
        load_snapshot(temporary_app_data, attempt.project).map_err(|message| HarnessFailure {
            code: "PUBLISH_SOURCE_ERROR".to_string(),
            message,
            diagnostics: Vec::new(),
        })?;
    let config = load_or_default(
        &snapshot.publishing_path,
        snapshot.project_type,
        &snapshot.project_title,
    )
    .map_err(|message| HarnessFailure {
        code: "PUBLISH_SOURCE_ERROR".to_string(),
        message,
        diagnostics: Vec::new(),
    })?;

    Ok(PublishRequest {
        export_id: uuid::Uuid::new_v4().to_string(),
        project_name: attempt.project.to_string(),
        project_type: snapshot.project_type,
        scope: attempt.scope.clone(),
        format: attempt.format,
        profile_id: attempt.profile_id.to_string(),
        pdf_settings: config
            .profiles
            .get(PRINT_INTERIOR_PROFILE_ID)
            .cloned()
            .and_then(|value| serde_json::from_value(value).ok())
            .unwrap_or_else(PrintInteriorPdfSettings::default),
        metadata: metadata_from_config(&config),
        node_overrides: config.node_roles.clone(),
        outline_confirmed: config.project_type_strategy.confirmed,
        include_shared_matter: true,
        destination: Some(destination.to_string_lossy().to_string()),
    })
}

fn metadata_from_config(config: &PublishingConfig) -> PublishMetadataOverrides {
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

fn publish_failure(failure: PublishFailure) -> HarnessFailure {
    HarnessFailure {
        code: failure
            .diagnostics
            .first()
            .map(|diagnostic| diagnostic.code.clone())
            .unwrap_or_else(|| "PUBLISH_FAILED".to_string()),
        message: failure.message,
        diagnostics: failure.diagnostics,
    }
}

fn qa_attempts() -> Vec<Attempt> {
    let mut attempts = Vec::new();
    for project in &QA_PROJECTS[..7] {
        add_format_matrix(
            &mut attempts,
            project,
            "full",
            PublicationScope::FullProject,
            None,
        );
    }
    add_format_matrix(
        &mut attempts,
        "Publish QA 03 - Collection Scopes",
        "single-work-clockmakers-map",
        PublicationScope::SingleWork { node_id: 1 },
        None,
    );
    add_format_matrix(
        &mut attempts,
        "Publish QA 04 - Serial Scopes",
        "single-installment-02",
        PublicationScope::SingleInstallment { node_id: 6 },
        None,
    );
    add_format_matrix(
        &mut attempts,
        "Publish QA 04 - Serial Scopes",
        "volume-one",
        PublicationScope::Volume { node_id: 1 },
        None,
    );

    attempts.push(expected_failure_attempt(
        "Publish QA 90 - Expected Failure - Unsupported HTML",
        PublishFormat::Pdf,
        "proof_pdf",
        "proof",
        "pdf",
        "PUBLISH_UNSUPPORTED_CONTENT",
    ));
    attempts.push(expected_failure_attempt(
        "Publish QA 91 - Expected Failure - Missing Source",
        PublishFormat::Pdf,
        "proof_pdf",
        "proof",
        "pdf",
        "PUBLISH_SOURCE_ERROR",
    ));
    add_format_matrix(
        &mut attempts,
        "Publish QA 92 - Expected Failure - Empty Scope",
        "full",
        PublicationScope::FullProject,
        Some("PUBLISH_EMPTY_SCOPE"),
    );
    for format in format_matrix() {
        attempts.push(Attempt {
            project: "Publish QA 93 - Expected EPUB Failure - Missing Cover",
            scope_label: "full",
            scope: PublicationScope::FullProject,
            format: format.format,
            profile_id: format.profile_id,
            file_label: format.file_label,
            extension: format.extension,
            expected_failure: (format.format == PublishFormat::Epub)
                .then_some("EPUB_COVER_MISSING"),
        });
    }
    attempts
}

fn add_format_matrix(
    attempts: &mut Vec<Attempt>,
    project: &'static str,
    scope_label: &'static str,
    scope: PublicationScope,
    expected_failure: Option<&'static str>,
) {
    for format in format_matrix() {
        attempts.push(Attempt {
            project,
            scope_label,
            scope: scope.clone(),
            format: format.format,
            profile_id: format.profile_id,
            file_label: format.file_label,
            extension: format.extension,
            expected_failure,
        });
    }
}

fn expected_failure_attempt(
    project: &'static str,
    format: PublishFormat,
    profile_id: &'static str,
    file_label: &'static str,
    extension: &'static str,
    expected_failure: &'static str,
) -> Attempt {
    Attempt {
        project,
        scope_label: "full",
        scope: PublicationScope::FullProject,
        format,
        profile_id,
        file_label,
        extension,
        expected_failure: Some(expected_failure),
    }
}

#[derive(Clone, Copy)]
struct FormatSpec {
    format: PublishFormat,
    profile_id: &'static str,
    file_label: &'static str,
    extension: &'static str,
}

fn format_matrix() -> [FormatSpec; 5] {
    [
        FormatSpec {
            format: PublishFormat::Pdf,
            profile_id: "proof_pdf",
            file_label: "proof",
            extension: "pdf",
        },
        FormatSpec {
            format: PublishFormat::Pdf,
            profile_id: "print_interior",
            file_label: "print-interior",
            extension: "pdf",
        },
        FormatSpec {
            format: PublishFormat::Docx,
            profile_id: "standard_manuscript",
            file_label: "standard-manuscript",
            extension: "docx",
        },
        FormatSpec {
            format: PublishFormat::Docx,
            profile_id: "clean_handoff",
            file_label: "clean-handoff",
            extension: "docx",
        },
        FormatSpec {
            format: PublishFormat::Epub,
            profile_id: "reflowable_epub",
            file_label: "reflowable",
            extension: "epub",
        },
    ]
}

fn prepare_empty_output_directory(output: &Path) -> Result<(), String> {
    if output.exists() {
        let mut entries = fs::read_dir(output)
            .map_err(|error| format!("Failed to inspect {}: {error}", output.display()))?;
        if entries.next().is_some() {
            return Err(format!(
                "QA output directory is not empty: {}",
                output.display()
            ));
        }
    } else {
        fs::create_dir_all(output)
            .map_err(|error| format!("Failed to create {}: {error}", output.display()))?;
    }
    Ok(())
}

fn copy_project(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination)
        .map_err(|error| format!("Failed to create {}: {error}", destination.display()))?;
    for entry in fs::read_dir(source)
        .map_err(|error| format!("Failed to read {}: {error}", source.display()))?
    {
        let entry = entry.map_err(|error| format!("Failed to read project entry: {error}"))?;
        let name = entry.file_name();
        if name == "exports" {
            continue;
        }
        let source_path = entry.path();
        let destination_path = destination.join(name);
        if source_path.is_dir() {
            copy_project(&source_path, &destination_path)?;
        } else {
            fs::copy(&source_path, &destination_path).map_err(|error| {
                format!(
                    "Failed to copy {} to {}: {error}",
                    source_path.display(),
                    destination_path.display()
                )
            })?;
        }
    }
    Ok(())
}

fn projects_directory_name() -> &'static str {
    if cfg!(debug_assertions) {
        "Dev_Projects"
    } else {
        "Projects"
    }
}

fn safe_directory_name(project: &str) -> String {
    project
        .chars()
        .map(|character| {
            if character.is_alphanumeric() || matches!(character, ' ' | '-' | '_') {
                character
            } else {
                '_'
            }
        })
        .collect()
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("artifact")
        .to_string()
}

fn relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn diagnostic_codes(diagnostics: &[Diagnostic]) -> Vec<String> {
    diagnostics
        .iter()
        .map(|diagnostic| diagnostic.code.clone())
        .collect()
}

fn format_name(format: PublishFormat) -> &'static str {
    match format {
        PublishFormat::Pdf => "pdf",
        PublishFormat::Docx => "docx",
        PublishFormat::Epub => "epub",
    }
}

fn write_report(output: &Path, report: &QaReport) -> Result<(), String> {
    let serialized = serde_json::to_string_pretty(report)
        .map_err(|error| format!("Failed to serialize Publish QA report: {error}"))?;
    fs::write(output.join("qa-results.json"), serialized)
        .map_err(|error| format!("Failed to write Publish QA report: {error}"))
}

fn write_readme(output: &Path, report: &QaReport) -> Result<(), String> {
    let readme = format!(
        concat!(
            "# Generated Publish QA artifacts\n\n",
            "- Generated artifacts: {}\n",
            "- Expected failures: {}\n",
            "- Unexpected results: {}\n\n",
            "See `qa-results.json` for every attempted project, scope, format, ",
            "profile, diagnostic, artifact, and manifest.\n\n",
            "These files were generated from temporary copies of the projects. ",
            "The source projects and their export histories were not changed.\n"
        ),
        report.generated_artifacts, report.expected_failures, report.unexpected_results
    );
    fs::write(output.join("README.md"), readme)
        .map_err(|error| format!("Failed to write Publish QA README: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn qa_matrix_covers_full_scoped_and_expected_failure_cases() {
        let attempts = qa_attempts();
        assert_eq!(
            attempts
                .iter()
                .filter(|attempt| attempt.expected_failure.is_none())
                .count(),
            54
        );
        assert_eq!(
            attempts
                .iter()
                .filter(|attempt| attempt.expected_failure.is_some())
                .count(),
            8
        );
        assert!(attempts
            .iter()
            .any(|attempt| { attempt.scope == (PublicationScope::SingleWork { node_id: 1 }) }));
        assert!(attempts.iter().any(|attempt| {
            attempt.scope == (PublicationScope::SingleInstallment { node_id: 6 })
        }));
        assert!(attempts
            .iter()
            .any(|attempt| attempt.scope == (PublicationScope::Volume { node_id: 1 })));
    }

    #[test]
    fn output_directory_must_be_empty() {
        let directory = tempfile::tempdir().unwrap();
        fs::write(directory.path().join("existing.txt"), "keep").unwrap();
        let error = prepare_empty_output_directory(directory.path()).unwrap_err();
        assert!(error.contains("not empty"));
        assert_eq!(
            fs::read_to_string(directory.path().join("existing.txt")).unwrap(),
            "keep"
        );
    }
}
