#![allow(dead_code)]

#[path = "../src/export/mod.rs"]
mod export;
#[path = "../src/publishing/mod.rs"]
mod publishing;

use std::fs;
use std::path::PathBuf;
use std::time::Instant;

use publishing::model::BookDocument;

fn main() {
    let mut arguments = std::env::args().skip(1);
    let mut output = None;

    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--output" => output = arguments.next().map(PathBuf::from),
            "--help" | "-h" => {
                print_usage();
                return;
            }
            other => {
                eprintln!("Unknown argument: {other}");
                print_usage();
                std::process::exit(2);
            }
        }
    }

    let output = output.unwrap_or_else(|| PathBuf::from("target/pdf-renderer-spike"));
    if let Err(error) = run(&output) {
        eprintln!("PDF renderer spike failed: {error}");
        std::process::exit(1);
    }
}

fn run(output: &PathBuf) -> Result<(), String> {
    fs::create_dir_all(output)
        .map_err(|error| format!("Failed to create output directory: {error}"))?;
    let document: BookDocument = serde_json::from_str(include_str!(
        "../src/publishing/fixtures/pdf_acceptance_document.json"
    ))
    .map_err(|error| format!("Acceptance fixture is invalid: {error}"))?;

    let legacy_dir = output.join("genpdf");
    let legacy_started = Instant::now();
    let legacy_path =
        export::pdf_adapter::generate_pdf(&document, &legacy_dir, None).map_err(|error| {
            format!("The legacy genpdf adapter could not render the acceptance manuscript: {error}")
        })?;
    let legacy_elapsed = legacy_started.elapsed();

    let candidate_dir = output.join("typst");
    let candidate_started = Instant::now();
    let candidate_path = export::pdf_typst_adapter::generate_pdf(&document, &candidate_dir, None)?;
    let candidate_elapsed = candidate_started.elapsed();

    println!(
        "genpdf\t{}\t{} bytes\t{} ms",
        legacy_path.display(),
        file_size(&legacy_path)?,
        legacy_elapsed.as_millis()
    );
    println!(
        "typst\t{}\t{} bytes\t{} ms",
        candidate_path.display(),
        file_size(&candidate_path)?,
        candidate_elapsed.as_millis()
    );
    println!("Inspect both files against src/publishing/fixtures/pdf_acceptance_document.json.");
    Ok(())
}

fn file_size(path: &PathBuf) -> Result<u64, String> {
    fs::metadata(path)
        .map(|metadata| metadata.len())
        .map_err(|error| format!("Failed to inspect {}: {error}", path.display()))
}

fn print_usage() {
    eprintln!("Usage: cargo run --example pdf_renderer_spike -- --output <directory>");
}
