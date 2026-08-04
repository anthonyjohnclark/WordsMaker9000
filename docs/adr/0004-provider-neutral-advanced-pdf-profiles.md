# ADR 0004: Provider-neutral advanced PDF profiles

- Status: Accepted
- Date: 2026-08-04
- Scope: Phase 6 Slice 6.5 Large Print and Hardcover PDF profiles

## Context

`proof_pdf` is a review artifact and `print_interior` is a configurable general
book interior. Large-print typography and hardcover binding geometry have
different validation and replay requirements. Treating either as another
Print Interior preset would obscure those contracts and make artifact history
ambiguous.

The application has not completed provider-specific qualification. Profile
names and diagnostics must therefore describe the generated document without
claiming acceptance by KDP, IngramSpark, or another printer.

## Decision

- Add stable `large_print` and `hardcover` profile IDs with independent,
  explicitly serialized settings objects.
- Keep `PrintInteriorPdfSettings` and the existing Proof/Print Interior Typst
  source paths unchanged.
- Use a deterministic 0.45em proportional-type estimate to translate the Large
  Print maximum-character target into a text-measure cap. This is a layout
  control, not a promise that every rendered line contains that many glyphs.
- Enforce Large Print minimums of 14 pt body type and 10 pt page furniture,
  together with bounded leading, heading scale, paragraph spacing, measure,
  and geometry.
- Treat the Hardcover gutter as additional inside space. Require at least a
  0.125-inch gutter and at least 1 inch of combined inside margin and gutter.
- Recto Hardcover starts require intentional blank versos. Inserted versos are
  completely blank and suppress running furniture.
- Persist only the active profile's settings on publish, while recipes retain
  all settings needed for exact regeneration. Hash only the active profile's
  settings so unrelated controls do not change publication identity.
- Keep all labels provider-neutral until the separate provider-qualification
  phase is complete.

## Consequences

Publishing schema v6 lazily adds default Large Print and Hardcover profile
objects to older configurations without rewriting them during load. Named
workflows, manifest recipes, regeneration, the Publish UI, and QA fixtures can
distinguish the profiles exactly. Future changes to these contracts require a
new profile/settings version or an explicitly documented migration; existing
saved recipes must not silently acquire different geometry.
