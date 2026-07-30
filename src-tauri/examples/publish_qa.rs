#![allow(dead_code)]

#[path = "../src/export/mod.rs"]
mod export;
#[path = "../src/publishing/mod.rs"]
mod publishing;
#[path = "publish_qa/support.rs"]
mod support;

use std::path::PathBuf;

fn main() {
    let mut arguments = std::env::args().skip(1);
    let mut app_data = None;
    let mut output = None;

    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--app-data" => app_data = arguments.next().map(PathBuf::from),
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

    let Some(app_data) = app_data else {
        eprintln!("Missing required --app-data path.");
        print_usage();
        std::process::exit(2);
    };
    let Some(output) = output else {
        eprintln!("Missing required --output path.");
        print_usage();
        std::process::exit(2);
    };

    if let Err(error) = support::generate_publish_qa_outputs(&app_data, &output) {
        eprintln!("Publish QA failed: {error}");
        std::process::exit(1);
    }
}

fn print_usage() {
    eprintln!(
        "Usage: cargo run --example publish_qa -- --app-data <WordsMaker9000 app-data> --output <empty directory>"
    );
}
