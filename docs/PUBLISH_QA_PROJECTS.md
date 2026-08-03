# Publish QA projects

Run the generator from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\tests\publishing-qa\scripts\create_publish_test_projects.ps1
```

It creates eleven projects in `%APPDATA%\WordsMaker9000\Dev_Projects` and refuses to overwrite an existing fixture unless `-Force` is explicitly supplied.

## Successful fixtures

| Project | Primary coverage |
| --- | --- |
| Publish QA 01 - Novel Structure | Interleaved root items, root-file chapters, folder chapters, part/chapter/scene roles, four-level depth, empty chapter, scene breaks, EPUB-only node, cover, navigation |
| Publish QA 02 - Novella Root Chapters | Direct root-file chapters, no duplicate generated wrappers, implicit in-file scenes, empty file, unsaved-buffer flush, missing-cover/derived-ID EPUB warnings |
| Publish QA 03 - Collection Scopes | Work terminology, folder and root-file works, nested scenes, Full Project and Single Work scopes, shared matter |
| Publish QA 04 - Serial Scopes | Volume, installments, chapters, scenes, root-file installment, Full Project, Single Installment, and Volume scopes |
| Publish QA 05 - Format Inclusion | All/PDF-only/DOCX-only/EPUB-only/excluded nodes, empty included chapter, EPUB-specific front/back inclusion |
| Publish QA 06 - Formatting and Unicode | All supported headings and inline marks, alignment, indentation, RTL, block quote, nested mixed lists, link, soft break, scene break, multilingual text, EPUB reflow |
| Publish QA 07 - Accessible Images | Versioned project asset registry, informative/decorative body images, alt text, captions, placement intent, PDF/DOCX/EPUB packaging |

## Expected-failure fixtures

| Project | Expected result |
| --- | --- |
| Publish QA 90 - Expected Failure - Unsupported HTML | Publish setup fails and identifies the source node and `<table>`; no artifact |
| Publish QA 91 - Expected Failure - Missing Source | Snapshot loading names the missing source file and node; no artifact |
| Publish QA 92 - Expected Failure - Empty Scope | Publish preflight reports `PUBLISH_EMPTY_SCOPE`; no artifact or destination copy |
| Publish QA 93 - Expected EPUB Failure - Missing Cover | EPUB preflight reports `EPUB_COVER_MISSING`; PDF and DOCX remain publishable |

The source-controlled [Publish QA expectations](PUBLISH_QA_EXPECTATIONS.md) are the canonical checklists. The generator copies the appropriate checklist into each project as `PUBLISH_QA_EXPECTATIONS.md`; it also creates an excluded `_QA Guide — Excluded` editor file. Successful EPUB-cover fixtures use a project-relative `qa-cover.svg`.

For successful projects, compare:

- Proof PDF;
- Print Interior PDF;
- Standard Manuscript DOCX;
- Clean Handoff DOCX;
- EPUB 3 with EPUBCheck and a reflowable reader.

The sentinel strings in the project guides make omissions and incorrect inclusion easy to search for.

## Generate every artifact without using the app

From the repository root, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\tests\publishing-qa\scripts\generate_publish_qa_outputs.ps1
```

The command generates a timestamped inspection directory under
`tests/publishing-qa/output`. To choose the location:

```powershell
powershell -ExecutionPolicy Bypass -File .\tests\publishing-qa\scripts\generate_publish_qa_outputs.ps1 `
  -OutputPath C:\temp\wordsmaker-publish-qa
```

The destination must be new or empty; the command never deletes an existing
inspection directory. It copies the eleven projects to a temporary app-data root
and runs those copies through the same Rust snapshot loading, compilation,
project strategy, preflight, adapters, manifest creation, and destination-copy
path used by the Publish modal. The live `_Dev` projects and their export
histories are not changed.

It generates:

- full-project Proof PDF, Print Interior PDF, Standard Manuscript DOCX, Clean
  Handoff DOCX, and EPUB for QA01 through QA07;
- all five outputs for QA03's `The Clockmaker's Map` Single Work scope;
- all five outputs for QA04's Installment 02 and Volume One scopes;
- both PDF and both DOCX profiles for QA93;
- `qa-results.json`, copied manifests, each project's `EXPECTATIONS.md`, and a
  short generated README;
- passing expected-failure records for representative QA90/QA91 attempts,
  every QA92 format/profile, and QA93 EPUB.

Any unexpected success or failure makes the command exit nonzero. The
unsaved-buffer check in QA02 remains an interactive frontend test because a
disk-only command intentionally has no editor buffer to flush.
