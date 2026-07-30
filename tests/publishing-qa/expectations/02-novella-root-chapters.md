# Publish QA 02 — Novella Root Chapters

Expected:

- Each root file is exactly one chapter with its actual title.
- No duplicate generated `Chapter 1`/`Chapter 2` outline rows appear.
- The first chapter contains three implicit scenes divided by `#` and `* * *`.
- The intentionally empty epilogue remains an empty structural chapter.
- EPUB is allowed to publish without a cover or supplied identifier, but should report the expected warnings and derive an export identifier.
- Before one run, type `UNSAVED-BUFFER-SENTINEL` into Chapter Two and immediately publish; it must appear in the output.
