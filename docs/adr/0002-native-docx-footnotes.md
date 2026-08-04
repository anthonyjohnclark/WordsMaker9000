# ADR 0002: Use docx-rs native Word footnotes

- Status: Accepted
- Date: 2026-08-03
- Scope: Phase 6 Slice 6.3 note rendering

## Context

The publishing IR already distinguishes typed footnote references from typed
footnote definitions. Slice 6.3 requires native Word footnotes when the pinned
DOCX dependency can emit them without creating a document that Word or
LibreOffice asks to repair. If native notes are not viable, the roadmap permits
only an explicitly named endnote capability; it does not permit silently
flattening notes into body paragraphs.

The application pins `docx-rs = 0.4.22` with default features disabled. That
version provides `Footnote`, `Run::add_footnote_reference`, package collection,
the `word/footnotes.xml` content type, and the document relationship.

## Decision

Use the existing pinned `docx-rs` native-footnote API for both Standard
Manuscript and Clean Handoff DOCX profiles.

- Stable WordsMaker note IDs remain an IR/editor concern and are never used as
  visible Word note numbers.
- References are rendered in publication order. `docx-rs` assigns the OOXML
  footnote IDs as each reference is rendered, and Word supplies the displayed
  numbering.
- Definitions remain outside ordinary body flow and are collected by typed ID.
- Missing, duplicate, excluded, unreachable, nested, and circular note
  relationships are diagnosed before rendering.
- Package validation requires `word/footnotes.xml` and the native footnotes
  relationship whenever `document.xml` contains a footnote reference.
- No endnote fallback or new DOCX profile is introduced.

## Acceptance evidence

Structural tests verify:

- `<w:footnoteReference>` occurs in `word/document.xml`;
- the note body occurs in `word/footnotes.xml` rather than ordinary body flow;
- `[Content_Types].xml` declares the footnotes part;
- `word/_rels/document.xml.rels` contains the footnotes relationship.

The checked-in Publish QA 08 fixture exercises both DOCX profiles with note IDs
whose lexical order differs from their publication order. Current Microsoft
Word and LibreOffice on Windows must still be checked for a repair prompt as a
manual release-qualification gate.

## Consequences

- The initial note editor intentionally authors plain-text note bodies. The IR
  remains capable of richer blocks for later expansion.
- Updating `docx-rs` requires rerunning structural tests plus Word and
  LibreOffice repair-prompt checks.
- If a future dependency regression makes native footnotes unreliable, the
  application must block DOCX note publishing or introduce an explicitly
  named endnote capability through a new decision; it must not flatten notes.
