# Publish QA 10 - Large Print and Hardcover

This fixture verifies Phase 6 Slice 6.5 provider-neutral PDF profiles. DOCX,
EPUB, Proof PDF, and Print Interior remain regression outputs; the checks below
are specific to Large Print and Hardcover.

## Shared content

- The title page appears exactly once.
- `ADVANCED-PRINT-FRONT-SENTINEL.` precedes both body chapters.
- Body order is `ADVANCED-PRINT-FIRST-SENTINEL.` and then
  `ADVANCED-PRINT-SECOND-SENTINEL.`
- `ADVANCED-PRINT-BACK-SENTINEL.` follows the body.
- `ADVANCED-PRINT-HEADING-SENTINEL` remains a semantic heading.
- No text, footnote, running header, or folio clips into the page edge or
  binding margin.

## Large Print PDF

- Every page box is exactly 8 x 10 inches (576 x 720 PDF points).
- Body type is 18 pt with 1.6 line spacing, 8 pt paragraph-after spacing, and
  a 1.6 heading scale.
- The proportional-type measure is capped using the saved 48-character target.
- Running headers and Roman/Arabic folios use 12 pt type and do not appear on
  structural opening pages.
- Chapters start on the next page; no blank verso is inserted solely to force
  a recto opening.

## Hardcover PDF

- Every page box is exactly 7 x 10 inches (504 x 720 PDF points).
- Top and bottom margins are 1 inch. The inside text edge is 1.25 inches from
  the binding edge: 0.875-inch inside margin plus 0.375-inch gutter. The
  outside margin is 0.75 inch.
- Both chapters begin on recto pages. Any inserted verso is completely blank,
  without a header or folio.
- Front matter uses Roman folios, body matter restarts at Arabic page 1, and
  chapter-opening furniture remains suppressed.

## Persistence and replay

- Each manifest recipe identifies the exact profile and contains the complete
  corresponding settings object.
- Regeneration and a saved named workflow reproduce the same settings and page
  geometry.
- KDP, IngramSpark, or other provider-specific readiness claims do not appear
  in the UI, artifact, or manifest.
