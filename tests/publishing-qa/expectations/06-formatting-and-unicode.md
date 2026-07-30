# Publish QA 06 — Formatting and Unicode

Expected:

- All six heading levels, paragraph marks, block quote, nested mixed lists, link, soft line break, indentation, alignments, and scene break survive without literal HTML.
- EPUB remains reflowable when reader font family, size, margins, line spacing, and theme are changed.
- DOCX uses real list numbering and named styles.
- Check the final Unicode sentinel and every language. Missing glyphs in PDF are a regression to record, not an expected pass.
- External link remains live in EPUB and DOCX.
