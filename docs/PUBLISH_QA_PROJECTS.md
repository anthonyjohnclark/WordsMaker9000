# Publish QA projects

Run the generator from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\create_publish_test_projects.ps1
```

It creates ten projects in `%APPDATA%\WordsMaker9000\Dev_Projects` and refuses to overwrite an existing fixture unless `-Force` is explicitly supplied.

## Successful fixtures

| Project | Primary coverage |
| --- | --- |
| Publish QA 01 - Novel Structure | Interleaved root items, root-file chapters, folder chapters, part/chapter/scene roles, four-level depth, empty chapter, scene breaks, EPUB-only node, cover, navigation |
| Publish QA 02 - Novella Root Chapters | Direct root-file chapters, no duplicate generated wrappers, implicit in-file scenes, empty file, unsaved-buffer flush, missing-cover/derived-ID EPUB warnings |
| Publish QA 03 - Collection Scopes | Work terminology, folder and root-file works, nested scenes, Full Project and Single Work scopes, shared matter |
| Publish QA 04 - Serial Scopes | Volume, installments, chapters, scenes, root-file installment, Full Project, Single Installment, and Volume scopes |
| Publish QA 05 - Format Inclusion | All/PDF-only/DOCX-only/EPUB-only/excluded nodes, empty included chapter, EPUB-specific front/back inclusion |
| Publish QA 06 - Formatting and Unicode | All supported headings and inline marks, alignment, indentation, RTL, block quote, nested mixed lists, link, soft break, scene break, multilingual text, EPUB reflow |

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
- Standard Manuscript DOCX;
- Clean Handoff DOCX;
- EPUB 3 with EPUBCheck and a reflowable reader.

The sentinel strings in the project guides make omissions and incorrect inclusion easy to search for.
