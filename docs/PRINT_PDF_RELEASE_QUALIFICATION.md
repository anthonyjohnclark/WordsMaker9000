# Print Interior PDF release qualification

The `print_interior` profile is a provider-neutral print-book interior. Do not
label it KDP-ready or Ingram-ready until the manual checks below have passed for
the release candidate.

## Automated baseline

Run from the repository root:

```powershell
cargo test --manifest-path .\src-tauri\Cargo.toml
node .\node_modules\jest\bin\jest.js --config .\jest.config.cjs --runInBand
node .\node_modules\typescript\bin\tsc -b --pretty false
node .\node_modules\vite\bin\vite.js build
powershell -ExecutionPolicy Bypass -File .\tests\publishing-qa\scripts\generate_publish_qa_outputs.ps1
```

The headless matrix generates both Proof PDF and Print Interior PDF artifacts.
For Print Interior PDFs, verify:

- every page uses the selected trim size:
  - 5 × 8 inches: 360 × 576 PDF points;
  - 5.25 × 8 inches: 378 × 576 PDF points;
  - 5.5 × 8.5 inches: 396 × 612 PDF points;
  - 6 × 9 inches: 432 × 648 PDF points;
- inside and outside margins alternate with page parity, with the gutter added
  only to the inside margin;
- chapters configured for recto starts begin on odd-numbered physical pages;
- inserted verso pages are blank;
- the title page, chapter-opening pages, and intentional blanks have no running
  head or visible folio;
- front matter uses lowercase Roman folios when enabled;
- body folios restart at Arabic 1;
- even-page running heads show the author and odd-page running heads show the
  title when enabled;
- fonts are embedded and multilingual acceptance text has no missing glyphs.

## KDP Previewer

Status: **Pending manual qualification**

Upload representative 5 × 8 and 6 × 9 interiors. Record:

- release candidate commit;
- selected trim and margin settings;
- page count;
- whether trim, margins, gutter, blank pages, fonts, and pagination pass;
- every warning and its resolution.

## IngramSpark

Status: **Pending manual qualification**

Upload the same representative interiors and record the same evidence. Provider
acceptance is a release gate; structural tests alone do not establish provider
compatibility.
