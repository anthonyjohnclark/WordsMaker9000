# Publish QA 06 — Formatting and Unicode

Expected:

- All six heading levels, paragraph marks, block quote, nested mixed lists, link, soft line break, indentation, alignments, and the explicit semantic scene break survive without literal HTML.
- Bold text in Heading One and the live link in Heading Two survive. The semantic scene break appears between the exact `Before semantic scene break.` and `After semantic scene break.` sentinels in PDF, both DOCX profiles, and EPUB.
- EPUB remains reflowable when reader font family, size, margins, line spacing, and theme are changed.
- DOCX uses real list numbering and named styles.
- Check the final Unicode sentinel and every language. Missing glyphs in PDF are a regression to record, not an expected pass.
- External link remains live in EPUB and DOCX.
