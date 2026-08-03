# Publish QA 07 — Accessible Images

This project validates the Phase 6 project-asset registry and semantic body
images. Publish the full project with every PDF, DOCX, and EPUB profile.

## Expected content and order

- `IMAGE-QA-BEFORE` appears before the informative moon image.
- The informative image is full width, followed by the visible caption
  `Moon study — informative image`.
- `IMAGE-QA-BETWEEN` appears between the informative and decorative images.
- The decorative image appears before `IMAGE-QA-AFTER` and has no visible
  caption.
- Neither output nor its manifest contains an absolute source-machine path or
  a base64/data URL.

## Accessibility and package checks

- EPUB XHTML gives the informative image alt text
  `A white moon above a navy field`; the decorative image has empty alt text
  and presentation semantics. The PNG is present in the OPF manifest and ZIP.
- DOCX contains image relationships and media, preserves the informative alt
  text in `wp:docPr/@descr`, and includes the caption as ordinary document
  text. It opens in Word and LibreOffice without repair.
- PDF contains both image placements inside page bounds. The deliberately tiny
  1 × 1 fixture produces
  `PDF_IMAGE_LOW_RESOLUTION`; that warning is expected and must not block the
  artifact.
- Proof PDF, Print Interior PDF, Standard Manuscript DOCX, Clean Handoff DOCX,
  and Reflowable EPUB all succeed.
