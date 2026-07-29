# Publish QA 05 — Format Inclusion

Do not toggle the per-node Include checkboxes before the first comparison; the persisted config contains format-specific rules that the current compact UI does not display separately.

Expected body sentinels:

| Format | Must appear | Must not appear |
| --- | --- | --- |
| PDF | ALL, PDF-ONLY | DOCX-ONLY, EPUB-ONLY, EXCLUDED |
| DOCX | ALL, DOCX-ONLY | PDF-ONLY, EPUB-ONLY, EXCLUDED |
| EPUB | ALL, EPUB-ONLY | PDF-ONLY, DOCX-ONLY, EXCLUDED |

The empty included chapter remains structural. PDF and DOCX include shared front and back matter. EPUB initially excludes front matter and includes back matter; enable its front-matter checkbox and republish to verify the EPUB-only rule.
