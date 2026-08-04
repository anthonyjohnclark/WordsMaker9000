# Phase 6 implementation slices

Status: Slices 6.1 through 6.5 are implemented in code as of 2026-08-04.
Automated checks, generated PDF inspection, and EPUBCheck pass through Slice
6.5. Editor save/reopen and Word/LibreOffice repair checks remain manual
qualification gates. Slices 6.6 and later remain planned.

Phase 5 is checkpointed, the automated baseline is green, and the manual PDF
preview, Artifact History, regeneration, and cancellation smoke tests have been
completed. KDP and IngramSpark qualification remains intentionally deferred to
the later provider-qualification phase and is not a Phase 6 prerequisite.

This document turns the Phase 6 roadmap into independently shippable slices.
Phase 6 should remain an incremental program rather than a single large change.
Every slice must leave Proof PDF, Print Interior PDF, both DOCX profiles, and
EPUB usable.

## Current foundation

The repository already has useful parts of the rich-content architecture:

- `BookDocument` defines headings, block quotes, scene breaks, images,
  footnotes, links, assets, text direction, and recursive sections.
- The Quill HTML parser already understands headings, block quotes, links, and
  conventional standalone scene-break markers.
- PDF, DOCX, and EPUB already render headings, block quotes, links, and scene
  breaks.
- EPUB already has IR-level image and footnote rendering plus asset and
  accessibility preflight.
- Publishing profiles, replayable recipes, manifests, job progress,
  cancellation, and Artifact History are established.

The remaining gaps define the sequence:

- The editor toolbar exposes only inline marks and lists.
- There is no explicit editor-native scene-break element.
- The compiler loads project assets, and the parser creates image and footnote
  IR from documented editor markup.
- PDF, DOCX, and EPUB render accessible images and footnotes.
- Template/master-page, vertical-writing, table, callout, and bundle models do
  not yet exist.

## Sequencing summary

| Slice | Outcome                                                       | Depends on                             |
| ----- | ------------------------------------------------------------- | -------------------------------------- |
| 6.1   | Editor-native headings, links, block quotes, and scene breaks | Phase 5 baseline                       |
| 6.2   | Project assets and accessible images in every format          | 6.1 editor conventions                 |
| 6.3   | Footnotes and endnotes in every format                        | 6.1; reuse 6.2 ID/persistence patterns |
| 6.4   | Reusable front/back matter and constrained master pages       | Stable rich-content compiler           |
| 6.5   | Large-print and hardcover PDF profiles                        | 6.4 profile/template model             |
| 6.6   | Qualified RTL controls, followed by a vertical-writing spike  | 6.1 and stable adapters                |
| 6.7   | Box sets, volumes, and multi-work metadata                    | Stable scope and template models       |
| 6.8   | Accessible tables and semantic callouts                       | 6.1, 6.2, and an IR schema extension   |
| 6.9   | Direct-sales bundles and reusable Also By pages               | 6.4 and 6.7                            |

## Slice 6.1 — editor-native semantic content

Implementation status: code complete; automated acceptance checks pass.

### Goal

Let writers intentionally create headings, links, block quotes, and scene
breaks in the editor, and preserve those semantics through all current export
formats. This is the recommended first Phase 6 implementation slice because
the parser, IR, and adapters already support most of the path.

### Implementation

- Extend the Quill toolbar with:
  - heading levels 1 through 6 plus normal paragraph;
  - block quote;
  - link creation, editing, and removal;
  - a dedicated Insert Scene Break action.
- Add a custom block-level scene-break blot. Persist it as a stable semantic
  element such as `<hr data-wm-scene-break="asterisks">`, never as whitespace
  or an image.
- Insert the scene break at the current selection and leave a writable
  paragraph after it. Define predictable Backspace/Delete, selection,
  undo/redo, and copy/paste behavior.
- Keep existing standalone `#`, `***`, `* * *`, and legacy `<hr>` parsing for
  backward compatibility.
- Update the Rust parser to recognize the explicit scene-break attribute and
  reject unsupported values instead of silently choosing a style.
- Preserve inline marks and links inside headings and block quotes.
- Add accessible names and tooltips to new toolbar actions. The editor must not
  require pointer-only interaction.
- Do not change project JSON, publishing config, manifests, or IPC shapes in
  this slice.

### Tests

- Jest tests for scene-break insertion, selection movement, deletion,
  undo/redo-friendly operations, and clipboard normalization.
- Save/reopen tests proving the exact semantic HTML survives persistence.
- Rust fixtures copied from actual Quill output for every new toolbar action.
- Parser tests for explicit scene breaks and all legacy marker forms, including
  false positives inside prose, headings, and links.
- Adapter tests proving headings, links, block quotes, and explicit scene
  breaks reach PDF, Standard Manuscript DOCX, Clean Handoff DOCX, and EPUB in
  source order.
- Extend the formatting-and-Unicode Publish QA project and expectation file.

### Exit criteria

- A writer can insert every new semantic element without typing markup.
- Saving, closing, reopening, and publishing retain the elements exactly.
- Standard Manuscript renders a centered `#` for scene breaks; Clean Handoff
  and EPUB preserve the selected semantic marker; PDF renders the configured
  centered break.
- Existing documents containing textual scene-break markers export unchanged.
- Unsupported editor HTML still blocks publishing with a node-specific
  diagnostic; no content is silently omitted.
- Rust, Jest, TypeScript, Vite, and the headless Publish QA matrix pass.

## Slice 6.2 — project assets and accessible images

Implementation status: code complete; automated acceptance checks pass.

### Goal

Introduce durable, project-relative assets and render accessible body images in
PDF, DOCX, and EPUB without storing base64 data or machine-specific absolute
paths in document content.

### Implementation

- Add a versioned project asset registry and an `assets/` directory beneath the
  project. Use stable typed asset IDs and project-relative paths.
- Import assets through an atomic copy. Validate filename, media type, size,
  dimensions, duplicate content, and path containment before registration.
- Add asset list, replace, relink, and remove operations. Prevent removal while
  an asset is referenced unless the user explicitly removes those references.
- Add an editor image blot that stores only the asset ID plus alt text, caption,
  and presentation intent. Never persist an external absolute path in Quill
  HTML.
- Require meaningful alt text unless the image is explicitly marked
  decorative. Keep caption and alt text separate.
- Load the asset registry during the Rust source snapshot and populate
  `BookDocument.assets` during compilation.
- Extend PDF and DOCX adapters to render supported raster/vector images. Keep
  renderer-specific traversal out of the compiler.
- Preserve existing EPUB asset packaging and extend its preflight to the new
  project registry.
- Add format-aware diagnostics for missing files, media-type mismatch,
  unsupported SVG features, insufficient print resolution, oversize assets,
  and bleed requests unsupported by the selected profile.
- Spike the DOCX image dependency/features before accepting binary-size or
  build-time growth.

### Tests

- Asset registry initialization, migration, atomic imports, deduplication,
  path traversal rejection, relinking, reference checks, and orphan cleanup.
- Editor save/reopen and clipboard tests with image references.
- Compiler tests for stable asset IDs and ordered image blocks.
- Structural DOCX relationship/media tests, EPUB manifest/XHTML tests, and PDF
  image-object/page-bound tests.
- Missing asset and missing-alt-text failures must leave no successful manifest
  or destination artifact.

### Exit criteria

- The same project can move between computers without relinking valid assets.
- Images render in all three formats or fail preflight before rendering.
- No document JSON contains base64 image bodies or external absolute paths.
- Accessibility metadata accurately distinguishes informative and decorative
  images.

## Slice 6.3 — footnotes and endnotes

Implementation status: code complete; automated acceptance checks pass.

### Goal

Provide stable editor references and definitions that render as native or
standards-appropriate notes in PDF, DOCX, and EPUB.

### Implementation

- Add editor commands to insert, edit, navigate to, and delete a note.
- Persist typed note IDs, references, and definitions in semantic HTML using a
  documented `data-wm-*` contract.
- Compile references and definitions into the existing typed IR without
  coupling them to visual numbering.
- Keep numbering derived from publication order so moving content renumbers
  notes deterministically.
- Render page footnotes in PDF, native Word footnotes where the DOCX library can
  do so without document repair, and EPUB 3 noteref/footnote relationships.
- If native DOCX notes are not viable, record the dependency decision and ship
  endnotes only as an explicitly named profile capability rather than silently
  degrading footnotes.
- Add diagnostics for missing definitions, duplicate IDs, unreachable notes,
  circular references, and notes excluded from the selected scope.

The persisted editor contract is:

```html
<sup
  class="wm-footnote-reference"
  data-wm-footnote-id="note-stable-id"
  role="doc-noteref"
  >note</sup
>
<aside
  class="wm-footnote-definition"
  data-wm-footnote-id="note-stable-id"
  data-wm-footnote-body="The note body."
  role="doc-footnote"
>
  ...
</aside>
```

IDs contain 1-100 ASCII letters, numbers, hyphens, or underscores. The visible
editor label is not a publication number. The compiler reads the typed ID and
body attributes, and each adapter derives display numbering from included
reference order. The native DOCX decision is recorded in
`docs/adr/0002-native-docx-footnotes.md`.
1

### Exit criteria

- References survive editing, reordering, scope selection, and regeneration.
- Word and LibreOffice open DOCX notes without repair.
- EPUBCheck reports zero errors for note fixtures.
- PDF notes do not collide with body text or page furniture.

## Slice 6.4 — reusable matter templates and master pages

Implementation status: code complete; automated acceptance checks pass.

### Goal

Replace repeated free-form setup with safe, reusable front/back-matter
components and versioned layout choices.

### Implementation

- Define typed template components such as title page, copyright, dedication,
  contents, acknowledgements, author biography, and Also By placeholder.
- Keep existing free-text front/back matter readable and editable during
  migration.
- Store template selection and variables in publishing configuration; store
  built-in template definitions with the application and version them.
- Define constrained master-page settings for page furniture, section starts,
  headers, folios, and intentional blanks. Do not expose raw Typst, OOXML,
  XHTML, or CSS injection.
- Compile templates into ordinary `BookSection` and `Block` values before
  adapter invocation.
- Include template ID/version and resolved variables in publish recipes and
  source hashing.

The built-in matter catalog currently pins version 1 of Title Page, Copyright,
Dedication, Contents, Acknowledgements, Author Biography, and Also By. Selected
components compile into ordinary `BookSection` and `Block` values before shared
preflight. The existing free-text front/back-matter fields introduced before
schema v5 remain readable in schema v6 and are emitted alongside selected
templates.

Master pages are intentionally constrained to versioned built-ins rather than
raw formatter code. `profile_default@1` preserves the existing Print Interior
controls, `classic_book@1` resolves to recto starts with intentional blank
versos, running heads, Roman front-matter folios, and Arabic body folios, and
`minimal_book@1` resolves to next-page starts without running heads or
front-matter folios. Non-default master pages are limited to Print Interior PDF
until equivalent Word section-page semantics are qualified.

Publishing schema v6 (building on the v5 template fields), saved profiles,
artifact recipes, and source hashing all
record the exact template IDs, versions, resolved variables, and master-page
selection. Unknown IDs or versions fail with `PUBLISH_TEMPLATE_INVALID` rather
than silently substituting a newer template. The compatibility decision is
recorded in `docs/adr/0003-versioned-publishing-templates.md`.

### Exit criteria

- Template output is deterministic for a saved profile and source snapshot.
- All generated matter participates correctly in scope, navigation, page
  numbering, and accessibility semantics.
- Updating the application does not silently change an existing saved recipe.

Automated qualification includes QA09 across Proof PDF, Print Interior PDF,
both DOCX profiles, and EPUB. Current Word and LibreOffice must still be checked
for repair prompts and editable matter-page behavior as a manual release gate.

## Slice 6.5 — large-print and hardcover profiles

Implementation status: code complete; automated acceptance checks pass.

### Goal

Add accurately named provider-neutral print profiles without weakening the
existing Proof PDF and Print Interior contracts.

### Implementation

- Add typed Large Print and Hardcover profile IDs and settings instead of
  overloading `print_interior`.
- Large Print controls should cover base size, leading, line length, heading
  scale, paragraph spacing, and accessible page furniture.
- Hardcover controls should cover supported trim presets, binding-aware gutter,
  recto starts, blank pages, and hardcover-specific margin rules.
- Persist settings through schema migration, named profiles, recipes, source
  hashes, manifests, regeneration, and the Publish UI.
- Add deterministic geometry and minimum-legibility preflight.
- Keep KDP/Ingram-specific labels and provider claims out of this slice.

Publishing schema v6 stores independent `large_print` and `hardcover` settings
alongside the unchanged `print_interior` object. Large Print supports 6 x 9,
7 x 10, and 8 x 10 page boxes with 14–24 pt body type, 1.2–2.0 line spacing,
35–65-character proportional-type measure targets, heading scale, paragraph
spacing, and 10–18 pt running furniture. Its default is 7 x 10, 16 pt body
type, 1.5 spacing, a 50-character target, and 11 pt furniture.

Hardcover supports 5.5 x 8.5, 6 x 9, and 7 x 10 page boxes. Its independently
validated settings require hardcover minimum margins, at least a 0.125-inch
gutter, and at least 1 inch of combined inside margin and gutter. Recto starts
require explicitly enabled blank versos; those versos suppress headers and
folios. The profile remains provider-neutral and makes no retailer readiness
claim.

Both settings objects are included in schema migration, named workflows,
manifest recipes, regeneration, active-profile source hashing, the Publish UI,
and QA10. The Proof PDF and Print Interior Typst source functions remain on
their existing code paths; Slice 6.5 adds separate advanced-profile source
generation rather than changing their defaults. The profile boundary and
provider-neutral claims decision is recorded in
`docs/adr/0004-provider-neutral-advanced-pdf-profiles.md`.

The expanded QA matrix also exposed a pre-existing Slice 6.4 regression: the
implicit generated Title Page could satisfy `PUBLISH_EMPTY_SCOPE` after every
source-backed section was excluded. Preflight now ignores that synthetic title
section when deciding whether a publication contains prose, and EPUB empty
scope diagnostics follow the same rule. This changes failure behavior only;
the existing Proof PDF and Print Interior QA01 artifacts remain byte-identical.

### Exit criteria

- Page boxes, typography, margins, gutters, headers, and folios match each
  selected profile in structural PDF tests.
- Existing PDF profiles remain byte-behavior compatible except for intentional
  bug fixes documented in the change.

## Slice 6.6 — RTL qualification and vertical-writing spike

### Goal

Turn partial direction support into a qualified RTL workflow and determine
whether vertical writing is feasible across the supported formats.

### Implementation

- Add paragraph direction and document progression controls to the editor and
  publishing metadata.
- Verify bidi behavior for mixed-script paragraphs, lists, punctuation, page
  furniture, links, headings, and numbers.
- Add font fallback coverage for representative Arabic and Hebrew fixtures.
- Qualify PDF, DOCX, and EPUB structurally and visually on supported desktop
  platforms.
- Treat vertical writing as a separate time-boxed spike. Record renderer,
  OOXML, EPUB CSS, font, preview, and accessibility results before committing
  to UI or persistence changes.
- Do not advertise vertical writing if one output silently converts or drops
  its semantics.

### Exit criteria

- RTL fixtures remain readable and correctly ordered in the target readers.
- The vertical-writing spike ends in an ADR with an implement, format-limited,
  or defer decision.

## Slice 6.7 — box sets, volumes, and multi-work metadata

### Goal

Build on existing `volume`, `work`, installment, and scope semantics to publish
multi-work editions without flattening their hierarchy.

### Implementation

- Add explicit volume/work metadata and deterministic inherited defaults.
- Support full box set, selected volumes, and selected works while retaining
  required ancestors and shared matter.
- Generate nested navigation and format-appropriate structural starts.
- Define whether metadata such as contributors, identifiers, and subtitles is
  publication-wide or volume-specific.
- Extend saved profiles and manifests with the selected multi-work scope.

### Exit criteria

- Navigation and document order exactly match the Publish outline.
- Selecting one volume or work cannot leak excluded siblings.
- Regeneration preserves the same hierarchy and metadata resolution.

## Slice 6.8 — accessible tables and semantic callouts

### Goal

Add intentionally constrained nonfiction structures without accepting arbitrary
HTML that adapters cannot reproduce.

### Implementation

- Extend the IR with explicitly tagged table, table-row, table-cell, and
  callout variants. Unknown variants must continue to fail deserialization.
- Define table captions, header rows/columns, cell spans, alignment, and
  accessibility associations before adding editor UI.
- Define a small semantic callout vocabulary rather than arbitrary styled
  containers.
- Add editor controls and paste normalization that reject unsupported nested or
  malformed structures.
- Render true tables/callouts in DOCX and EPUB and a pagination-safe equivalent
  in PDF.
- Keep the current fail-closed behavior for unsupported table HTML until the
  entire path is complete.

### Exit criteria

- No supported table or callout is flattened into unstructured prose.
- Screen-reader relationships and reading order are represented in EPUB and
  DOCX where supported.
- Oversize or unsplittable print structures produce actionable preflight.

## Slice 6.9 — direct-sales bundles and reusable Also By pages

### Goal

Generate a deliberate multi-artifact customer bundle and reusable promotional
matter without conflating it with retailer upload automation.

### Implementation

- Let a saved profile select multiple output formats for one bundle job while
  retaining one source snapshot and one diagnostic set.
- Extend manifests from their existing multi-artifact-capable shape and commit
  all artifacts atomically.
- Package artifacts, cover assets, checksums, and a human-readable manifest in
  a deterministic ZIP.
- Generate Also By content from structured project metadata and explicit
  ordering, with per-format inclusion rules.
- Add bundle-aware progress, cancellation, regeneration, history, copy, and
  cleanup.
- Keep storefront upload, payment, licensing, and DRM out of scope.

### Exit criteria

- A failed artifact prevents the bundle from being recorded as successful.
- A successful bundle records one snapshot hash and every contained artifact.
- Also By output is reproducible and never inferred from directory names.

## Cross-slice definition of done

Every Phase 6 slice must satisfy all of the following:

- Preserve tree order, arbitrary depth, publication identity, and the awaited
  editor snapshot flush.
- Keep the semantic compiler format-neutral; adapters must not traverse the
  project tree or parse editor HTML.
- Support a construct in every selected output or block it during preflight
  with a stable diagnostic before artifact creation.
- Use typed, versioned, backward-compatible persistence with atomic writes.
- Include new settings in saved profiles, replay recipes, source hashes, and
  manifests when they affect output.
- Leave failed and cancelled jobs without a successful manifest, destination
  artifact, or temporary export directory.
- Add or extend a checked-in QA source fixture and expectation document.
- Pass Rust tests, Jest tests, TypeScript, Vite, structural adapter tests, and
  the headless Publish QA matrix.
- Complete targeted manual checks in the actual editor and relevant readers.
- Avoid KDP-ready, Ingram-ready, or equivalent provider claims until the later
  provider-qualification phase is completed.

## Recommended starting checkpoint

Begin with Slice 6.1 only. It provides immediate user-visible value, exercises
the editor-to-IR contract, and establishes the blot, clipboard, accessibility,
and fixture conventions that images, notes, tables, and callouts will reuse.
Do not combine project assets or footnotes into the first implementation pull
request.
