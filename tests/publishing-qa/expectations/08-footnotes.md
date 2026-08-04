# Publish QA 08 â€” Footnotes

This project validates stable semantic note IDs and publication-order numbering.
Publish the full project with every PDF, DOCX, and EPUB profile.

## Expected content and numbering

- `FOOTNOTE-FIRST-REFERENCE` is followed by note number 1 with body
  `FIRST-NOTE-BODY -- zeta ID, first in publication order.`
- `FOOTNOTE-SECOND-REFERENCE` is followed by note number 2 with body
  `SECOND-NOTE-BODY -- alpha ID, second in publication order.`
- The lexical IDs (`note-zeta` then `note-alpha`) never appear as visible note
  labels. Moving the chapters in the Publish outline must renumber the notes
  from the new reading order without changing either stored ID.
- Each note body appears once and definitions do not also appear as ordinary
  body paragraphs.

## Format checks

- Proof and Print Interior PDF use page footnotes that stay inside the page
  content area and do not collide with body text, headers, or folios.
- Standard Manuscript and Clean Handoff DOCX contain native Word footnotes and
  open in current Word and LibreOffice without a repair prompt.
- EPUB uses EPUB 3 `noteref` and `footnote` semantics, numeric labels 1 and 2,
  and return links. EPUBCheck must report zero errors.
