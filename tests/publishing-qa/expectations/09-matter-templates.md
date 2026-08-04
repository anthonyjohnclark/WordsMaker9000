# Publish QA 09 - Matter Templates

This fixture verifies Phase 6 Slice 6.4 reusable matter templates and the
versioned Classic Book master page.

## All formats

- The title page contains `Pages of Record`, the subtitle, and `Quinn Tester`
  exactly once as a title-page component; enabling the explicit template must
  not create a second title page.
- Generated front matter appears before `TEMPLATE-BODY-SENTINEL` in this order:
  Copyright, Dedication, Contents, then the legacy free-text front matter.
- Generated back matter appears after the body and legacy free-text back matter
  in this order: Acknowledgements, About the Author, Also By.
- The following values appear exactly once:
  `TEMPLATE-COPYRIGHT-RIGHTS-SENTINEL`,
  `TEMPLATE-DEDICATION-SENTINEL`,
  `LEGACY-FRONT-MATTER-SENTINEL`,
  `LEGACY-BACK-MATTER-SENTINEL`,
  `TEMPLATE-ACKNOWLEDGEMENTS-SENTINEL`, and
  `TEMPLATE-BIOGRAPHY-SENTINEL`.
- Contents includes `Template Chapter`; Also By includes `Earlier Orbit` before
  `Later Orbit`.
- Manifests record template IDs, version `1`, resolved variables, and the
  `classic_book` master-page selection.

## PDF

- Proof PDF preserves every generated and legacy matter component.
- Print Interior uses the Classic Book v1 master page: right-hand body starts,
  intentional blank versos when required, running heads, Roman front-matter
  folios, and Arabic body folios.
- Specific matter titles are visible; generic `Front Matter` or `Back Matter`
  headings are not generated.

## DOCX

- Both profiles contain the generated matter as editable Word paragraphs and
  list content in publication order.
- Existing profile-specific title-page and header behavior remains intact.

## EPUB

- The navigation TOC lists named matter in publication order, and landmarks
  still identify title, body, and back matter.
- Generated matter is semantic XHTML and remains readable with reader-selected
  fonts and text sizes.
- EPUBCheck reports zero errors and warnings.
