# Publish QA Regression Report

Last updated: 2026-07-29

This report consolidates the regressions and coverage gaps found while comparing
the artifacts in `tests/publishing-qa/output/manual-regression-baseline` with
the expected behavior in `docs/PUBLISH_QA_EXPECTATIONS.md`.

## Audit method

- PDF files were text-extracted, rendered page by page, and visually inspected.
- EPUB packages were structurally inspected and run through EPUBCheck 5.3.0.
- DOCX files were inspected as OOXML packages for content order, styles,
  numbering, breaks, links, bidirectional properties, package metadata, page
  geometry, margins, headers, and profile properties.
- The original Standard Manuscript DOCX files and all six new Clean Handoff DOCX
  files were included.
- DOCX page-image rendering was not performed because LibreOffice is unavailable.
  Visual behavior that cannot be established from OOXML remains explicitly
  unverified.

## Working-tree remediation

Implemented on 2026-07-29:

| Regression | Status | Remediation |
| --- | --- | --- |
| PQA-001 | Fixed; automated | The PDF compatibility projection now emits a node's own blocks and always recurses into included children, even when an intermediate container is assigned the `scene` role. A regression test covers a scene-role container with a deeper scene. |
| PQA-002 | Not reproduced structurally; visual recheck required | Inspection of the reported `Small Weather.pdf` content stream found the complete Chapter Two paragraph in one text line at x=56.69 pt, y=725.91 pt—inside the normal page bounds. No deterministic clipping path was found. Regenerate QA02 and visually inspect it before deciding whether the original screenshot was a viewer/rendering artifact. |
| PQA-003 | Partially fixed | PDF soft breaks are now emitted as actual line boundaries instead of newline glyphs. Emoji/CJK font fallback and Arabic/Hebrew shaping remain unsupported by the current `genpdf` backend. |
| PQA-004 | Partially fixed; automated | PDF now preserves centered/right logical alignment, indentation, ordered versus bullet markers, and recursive list depth. `genpdf` has no justified-paragraph mode, so justified paragraphs still fall back to left alignment. |
| PQA-005 | Fixed; automated | The generated PDF is reopened through `lopdf` and its document-information `Author` property is populated from the primary author. |
| PQA-006 | Fixed; automated | Standard Manuscript contact construction now splits every configured multiline field into separate contact paragraphs. |
| PQA-007 | Fixed; automated | Right-to-left DOCX paragraphs now carry `w:bidi`; their run properties are finalized with `w:rtl` in the OOXML package. |
| PQA-008 | Fixed; automated | DOCX package finalization now writes publication title and author to `docProps/core.xml`, in addition to the existing custom properties. |
| PQA-009 | Fixed; automated | Authored H1 through H6 blocks now map one-to-one to `WMHeading1` through `WMHeading6` named styles with distinct outline levels. |
| PQA-010 | Open; source normalization confirmed | The Rust parser and DOCX adapter already preserve a persisted `<br>` as one paragraph containing `w:br`, and the fixture script writes that form. A read-only inspection of the current QA01 source found it had been rewritten to `<p>Soft line one</p><p>Soft line two.</p>` after editor use. Preserving soft breaks through editing therefore needs a dedicated editor-level soft-break model. |

## Confirmed regressions

### PQA-001 — Proof PDF drops deeply nested content

- Severity: High
- Fixtures: QA01 Novel Structure, QA03 Collection Scopes
- Artifacts:
  - `The Ordered Depths.pdf`
  - `Three Impossible Maps.pdf`
- Evidence:
  - QA01 omits `FOUR-LEVEL-CHAMBER` and the prose beneath
    `Sequence — Under the City`; the corresponding page contains only a heading.
  - QA03 omits `COLLECTION-WORK-THREE-DEEP-SCENE`; the corresponding page contains
    only the `Letters from Europa` / `Section A` heading.
- Expected: Proof PDF must retain source order and content at arbitrary depth.
- Likely area: the legacy PDF compatibility projection or adapter still flattens
  only part of the recursive `BookDocument`.

### PQA-002 — Proof PDF clips the beginning of QA02 Chapter Two

- Severity: High
- Fixture: QA02 Novella Root Chapters
- Artifact: `Small Weather.pdf`
- Evidence: page 3 shows only the tail of `NOVELLA-CHAPTER-TWO`; the beginning of
  the paragraph is outside the visible page.
- Expected: the complete chapter paragraph must be visible.
- Likely area: PDF page-break or vertical-position handling around consecutive
  root-file chapters.

### PQA-003 — Proof PDF cannot render the QA06 Unicode and direction fixture

- Severity: High
- Fixture: QA06 Formatting and Unicode
- Artifact: `Glyphs & Garlands.pdf`
- Evidence:
  - the rocket emoji renders as a missing-glyph square;
  - CJK text renders as boxes;
  - the soft line break renders as a square rather than a break;
  - Arabic and Hebrew direction/shaping are visibly incorrect.
- Expected: every language and the final Unicode sentinel must remain readable,
  and soft line breaks must remain line breaks.
- Likely area: font fallback/embedding, text shaping, bidirectional layout, and
  inline line-break support in the Proof PDF adapter.

### PQA-004 — Proof PDF flattens paragraph and list formatting

- Severity: Medium
- Fixture: QA06 Formatting and Unicode
- Artifact: `Glyphs & Garlands.pdf`
- Evidence:
  - centered, right-aligned, justified, and indented paragraphs are largely
    rendered as left-aligned body text;
  - ordered and recursively nested lists render as plain hyphens, losing both
    numbering and nesting semantics.
- Expected: alignments, indentation, ordered/bullet list type, and recursive list
  depth must survive.
- Likely area: `BookDocument` paragraph-style and list adaptation in Proof PDF.

### PQA-005 — PDF author metadata is empty

- Severity: Medium
- Fixtures: all inspected Proof PDFs, including the three new scoped PDFs
- Evidence: the PDF title metadata is populated, but the author metadata is an
  empty string even though the visible byline is `Quinn Tester`.
- Expected: artifact metadata should carry the configured title and author.
- Likely area: Proof PDF document-information population.

### PQA-006 — Standard Manuscript contact address loses its line break

- Severity: Medium
- Fixtures: inspected Standard Manuscript DOCX files
- Evidence: the configured address
  `100 Fixture Lane` + line break + `Testville, NY 10001` becomes
  `100 Fixture LaneTestville, NY 10001` in `word/document.xml`.
- Expected: structured or multiline mailing addresses must retain a visible line
  boundary.
- Likely area: Standard Manuscript contact-block construction.

### PQA-007 — DOCX right-to-left content lacks OOXML bidi/RTL semantics

- Severity: High
- Fixtures: QA01 and QA06; Standard Manuscript and Clean Handoff
- Evidence:
  - Arabic and Hebrew paragraphs are right-aligned;
  - no `w:bidi` paragraph property or `w:rtl` run property is present.
- Expected: Arabic and Hebrew should use Word's bidirectional paragraph and run
  semantics, not alignment alone.
- Likely area: DOCX paragraph/run construction for
  `ParagraphDirection::RightToLeft`.

### PQA-008 — DOCX core metadata omits publication title and author

- Severity: Medium
- Fixtures: all inspected Standard Manuscript and Clean Handoff DOCX files
- Evidence:
  - `docProps/core.xml` has an empty title;
  - creator is `unknown`;
  - the correct publication title, author, and profile exist only in custom
    properties.
- Expected: Word core properties should contain the configured title and author.
- Likely area: DOCX core-property construction.

### PQA-009 — DOCX collapses six authored heading levels into two styles

- Severity: Medium
- Fixture: QA06 Formatting and Unicode
- Artifacts:
  - `Glyphs & Garlands.docx`
  - `Glyphs & Garlands-clean handoff.docx`
- Evidence:
  - authored H1 and H2 paragraphs both use `WMChapter`;
  - authored H3 through H6 paragraphs all use `WMScene`.
- Expected: all six authored heading levels must remain distinguishable.
- Likely area: `heading_style` in the DOCX adapter maps H1/H2 together and H3-H6
  together.

### PQA-010 — QA01 DOCX converts an authored soft break into two paragraphs

- Severity: Medium
- Fixture: QA01 Novel Structure
- Artifacts:
  - `The Ordered Depths.docx`
  - `The Ordered Depths-clean handoff.docx`
- Evidence: `Soft line one<br>Soft line two.` appears as two `WMBody` paragraphs
  with no `w:br`. The equivalent QA06 soft break correctly remains one paragraph
  with one `w:br`.
- Expected: the authored soft line break must remain a soft line break.
- Follow-up: compare the persisted QA01 source snapshot with the generated
  fixture to determine whether the conversion happens during editor
  normalization or DOCX adaptation.

## New Clean Handoff results

These checks are structural OOXML checks, not a page-image render.

| Fixture | Result | Evidence |
| --- | --- | --- |
| QA01 Novel Structure | Pass with PQA-007, PQA-008, and PQA-010 | Root order is retained; EPUB-only and excluded nodes are absent; `FOUR-LEVEL-CHAMBER` is present; semantic scene headings are visible; true lists and the external hyperlink are present. |
| QA02 Novella Root Chapters | Pass | Each root file is one chapter with its real title; no synthetic chapter wrapper appears; both scene markers survive; the empty epilogue remains structural. |
| QA03 Collection Scopes | Pass | All three works remain ordered; work titles are preserved; both Clockmaker scenes and the deeply nested Europa scene are present; scene headings are visible. |
| QA04 Serial Scopes | Pass | Volume, installments, chapters, scenes, and Holiday Special remain ordered; structural headings and page-break-before properties are present. |
| QA05 Format Inclusion | Pass | `FORMAT-SENTINEL-ALL` and `FORMAT-SENTINEL-DOCX-ONLY` are present; PDF-only, EPUB-only, excluded, and QA-guide content are absent; the empty included chapter remains structural. |
| QA06 Formatting and Unicode | Pass with PQA-007, PQA-008, and PQA-009 | Inline marks, real recursive numbering, alignment, indentation, quote style, hyperlink, scene break, soft break, Unicode text, and final sentinel are structurally present. |

All six Clean Handoff files also have:

- `clean_handoff` in custom properties;
- US Letter dimensions and one-inch margins;
- Times New Roman 12 pt body text;
- single spacing with 6 pt paragraph-after spacing;
- no running header part;
- named `WMTitle`, `WMSubtitle`, `WMByline`, `WMBody`, `WMPart`,
  `WMChapter`, `WMScene`, `WMQuote`, `WMList`, and `WMSceneBreak` styles.

## New scoped PDF results

All 15 pages across the three new scoped PDFs were rendered and visually
inspected. No clipping, overlap, or missing body content was found.

### QA03 Single Work

- Artifact: `Three Impossible Maps -- single.pdf`
- Selected work in the artifact: `A Very Short Story`
- Pass:
  - selected-work content is present;
  - the other two works are absent;
  - shared front and back matter are retained;
  - the work title is not replaced with a generated chapter number.
- Coverage gap: the QA checklist specifically calls for
  `The Clockmaker's Map`, so preservation of that selected work's two child
  scenes is not tested by this artifact.

### QA04 Single Installment

- Artifact: `The Signal Cycle-single install.pdf`
- Selected installment in the artifact: `Installment 01 — Signal`
- Pass:
  - required `Volume One` ancestry is retained;
  - both Installment 01 scenes are present;
  - Installment 02 and Holiday Special are absent;
  - shared front and back matter are retained.
- Coverage gap: the QA checklist specifically calls for Installment 02, so that
  selection remains untested.

### QA04 Single Volume

- Artifact: `The Signal Cycle--single volume.pdf`
- Pass:
  - Volume One is retained;
  - both installments, all chapters, and all three scenes are present;
  - Holiday Special is excluded;
  - shared front and back matter are retained.

## EPUB result summary

No confirmed EPUB content regression was found in the six successful fixtures:

- all six packages passed EPUBCheck 5.3.0 with zero fatals, errors, warnings, or
  infos;
- navigation/spine order, nested TOC, landmarks, cover, alt text, inclusion
  rules, headings, lists, links, scene breaks, Unicode, and RTL direction were
  structurally correct;
- untitled front and back matter no longer display generic headings or TOC
  entries.

Non-blocking observation: the static SVG fixture cover causes accessibility
hazards to be reported conservatively as `unknown`.

## Remaining coverage gaps

1. QA02 unsaved-buffer flush is not tested. `UNSAVED-BUFFER-SENTINEL` is absent
   from the inspected QA02 artifacts.
2. QA03 still needs a Single Work export selecting `The Clockmaker's Map`.
3. QA04 still needs a Single Installment export selecting
   `Installment 02 — Static`.
4. QA93 PDF and DOCX artifacts are not present anywhere under
   `tests/publishing-qa/output/manual-regression-baseline` as of this report.
   Their successful post-fix output cannot yet be inspected.
5. Clean Handoff DOCX visual rendering remains unverified without a
   non-interactive DOCX renderer. The structural audit does not establish glyph
   fallback, wrapping, page appearance, or Word's final bidi rendering.
6. Word/LibreOffice repair-free opening remains a manual release-qualification
   gate.

## Resolved defects encountered during this QA cycle

- Switching from Clean Handoff DOCX to PDF no longer submits
  `clean_handoff`; PDF requests now always use `proof_pdf`.
- A missing EPUB cover no longer blocks PDF or DOCX source hashing.
- QA93 should now fail EPUB preflight with `EPUB_COVER_MISSING` while allowing
  PDF and DOCX.
- Untitled EPUB front and back matter retain semantic roles without visible
  generic headings or TOC entries.
