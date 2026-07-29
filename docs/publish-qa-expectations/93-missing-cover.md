# Publish QA 93 — Expected EPUB Failure: Missing Cover

EPUB preflight should block with `EPUB_COVER_MISSING` because `publishing.json` points to `missing-cover.svg`, which intentionally does not exist. No EPUB or successful manifest should be created. PDF and DOCX should still publish because the missing asset is EPUB-specific.
