# ADR 0003: Pin publishing templates by ID and version

- Status: Accepted
- Date: 2026-08-04
- Scope: Phase 6 Slice 6.4 matter templates and master pages

## Context

Reusable matter and page layouts must reduce repetitive setup without making a
saved publishing workflow change merely because the application was upgraded.
Allowing raw Typst, OOXML, XHTML, or CSS would also bypass the typed publishing
model and its preflight guarantees.

## Decision

Store every selected built-in as an explicit template ID plus version.

- Matter selections store resolved, bounded variables in deterministic key
  order and compile into ordinary `BookSection` and `Block` values before
  preflight or adapter invocation.
- Master-page selections resolve into the existing typed Print Interior page
  controls. They cannot alter trim size, margins, or gutter geometry.
- `profile_default@1` preserves existing behavior. `classic_book@1` and
  `minimal_book@1` are the first constrained master-page definitions.
- Unknown IDs, unknown versions, duplicate selections, unknown variables, and
  missing required variables fail closed with `PUBLISH_TEMPLATE_INVALID`.
- Recipes, manifests, project configuration, and source hashes retain the
  selected IDs, versions, and resolved variables.
- Existing free-text front and back matter remains readable, editable, and is
  emitted alongside selected templates.
- `title_page@1` is recorded as a required implicit selection because every
  existing output profile already generates a title page; making it explicit
  changes recipes and hashes without duplicating or removing legacy output.

Released template versions are immutable. A behavior change requires a new
version while the old implementation remains available for saved recipes.

## Consequences

The Publish UI exposes a finite built-in catalog instead of formatter source.
Non-default master pages are initially restricted to Print Interior PDF; Word
master-page behavior requires separate native section/header qualification.
QA09 pins generated ordering and values across PDF, DOCX, and EPUB.
