# WordsMaker9000

WordsMaker9000 is a local-first desktop writing workspace for long-form projects. It combines a focused rich-text editor with a VS Code-style project tree, local backups, search, and publication tooling without the overhead of a general-purpose word processor.

## Current status

WordsMaker9000 is an actively developed pre-1.0 application. The core drafting, project-management, and publishing workflows are implemented.

Rich-content implementation slices 6.1-6.5 are complete. Later work remains planned for qualified right-to-left support, multi-work/box-set metadata, semantic tables and callouts, and multi-format sales bundles.

Some release qualification is intentionally still manual. Live editor save/reopen behavior and generated DOCX files need checks in Word and LibreOffice, while the print PDF profiles still need provider-specific qualification with services such as KDP and IngramSpark. The print profiles are provider-neutral and should not be treated as retailer-certified output yet.

## Features

### Writing and project management

- Local projects for novels, novellas, collections, and serials.
- A draggable file-and-folder tree with nested organization, renaming, and per-file and project word counts.
- A Quill-based editor with headings, inline formatting, block quotes, links, lists, soft line breaks, semantic scene breaks, and smart typography.
- Project-managed images with alt text or explicit decorative semantics, plus editor-native footnotes.
- In-file find, project-wide search and replace, and optional online dictionary lookup for a selected word.
- Configurable automatic saves and rotating local backups, with backup restoration from the project list.
- Multiple themes, editor zoom, and a distraction-free fullscreen mode.

### Publishing

- Editable DOCX output using Standard Manuscript or Clean Handoff profiles.
- Reflowable EPUB 3 output with metadata, cover, navigation, accessibility checks, and EPUBCheck coverage in CI.
- Proof, Print Interior, Large Print, and Hardcover PDF profiles.
- Project-type-aware publication scopes, an editable publishing outline, per-format inclusion, reusable matter templates, and print master-page settings.
- Preflight diagnostics that block invalid output, along with publishing progress and job cancellation.
- Named publishing workflows and Artifact History actions for previewing, revealing, copying, regenerating, and deleting generated files.
- Fail-closed source preparation: the active editor is saved before publishing, unreadable source blocks the job, and nested project order is preserved.

## Local data

Projects and settings are stored in the operating system's application-data directory. Backups are stored in the user's Documents directory, and imported publication assets are copied into their project. Writing and publishing data stays local; the optional dictionary feature makes a network request to `dictionaryapi.dev`.

## Technical overview

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, and React Quill.
- **Desktop runtime:** Tauri 2 with a Rust backend. The repository pins Rust `1.88.0`.
- **Publishing:** A shared semantic compiler feeds Typst-based PDF rendering, DOCX generation, and a native EPUB adapter.
- **Quality:** Jest tests cover the frontend utilities, Rust tests cover native and publishing behavior, and a headless Publish QA harness generates inspectable artifacts.

## Getting started

Install Node.js with npm, Rust through `rustup`, and the native system prerequisites required by Tauri 2 for your platform. From the repository root:

```powershell
npm ci
npm run tauri dev
```

`npm run dev` starts only the Vite frontend. Use the Tauri command above to exercise native file storage, backups, dictionary lookup, fullscreen behavior, and publishing.

If PowerShell blocks `npm.ps1`, use `npm.cmd` in the same commands.

## Validation

Run the frontend tests and production build:

```powershell
npm test -- --runInBand
npm run build
```

Run the native test suite with the locked dependency graph:

```powershell
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

On Windows checkouts that convert files to CRLF, the current golden semantic-model snapshot test can fail because it compares raw newline sequences. The reported JSON content is otherwise identical.

Create the fixture projects and generate the full publish-artifact QA matrix on Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\tests\publishing-qa\scripts\create_publish_test_projects.ps1
powershell -ExecutionPolicy Bypass -File .\tests\publishing-qa\scripts\generate_publish_qa_outputs.ps1
```

Generated QA artifacts are written under `tests/publishing-qa/output/` and are intentionally ignored by Git. This headless harness does not replace the remaining live-editor and external-reader checks.

## Build the desktop app

```powershell
npm run tauri build
```

The executable is written under `src-tauri/target/release/`; packaged installers and bundles are written under `src-tauri/target/release/bundle/`.

## Project documentation

- [Phase 6 implementation status](docs/PHASE_6_IMPLEMENTATION_SLICES.md)
- [Publishing QA expectations](docs/PUBLISH_QA_EXPECTATIONS.md)
- [Publishing QA commands](tests/publishing-qa/README.md)
- [Print PDF release qualification](docs/PRINT_PDF_RELEASE_QUALIFICATION.md)
- [Theme architecture](docs/THEMING.md)
