# ADR 0001: Use Typst for Proof PDF rendering

- Status: Accepted
- Date: 2026-07-30
- Scope: Proof PDF renderer foundation before Phase 4 print profiles

## Context

The original Proof PDF adapter uses `genpdf`. It is small and already consumes
`BookDocument`, but the shared Publish QA manuscript demonstrates requirements
that its high-level layout API cannot satisfy:

- fallback across multiple font families;
- Arabic and Hebrew shaping and bidirectional layout;
- CJK and symbol coverage;
- justified paragraphs;
- logical start/end alignment in both text directions.

The roadmap requires a decision based on the same acceptance manuscript rather
than a feature-list comparison. That manuscript is checked in at
`src-tauri/src/publishing/fixtures/pdf_acceptance_document.json`, and the
repeatable comparison command is:

```powershell
cd src-tauri
cargo run --locked --example pdf_renderer_spike -- --output target/pdf-renderer-spike
```

The command renders both adapters, reports elapsed time and output size, and
writes the PDFs beside one another for visual inspection.

## Options considered

### Continue extending `genpdf`

Advantages:

- lowest immediate migration cost;
- existing adapter and tests remain useful;
- pure Rust with a comparatively small dependency graph.

Disadvantages:

- no justified-paragraph mode;
- no general font fallback;
- no bidirectional layout or complex-script shaping;
- advanced print controls would require increasingly custom layout elements.

### Embed Typst

Advantages:

- native font fallback, Unicode shaping, bidirectional text, justification, and
  paged layout;
- pure Rust renderer with direct PDF generation;
- page, margin, header/footer, numbering, and template primitives needed by
  Phase 4;
- fonts are subset and embedded in the generated PDF.

Disadvantages:

- materially larger compile time, dependency graph, and application binary;
- templates become a security boundary;
- the current release line compatible with Rust 1.88 must be pinned;
- full deterministic multilingual coverage requires bundled fallback fonts.

### HTML/CSS paged rendering

Advantages:

- familiar styling model;
- could eventually share concepts with a browser preview.

Disadvantages:

- requires packaging and controlling a browser/print engine;
- cross-platform pagination is harder to make deterministic;
- adds a much larger operational surface than the current desktop application.

## Decision

Use Typst for Proof PDF and as the foundation for Phase 4 print profiles.

- Pin `typst` and `typst-pdf` to `0.13.1` and `typst-as-lib` to `0.14.4`.
  Typst 0.14 requires Rust 1.89, while the application baseline is Rust 1.88.
- Pin the `enum-ordinalize` transitive pair to `4.3.0`; the unconstrained 4.4
  patch requires Rust 1.89.
- Keep the old `genpdf` adapter temporarily as the comparison implementation.
- Translate `BookDocument` to Typst internally. Every user-controlled string is
  emitted as an escaped Typst string argument, never as executable markup.
- Bundle only the four required Libertinus Serif faces sourced from
  `typst-assets`, plus Noto fallback fonts for CJK, Arabic, Hebrew, emoji, and
  symbols. Do not enable Typst's broad embedded-font search or OS font
  discovery, so unused families do not inflate the binary and output does not
  change with the rendering machine.
- Treat every Typst compile warning as a blocking render error. Missing glyphs
  therefore cannot silently become boxes or disappear from a successful PDF.
- Preserve the current Proof PDF payload, Tauri commands, profile ID, artifact
  history, and frontend behavior. Print-specific page controls remain Phase 4.

## Acceptance evidence

Automated checks cover:

- A4 page dimensions and embedded PDF fonts;
- compilation of the complete acceptance manuscript without warnings;
- escaped source strings;
- real ordered and bullet lists, including nesting;
- soft line breaks;
- justified paragraphs;
- direction-aware alignment and indentation;
- Latin marks and links;
- Greek, Cyrillic, CJK, Arabic, Hebrew, symbols, and a rocket glyph;
- explicit page/scene breaks and deeply nested section order.

The side-by-side harness is retained because text extraction and structural PDF
checks cannot establish every visual property. Rendered-page inspection remains
part of renderer and release qualification.

## Measurements

Record measurements from a clean release build and the comparison harness on
the qualification machine:

| Measurement | `genpdf` | Typst |
| --- | ---: | ---: |
| Warm acceptance render time, Windows dev build | 4,239 ms | 413 ms |
| Acceptance PDF size | 4,489,547 bytes | 43,536 bytes |
| Cold release build time | Not remeasured | Exceeded 20 min; completed in a subsequent 5m23s pass |
| Release executable size | 15,884,288 bytes (last pre-Typst local build) | 72,935,936 bytes |

The measured PDF values come from the same warm comparison run on the Windows
qualification machine; they are evidence for the adapter comparison, not a
cross-platform benchmark. The first complete Typst release binary was
80,457,216 bytes. Removing the optional broad embedded-font search and bundling
only the selected faces reduced it to 72,935,936 bytes; that final feature-graph
rebuild took 8m04s. The remaining 57,051,648-byte increase over the last local
pre-Typst binary is accepted for the renderer foundation because correct
shaping, fallback, and justification are hard requirements. A clean release
measurement on CI hardware should still be captured before a Phase 4 release is
qualified; the acceptance command prints artifact time and size on every run.

## Consequences

- Phase 4 can build trim sizes, mirrored margins, recto starts, running heads,
  and pagination rules on a renderer that already meets the typography floor.
- The application distribution must continue to include
  `resources/licenses/typst-assets-NOTICE.txt` and
  the `resources/licenses/Noto-*-OFL-1.1.txt` notices.
- Updating Typst requires a deliberate Rust-version and output-compatibility
  review instead of a broad dependency update.
- The legacy `genpdf` adapter can be removed after Phase 4 profiles have their
  own comparison fixtures and the selected provider qualification is complete.
