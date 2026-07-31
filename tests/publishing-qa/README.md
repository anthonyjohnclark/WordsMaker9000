# Publishing QA

This directory contains the tracked Publish QA expectations, non-interactive
entry points, and local inspection output.

From the repository root:

```powershell
# Create the ten QA projects under the app's Dev_Projects directory.
powershell -ExecutionPolicy Bypass -File .\tests\publishing-qa\scripts\create_publish_test_projects.ps1

# Replace existing QA projects when needed.
powershell -ExecutionPolicy Bypass -File .\tests\publishing-qa\scripts\create_publish_test_projects.ps1 -Force

# Generate Proof PDF, Print Interior PDF, DOCX, and EPUB artifacts without opening the app.
powershell -ExecutionPolicy Bypass -File .\tests\publishing-qa\scripts\generate_publish_qa_outputs.ps1
```

Generated artifacts are written to timestamped directories under `output/`.
That directory is intentionally ignored by Git. The headless Rust harness
remains under `src-tauri/examples/publish_qa.rs` so Cargo can run it as an
example target.

The files under `expectations/` are tracked test specifications. Update them as
publishing behavior and coverage evolve. See `docs/PUBLISH_QA_PROJECTS.md` for
the complete matrix and manual checks.
