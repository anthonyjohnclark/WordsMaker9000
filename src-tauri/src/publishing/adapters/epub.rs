use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};

use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::publishing::model::{
    AssetId, AssetSource, Block, BookAsset, BookDocument, BookSection, FootnoteId, HeadingLevel,
    ImagePresentation, Inline, ListItem, OutputFormat, ParagraphAlignment, SectionInclusion,
    SectionRole, TextDirection,
};
use crate::publishing::request::PageProgressionDirection;
use crate::publishing::templates::is_title_page_template_section;

const MIMETYPE: &str = "application/epub+zip";
const CONTAINER_XML: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
"#;

const REFLOWABLE_CSS: &str = r#"html {
  -webkit-text-size-adjust: 100%;
}
body {
  margin: 5%;
  line-height: 1.5;
}
h1, h2, h3, h4, h5, h6 {
  break-after: avoid;
  line-height: 1.2;
}
img {
  display: block;
  max-width: 100%;
  height: auto;
  margin-inline: auto;
}
.title-page, .cover-page {
  text-align: center;
}
.title-page {
  break-after: page;
}
.subtitle {
  font-size: 1.15em;
}
.align-center, .scene-break {
  text-align: center;
}
.align-end {
  text-align: end;
}
.align-justify {
  text-align: justify;
}
.underline {
  text-decoration: underline;
}
blockquote {
  margin-inline: 1.5em;
}
.scene-break {
  margin-block: 1.5em;
}
.page-break {
  break-before: page;
}
figure {
  margin-inline: 0;
}
.image-block img {
  max-width: 75%;
}
.image-full-width img {
  width: 100%;
}
figcaption {
  font-size: 0.9em;
  text-align: center;
}
"#;

#[derive(Debug, Clone)]
pub(crate) struct EpubCover {
    pub source_path: PathBuf,
    pub alt_text: String,
}

#[derive(Debug, Clone)]
pub(crate) struct EpubRenderOptions {
    pub project_root: PathBuf,
    pub identifier: String,
    pub modified_utc: String,
    pub cover: Option<EpubCover>,
    pub page_progression_direction: Option<PageProgressionDirection>,
    pub include_front_matter: bool,
    pub include_back_matter: bool,
}

#[derive(Debug)]
struct SectionPlan<'a> {
    item_id: String,
    href: String,
    title: String,
    depth: usize,
    section: &'a BookSection,
}

#[derive(Debug)]
struct NavNode {
    title: String,
    href: String,
    children: Vec<NavNode>,
}

#[derive(Debug)]
struct PackagedAsset {
    asset_id: AssetId,
    item_id: String,
    href: String,
    media_type: String,
    source_path: PathBuf,
}

#[derive(Default)]
struct FootnoteCatalog {
    hrefs: HashMap<FootnoteId, String>,
    numbers: HashMap<FootnoteId, usize>,
    reference_hrefs: HashMap<FootnoteId, String>,
}

pub(crate) fn render_epub(
    document: &BookDocument,
    options: &EpubRenderOptions,
    output_path: &Path,
) -> Result<(), String> {
    let language = document
        .metadata
        .language
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "EPUB metadata requires a language.".to_string())?;

    let mut plans = Vec::new();
    let mut counter = 0usize;
    let navigation = plan_sections(&document.sections, options, 1, &mut counter, &mut plans);
    if plans.is_empty() {
        return Err("EPUB publication scope contains no sections.".to_string());
    }

    let packaged_assets = package_assets(&document.assets, &options.project_root)?;
    let asset_hrefs: HashMap<AssetId, String> = packaged_assets
        .iter()
        .map(|asset| (asset.asset_id.clone(), format!("../{}", asset.href)))
        .collect();
    let footnotes = footnote_catalog(&plans);

    let cover = options.cover.as_ref().map(package_cover).transpose()?;
    let title_page = title_page_xhtml(document, language);
    let nav_xhtml = navigation_xhtml(language, &navigation, &plans, cover.is_some());
    let section_documents: Vec<(String, String)> = plans
        .iter()
        .map(|plan| {
            (
                plan.href.clone(),
                section_xhtml(document, language, plan, &asset_hrefs, &footnotes),
            )
        })
        .collect();
    let package_opf = package_document(document, options, &plans, &packaged_assets, cover.as_ref());

    let parent = output_path
        .parent()
        .ok_or_else(|| "EPUB output path has no parent directory.".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Failed to create EPUB output directory: {error}"))?;
    let temporary = tempfile::NamedTempFile::new_in(parent)
        .map_err(|error| format!("Failed to create temporary EPUB: {error}"))?;
    let file = temporary
        .reopen()
        .map_err(|error| format!("Failed to open temporary EPUB: {error}"))?;
    let mut zip = ZipWriter::new(file);

    write_zip_entry(
        &mut zip,
        "mimetype",
        MIMETYPE.as_bytes(),
        CompressionMethod::Stored,
    )?;
    write_zip_entry(
        &mut zip,
        "META-INF/container.xml",
        CONTAINER_XML.as_bytes(),
        CompressionMethod::Deflated,
    )?;
    write_zip_entry(
        &mut zip,
        "OEBPS/package.opf",
        package_opf.as_bytes(),
        CompressionMethod::Deflated,
    )?;
    write_zip_entry(
        &mut zip,
        "OEBPS/nav.xhtml",
        nav_xhtml.as_bytes(),
        CompressionMethod::Deflated,
    )?;
    write_zip_entry(
        &mut zip,
        "OEBPS/styles/book.css",
        REFLOWABLE_CSS.as_bytes(),
        CompressionMethod::Deflated,
    )?;
    write_zip_entry(
        &mut zip,
        "OEBPS/text/title.xhtml",
        title_page.as_bytes(),
        CompressionMethod::Deflated,
    )?;
    if let Some(cover) = &cover {
        write_zip_entry(
            &mut zip,
            "OEBPS/text/cover.xhtml",
            cover.xhtml.as_bytes(),
            CompressionMethod::Deflated,
        )?;
        let bytes = fs::read(&cover.source_path)
            .map_err(|error| format!("Failed to read EPUB cover: {error}"))?;
        write_zip_entry(
            &mut zip,
            &format!("OEBPS/{}", cover.href),
            &bytes,
            CompressionMethod::Deflated,
        )?;
    }
    for (href, xhtml) in section_documents {
        write_zip_entry(
            &mut zip,
            &format!("OEBPS/{href}"),
            xhtml.as_bytes(),
            CompressionMethod::Deflated,
        )?;
    }
    for asset in &packaged_assets {
        let bytes = fs::read(&asset.source_path).map_err(|error| {
            format!(
                "Failed to read EPUB asset {}: {error}",
                asset.source_path.display()
            )
        })?;
        write_zip_entry(
            &mut zip,
            &format!("OEBPS/{}", asset.href),
            &bytes,
            CompressionMethod::Deflated,
        )?;
    }
    let completed = zip
        .finish()
        .map_err(|error| format!("Failed to finish EPUB package: {error}"))?;
    completed
        .sync_all()
        .map_err(|error| format!("Failed to sync EPUB package: {error}"))?;

    validate_epub_archive(temporary.path())?;
    temporary
        .persist(output_path)
        .map_err(|error| format!("Failed to commit EPUB package: {error}"))?;
    Ok(())
}

pub(crate) fn validate_epub_archive(path: &Path) -> Result<(), String> {
    let file = fs::File::open(path)
        .map_err(|error| format!("Failed to open EPUB for validation: {error}"))?;
    let mut archive =
        ZipArchive::new(file).map_err(|error| format!("Invalid EPUB ZIP package: {error}"))?;
    let mut names = HashSet::new();
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|error| format!("Failed to inspect EPUB entry: {error}"))?;
        if !names.insert(entry.name().to_string()) {
            return Err(format!(
                "EPUB package contains duplicate entry {:?}.",
                entry.name()
            ));
        }
    }
    let mut mimetype = archive
        .by_index(0)
        .map_err(|error| format!("EPUB is missing its mimetype entry: {error}"))?;
    if mimetype.name() != "mimetype" || mimetype.compression() != CompressionMethod::Stored {
        return Err(
            "EPUB mimetype must be the first ZIP entry and must be uncompressed.".to_string(),
        );
    }
    let mut value = String::new();
    mimetype
        .read_to_string(&mut value)
        .map_err(|error| format!("Failed to read EPUB mimetype: {error}"))?;
    if value != MIMETYPE {
        return Err("EPUB mimetype entry has an invalid value.".to_string());
    }
    drop(mimetype);

    for required in [
        "META-INF/container.xml",
        "OEBPS/package.opf",
        "OEBPS/nav.xhtml",
        "OEBPS/styles/book.css",
        "OEBPS/text/title.xhtml",
    ] {
        if !names.contains(required) {
            return Err(format!(
                "EPUB package is missing required entry {required:?}."
            ));
        }
    }
    let mut package = String::new();
    archive
        .by_name("OEBPS/package.opf")
        .map_err(|error| format!("EPUB package document is unreadable: {error}"))?
        .read_to_string(&mut package)
        .map_err(|error| format!("EPUB package document is not UTF-8: {error}"))?;
    for required in [
        r#"version="3.0""#,
        "<manifest>",
        "<spine",
        r#"properties="nav""#,
        "schema:accessMode",
        "schema:accessibilityFeature",
        "schema:accessibilityHazard",
    ] {
        if !package.contains(required) {
            return Err(format!(
                "EPUB package document is missing required markup {required:?}."
            ));
        }
    }
    Ok(())
}

fn plan_sections<'a>(
    sections: &'a [BookSection],
    options: &EpubRenderOptions,
    depth: usize,
    counter: &mut usize,
    plans: &mut Vec<SectionPlan<'a>>,
) -> Vec<NavNode> {
    let mut nodes = Vec::new();
    for section in sections {
        if !included_for_epub(section, options) || is_title_page_template_section(section) {
            continue;
        }
        *counter += 1;
        let href = format!("text/section-{:04}.xhtml", *counter);
        let navigation_title = reader_facing_title(section).map(str::to_string);
        let title = navigation_title
            .clone()
            .unwrap_or_else(|| role_label(&section.role).to_string());
        let item_id = format!("section-{:04}", *counter);
        let plan_index = plans.len();
        plans.push(SectionPlan {
            item_id,
            href: href.clone(),
            title: title.clone(),
            depth,
            section,
        });
        let children = plan_sections(&section.children, options, depth + 1, counter, plans);
        if let Some(title) = navigation_title {
            nodes.push(NavNode {
                title,
                href,
                children,
            });
        } else {
            nodes.extend(children);
        }
        debug_assert_eq!(
            plans[plan_index].section.source_node_id,
            section.source_node_id
        );
    }
    nodes
}

fn included_for_epub(section: &BookSection, options: &EpubRenderOptions) -> bool {
    let selected = match &section.inclusion {
        SectionInclusion::AllFormats => true,
        SectionInclusion::SelectedFormats { formats } => formats.contains(&OutputFormat::Epub),
        SectionInclusion::Excluded => false,
    };
    selected
        && (section.role != SectionRole::FrontMatter || options.include_front_matter)
        && (section.role != SectionRole::BackMatter || options.include_back_matter)
}

fn package_assets(assets: &[BookAsset], project_root: &Path) -> Result<Vec<PackagedAsset>, String> {
    assets
        .iter()
        .enumerate()
        .map(|(index, asset)| {
            let source_path = match &asset.source {
                AssetSource::ProjectRelativePath { path } => {
                    resolve_project_relative(project_root, path)?
                }
            };
            let extension = source_path
                .extension()
                .and_then(|value| value.to_str())
                .map(safe_token)
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| extension_for_media_type(&asset.media_type).to_string());
            Ok(PackagedAsset {
                asset_id: asset.id.clone(),
                item_id: format!("asset-{:04}", index + 1),
                href: format!(
                    "images/{:04}-{}.{}",
                    index + 1,
                    safe_token(&asset.id.0),
                    extension
                ),
                media_type: asset.media_type.clone(),
                source_path,
            })
        })
        .collect()
}

struct PackagedCover {
    href: String,
    media_type: String,
    source_path: PathBuf,
    xhtml: String,
}

fn package_cover(cover: &EpubCover) -> Result<PackagedCover, String> {
    let media_type = media_type_for_path(&cover.source_path)
        .ok_or_else(|| "EPUB cover must be a JPEG, PNG, GIF, or SVG image.".to_string())?;
    let extension = cover
        .source_path
        .extension()
        .and_then(|value| value.to_str())
        .map(safe_token)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| extension_for_media_type(media_type).to_string());
    let href = format!("images/cover.{extension}");
    let xhtml = format!(
        "{}<html xmlns=\"http://www.w3.org/1999/xhtml\" xmlns:epub=\"http://www.idpf.org/2007/ops\"><head><title>Cover</title><link rel=\"stylesheet\" type=\"text/css\" href=\"../styles/book.css\" /></head><body class=\"cover-page\"><section epub:type=\"cover\"><img src=\"../{}\" alt=\"{}\" /></section></body></html>\n",
        xml_declaration(),
        escape_attr(&href),
        escape_attr(&cover.alt_text)
    );
    Ok(PackagedCover {
        href,
        media_type: media_type.to_string(),
        source_path: cover.source_path.clone(),
        xhtml,
    })
}

fn title_page_xhtml(document: &BookDocument, language: &str) -> String {
    let subtitle = document
        .metadata
        .subtitle
        .as_deref()
        .map(|value| format!("<p class=\"subtitle\">{}</p>", escape_text(value)))
        .unwrap_or_default();
    let contributors = document
        .metadata
        .contributors
        .iter()
        .map(|contributor| format!("<p>{}</p>", escape_text(&contributor.name)))
        .collect::<String>();
    format!(
        "{}<html xmlns=\"http://www.w3.org/1999/xhtml\" xmlns:epub=\"http://www.idpf.org/2007/ops\" xml:lang=\"{}\" lang=\"{}\"><head><title>{}</title><link rel=\"stylesheet\" type=\"text/css\" href=\"../styles/book.css\" /></head><body><section class=\"title-page\" epub:type=\"titlepage\"><h1>{}</h1>{}{}</section></body></html>\n",
        xml_declaration(),
        escape_attr(language),
        escape_attr(language),
        escape_text(&document.metadata.title),
        escape_text(&document.metadata.title),
        subtitle,
        contributors
    )
}

fn navigation_xhtml(
    language: &str,
    navigation: &[NavNode],
    plans: &[SectionPlan<'_>],
    has_cover: bool,
) -> String {
    let toc = render_navigation_list(navigation);
    let first_body = plans
        .iter()
        .find(|plan| {
            !matches!(
                plan.section.role,
                SectionRole::FrontMatter | SectionRole::BackMatter
            )
        })
        .or_else(|| plans.first());
    let first_back = plans
        .iter()
        .find(|plan| plan.section.role == SectionRole::BackMatter);
    let mut landmarks = String::new();
    if has_cover {
        landmarks.push_str("<li><a epub:type=\"cover\" href=\"text/cover.xhtml\">Cover</a></li>");
    }
    landmarks
        .push_str("<li><a epub:type=\"titlepage\" href=\"text/title.xhtml\">Title Page</a></li>");
    if let Some(plan) = first_body {
        landmarks.push_str(&format!(
            "<li><a epub:type=\"bodymatter\" href=\"{}\">{}</a></li>",
            escape_attr(&plan.href),
            escape_text(&plan.title)
        ));
    }
    if let Some(plan) = first_back {
        landmarks.push_str(&format!(
            "<li><a epub:type=\"backmatter\" href=\"{}\">{}</a></li>",
            escape_attr(&plan.href),
            escape_text(&plan.title)
        ));
    }
    format!(
        "{}<html xmlns=\"http://www.w3.org/1999/xhtml\" xmlns:epub=\"http://www.idpf.org/2007/ops\" xml:lang=\"{}\" lang=\"{}\"><head><title>Navigation</title></head><body><nav epub:type=\"toc\" id=\"toc\"><h1>Contents</h1>{}</nav><nav epub:type=\"landmarks\" hidden=\"hidden\"><h2>Landmarks</h2><ol>{}</ol></nav></body></html>\n",
        xml_declaration(),
        escape_attr(language),
        escape_attr(language),
        toc,
        landmarks
    )
}

fn render_navigation_list(nodes: &[NavNode]) -> String {
    let items = nodes
        .iter()
        .map(|node| {
            let children = if node.children.is_empty() {
                String::new()
            } else {
                render_navigation_list(&node.children)
            };
            format!(
                "<li><a href=\"{}\">{}</a>{}</li>",
                escape_attr(&node.href),
                escape_text(&node.title),
                children
            )
        })
        .collect::<String>();
    format!("<ol>{items}</ol>")
}

fn package_document(
    document: &BookDocument,
    options: &EpubRenderOptions,
    plans: &[SectionPlan<'_>],
    assets: &[PackagedAsset],
    cover: Option<&PackagedCover>,
) -> String {
    let language = document.metadata.language.as_deref().unwrap_or("und");
    let creator_metadata = document
        .metadata
        .contributors
        .iter()
        .enumerate()
        .map(|(index, contributor)| {
            format!(
                "    <dc:creator id=\"creator-{}\">{}</dc:creator>\n",
                index + 1,
                escape_text(&contributor.name)
            )
        })
        .collect::<String>();
    let subtitle = document
        .metadata
        .subtitle
        .as_deref()
        .map(|value| {
            format!(
                "    <dc:title id=\"subtitle\">{}</dc:title>\n    <meta refines=\"#subtitle\" property=\"title-type\">subtitle</meta>\n",
                escape_text(value)
            )
        })
        .unwrap_or_default();
    let publisher = optional_dc("publisher", document.metadata.publisher.as_deref());
    let description = optional_dc("description", document.metadata.description.as_deref());
    let rights = optional_dc("rights", document.metadata.rights.as_deref());
    let has_images = cover.is_some()
        || plans
            .iter()
            .any(|plan| blocks_have_images(&plan.section.blocks));
    let has_potentially_dynamic_images = cover
        .map(|cover| matches!(cover.media_type.as_str(), "image/gif" | "image/svg+xml"))
        .unwrap_or(false)
        || assets
            .iter()
            .any(|asset| matches!(asset.media_type.as_str(), "image/gif" | "image/svg+xml"));
    let accessibility_summary = if has_images {
        "Reflowable text with structural navigation and alternative text for images."
    } else {
        "Reflowable text with structural navigation and no visual content."
    };
    let visual_access_mode = if has_images {
        "    <meta property=\"schema:accessMode\">visual</meta>\n"
    } else {
        ""
    };
    let alternative_text_feature = if has_images {
        "    <meta property=\"schema:accessibilityFeature\">alternativeText</meta>\n"
    } else {
        ""
    };
    let accessibility_hazard = if has_potentially_dynamic_images {
        "unknown"
    } else {
        "none"
    };

    let mut manifest = String::from(
        "    <item id=\"nav\" href=\"nav.xhtml\" media-type=\"application/xhtml+xml\" properties=\"nav\" />\n    <item id=\"css\" href=\"styles/book.css\" media-type=\"text/css\" />\n    <item id=\"title-page\" href=\"text/title.xhtml\" media-type=\"application/xhtml+xml\" />\n",
    );
    let mut spine = String::new();
    if let Some(cover) = cover {
        manifest.push_str(&format!(
            "    <item id=\"cover-image\" href=\"{}\" media-type=\"{}\" properties=\"cover-image\" />\n    <item id=\"cover-page\" href=\"text/cover.xhtml\" media-type=\"application/xhtml+xml\" />\n",
            escape_attr(&cover.href),
            escape_attr(&cover.media_type)
        ));
        spine.push_str("    <itemref idref=\"cover-page\" />\n");
    }
    spine.push_str("    <itemref idref=\"title-page\" />\n");
    for plan in plans {
        manifest.push_str(&format!(
            "    <item id=\"{}\" href=\"{}\" media-type=\"application/xhtml+xml\" />\n",
            escape_attr(&plan.item_id),
            escape_attr(&plan.href)
        ));
        spine.push_str(&format!(
            "    <itemref idref=\"{}\" />\n",
            escape_attr(&plan.item_id)
        ));
    }
    for asset in assets {
        manifest.push_str(&format!(
            "    <item id=\"{}\" href=\"{}\" media-type=\"{}\" />\n",
            escape_attr(&asset.item_id),
            escape_attr(&asset.href),
            escape_attr(&asset.media_type)
        ));
    }
    let page_progression = match options.page_progression_direction {
        Some(PageProgressionDirection::LeftToRight) => " page-progression-direction=\"ltr\"",
        Some(PageProgressionDirection::RightToLeft) => " page-progression-direction=\"rtl\"",
        None => "",
    };
    format!(
        "{}<package xmlns=\"http://www.idpf.org/2007/opf\" version=\"3.0\" unique-identifier=\"publication-id\" xml:lang=\"{}\"><metadata xmlns:dc=\"http://purl.org/dc/elements/1.1/\"><dc:identifier id=\"publication-id\">{}</dc:identifier><dc:title id=\"main-title\">{}</dc:title><meta refines=\"#main-title\" property=\"title-type\">main</meta>{}<dc:language>{}</dc:language>{}{}{}{}    <meta property=\"dcterms:modified\">{}</meta>\n    <meta property=\"schema:accessMode\">textual</meta>\n{}    <meta property=\"schema:accessModeSufficient\">textual</meta>\n    <meta property=\"schema:accessibilityFeature\">structuralNavigation</meta>\n    <meta property=\"schema:accessibilityFeature\">readingOrder</meta>\n{}    <meta property=\"schema:accessibilityHazard\">{}</meta>\n    <meta property=\"schema:accessibilitySummary\">{}</meta>\n  </metadata><manifest>\n{}  </manifest><spine{}>\n{}  </spine></package>\n",
        xml_declaration(),
        escape_attr(language),
        escape_text(&options.identifier),
        escape_text(&document.metadata.title),
        subtitle,
        escape_text(language),
        creator_metadata,
        publisher,
        description,
        rights,
        escape_text(&options.modified_utc),
        visual_access_mode,
        alternative_text_feature,
        accessibility_hazard,
        escape_text(accessibility_summary),
        manifest,
        page_progression,
        spine
    )
}

fn optional_dc(name: &str, value: Option<&str>) -> String {
    value
        .filter(|value| !value.trim().is_empty())
        .map(|value| format!("    <dc:{name}>{}</dc:{name}>\n", escape_text(value)))
        .unwrap_or_default()
}

fn section_xhtml(
    document: &BookDocument,
    language: &str,
    plan: &SectionPlan<'_>,
    asset_hrefs: &HashMap<AssetId, String>,
    footnotes: &FootnoteCatalog,
) -> String {
    let role = role_epub_type(&plan.section.role)
        .map(|value| format!(" epub:type=\"{}\"", escape_attr(value)))
        .unwrap_or_default();
    let heading_level = plan.depth.clamp(1, 6);
    let title = reader_facing_title(plan.section)
        .map(|title| {
            format!(
                "<h{heading_level}>{}</h{heading_level}>",
                escape_text(title)
            )
        })
        .unwrap_or_default();
    let blocks = render_blocks(&plan.section.blocks, asset_hrefs, footnotes);
    format!(
        "{}<html xmlns=\"http://www.w3.org/1999/xhtml\" xmlns:epub=\"http://www.idpf.org/2007/ops\" xml:lang=\"{}\" lang=\"{}\"><head><title>{}</title><link rel=\"stylesheet\" type=\"text/css\" href=\"../styles/book.css\" /></head><body><section id=\"{}\" class=\"role-{}\"{}>{}{}</section></body></html>\n",
        xml_declaration(),
        escape_attr(language),
        escape_attr(language),
        escape_text(&format!("{} — {}", document.metadata.title, plan.title)),
        escape_attr(&plan.item_id),
        safe_token(role_label(&plan.section.role)),
        role,
        title,
        blocks
    )
}

fn render_blocks(
    blocks: &[Block],
    asset_hrefs: &HashMap<AssetId, String>,
    footnotes: &FootnoteCatalog,
) -> String {
    blocks
        .iter()
        .map(|block| match block {
            Block::Paragraph { inlines, style } => {
                let class = match style.alignment {
                    ParagraphAlignment::Start => "",
                    ParagraphAlignment::Center => " class=\"align-center\"",
                    ParagraphAlignment::End => " class=\"align-end\"",
                    ParagraphAlignment::Justify => " class=\"align-justify\"",
                };
                let direction = match style.direction {
                    TextDirection::Auto => "",
                    TextDirection::LeftToRight => " dir=\"ltr\"",
                    TextDirection::RightToLeft => " dir=\"rtl\"",
                };
                let indent = if style.indent_level == 0 {
                    String::new()
                } else {
                    format!(
                        " style=\"margin-inline-start: {}em\"",
                        style.indent_level
                    )
                };
                format!(
                    "<p{class}{direction}{indent}>{}</p>",
                    render_inlines(inlines, footnotes)
                )
            }
            Block::Heading { level, inlines } => {
                let level = heading_number(level);
                format!(
                    "<h{level}>{}</h{level}>",
                    render_inlines(inlines, footnotes)
                )
            }
            Block::OrderedList { items } => {
                format!("<ol>{}</ol>", render_list_items(items, asset_hrefs, footnotes))
            }
            Block::BulletList { items } => {
                format!("<ul>{}</ul>", render_list_items(items, asset_hrefs, footnotes))
            }
            Block::BlockQuote { blocks } => format!(
                "<blockquote>{}</blockquote>",
                render_blocks(blocks, asset_hrefs, footnotes)
            ),
            Block::SceneBreak { style } => {
                let marker = match style {
                    crate::publishing::model::SceneBreakStyle::Whitespace => "⁂",
                    crate::publishing::model::SceneBreakStyle::Asterisks => "* * *",
                    crate::publishing::model::SceneBreakStyle::Custom { marker } => marker,
                };
                format!(
                    "<div class=\"scene-break\" role=\"separator\" aria-label=\"Scene break\">{}</div>",
                    escape_text(marker)
                )
            }
            Block::PageBreak => {
                "<div class=\"page-break\" role=\"separator\" aria-label=\"Page break\"></div>"
                    .to_string()
            }
            Block::Image {
                asset_id,
                alt,
                caption,
                decorative,
                presentation,
            } => {
                let href = asset_hrefs
                    .get(asset_id)
                    .map(String::as_str)
                    .unwrap_or("#missing-asset");
                let caption = caption
                    .as_ref()
                    .map(|caption| {
                        format!(
                            "<figcaption>{}</figcaption>",
                            render_inlines(caption, footnotes)
                        )
                    })
                    .unwrap_or_default();
                let class_name = match presentation {
                    ImagePresentation::Block => "image-block",
                    ImagePresentation::FullWidth => "image-full-width",
                    ImagePresentation::Bleed => "image-bleed",
                };
                let accessibility = if *decorative {
                    "alt=\"\" role=\"presentation\" aria-hidden=\"true\"".to_string()
                } else {
                    format!(
                        "alt=\"{}\"",
                        escape_attr(alt.as_deref().unwrap_or_default())
                    )
                };
                format!(
                    "<figure class=\"{class_name}\"><img src=\"{}\" {} />{}</figure>",
                    escape_attr(href), accessibility, caption
                )
            }
            Block::FootnoteDefinition { id, blocks } => {
                let backlink = footnotes
                    .reference_hrefs
                    .get(id)
                    .map(|href| {
                        format!(
                            "<p class=\"footnote-backlink\"><a epub:type=\"backlink\" href=\"{}\" aria-label=\"Return to note reference\">â†©</a></p>",
                            escape_attr(href)
                        )
                    })
                    .unwrap_or_default();
                format!(
                    "<aside epub:type=\"footnote\" role=\"doc-footnote\" id=\"fn-{}\">{}{}</aside>",
                    xml_id_token(&id.0),
                    render_blocks(blocks, asset_hrefs, footnotes),
                    backlink
                )
            }
        })
        .collect()
}

fn render_list_items(
    items: &[ListItem],
    asset_hrefs: &HashMap<AssetId, String>,
    footnotes: &FootnoteCatalog,
) -> String {
    items
        .iter()
        .map(|item| {
            format!(
                "<li>{}</li>",
                render_blocks(&item.blocks, asset_hrefs, footnotes)
            )
        })
        .collect()
}

fn render_inlines(inlines: &[Inline], footnotes: &FootnoteCatalog) -> String {
    inlines
        .iter()
        .map(|inline| match inline {
            Inline::Text { text, marks, link } => {
                let mut rendered = text
                    .split('\n')
                    .map(escape_text)
                    .collect::<Vec<_>>()
                    .join("<br />");
                if marks.bold {
                    rendered = format!("<strong>{rendered}</strong>");
                }
                if marks.italic {
                    rendered = format!("<em>{rendered}</em>");
                }
                if marks.underline {
                    rendered = format!("<span class=\"underline\">{rendered}</span>");
                }
                if marks.strike {
                    rendered = format!("<s>{rendered}</s>");
                }
                if let Some(link) = link {
                    rendered = format!("<a href=\"{}\">{}</a>", escape_attr(&link.0), rendered);
                }
                rendered
            }
            Inline::FootnoteReference { id } => {
                let href = footnotes
                    .hrefs
                    .get(id)
                    .map(String::as_str)
                    .unwrap_or("#missing-footnote");
                format!(
                    "<a epub:type=\"noteref\" role=\"doc-noteref\" id=\"fnref-{}\" href=\"{}\"><sup>{}</sup></a>",
                    xml_id_token(&id.0),
                    escape_attr(href),
                    footnotes.numbers.get(id).copied().unwrap_or_default()
                )
            }
        })
        .collect()
}

fn footnote_catalog(plans: &[SectionPlan<'_>]) -> FootnoteCatalog {
    let mut result = FootnoteCatalog::default();
    for plan in plans {
        collect_footnotes(&plan.section.blocks, &plan.href, &mut result.hrefs);
    }
    for plan in plans {
        collect_footnote_references(&plan.section.blocks, &plan.href, &mut result);
    }
    result
}

fn collect_footnote_references(
    blocks: &[Block],
    document_href: &str,
    result: &mut FootnoteCatalog,
) {
    for block in blocks {
        match block {
            Block::Paragraph { inlines, .. } | Block::Heading { inlines, .. } => {
                for inline in inlines {
                    if let Inline::FootnoteReference { id } = inline {
                        if !result.numbers.contains_key(id) {
                            let number = result.numbers.len() + 1;
                            result.numbers.insert(id.clone(), number);
                            result.reference_hrefs.insert(
                                id.clone(),
                                format!(
                                    "{}#fnref-{}",
                                    document_href.strip_prefix("text/").unwrap_or(document_href),
                                    xml_id_token(&id.0)
                                ),
                            );
                        }
                    }
                }
            }
            Block::Image { caption, .. } => {
                if let Some(caption) = caption {
                    for inline in caption {
                        if let Inline::FootnoteReference { id } = inline {
                            if !result.numbers.contains_key(id) {
                                let number = result.numbers.len() + 1;
                                result.numbers.insert(id.clone(), number);
                                result.reference_hrefs.insert(
                                    id.clone(),
                                    format!(
                                        "{}#fnref-{}",
                                        document_href
                                            .strip_prefix("text/")
                                            .unwrap_or(document_href),
                                        xml_id_token(&id.0)
                                    ),
                                );
                            }
                        }
                    }
                }
            }
            Block::OrderedList { items } | Block::BulletList { items } => {
                for item in items {
                    collect_footnote_references(&item.blocks, document_href, result);
                }
            }
            Block::BlockQuote { blocks } | Block::FootnoteDefinition { blocks, .. } => {
                collect_footnote_references(blocks, document_href, result)
            }
            Block::SceneBreak { .. } | Block::PageBreak => {}
        }
    }
}

fn collect_footnotes(
    blocks: &[Block],
    document_href: &str,
    result: &mut HashMap<FootnoteId, String>,
) {
    for block in blocks {
        match block {
            Block::FootnoteDefinition { id, blocks } => {
                result.insert(
                    id.clone(),
                    format!(
                        "{}#fn-{}",
                        document_href.strip_prefix("text/").unwrap_or(document_href),
                        xml_id_token(&id.0)
                    ),
                );
                collect_footnotes(blocks, document_href, result);
            }
            Block::OrderedList { items } | Block::BulletList { items } => {
                for item in items {
                    collect_footnotes(&item.blocks, document_href, result);
                }
            }
            Block::BlockQuote { blocks } => collect_footnotes(blocks, document_href, result),
            _ => {}
        }
    }
}

fn resolve_project_relative(project_root: &Path, value: &str) -> Result<PathBuf, String> {
    let relative = Path::new(value);
    if relative.as_os_str().is_empty()
        || relative
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(format!(
            "EPUB asset path {value:?} must be a project-relative path."
        ));
    }
    Ok(project_root.join(relative))
}

fn write_zip_entry(
    zip: &mut ZipWriter<fs::File>,
    name: &str,
    content: &[u8],
    compression: CompressionMethod,
) -> Result<(), String> {
    let options = SimpleFileOptions::default().compression_method(compression);
    zip.start_file(name, options)
        .map_err(|error| format!("Failed to add EPUB entry {name:?}: {error}"))?;
    zip.write_all(content)
        .map_err(|error| format!("Failed to write EPUB entry {name:?}: {error}"))
}

fn heading_number(level: &HeadingLevel) -> usize {
    match level {
        HeadingLevel::H1 => 1,
        HeadingLevel::H2 => 2,
        HeadingLevel::H3 => 3,
        HeadingLevel::H4 => 4,
        HeadingLevel::H5 => 5,
        HeadingLevel::H6 => 6,
    }
}

fn blocks_have_images(blocks: &[Block]) -> bool {
    blocks.iter().any(|block| match block {
        Block::Image { .. } => true,
        Block::OrderedList { items } | Block::BulletList { items } => {
            items.iter().any(|item| blocks_have_images(&item.blocks))
        }
        Block::BlockQuote { blocks } | Block::FootnoteDefinition { blocks, .. } => {
            blocks_have_images(blocks)
        }
        _ => false,
    })
}

fn role_label(role: &SectionRole) -> &'static str {
    match role {
        SectionRole::FrontMatter => "Front Matter",
        SectionRole::Part => "Part",
        SectionRole::Chapter => "Chapter",
        SectionRole::Scene => "Scene",
        SectionRole::Work => "Work",
        SectionRole::Installment => "Installment",
        SectionRole::Volume => "Volume",
        SectionRole::BackMatter => "Back Matter",
        SectionRole::Unassigned => "Section",
    }
}

fn reader_facing_title(section: &BookSection) -> Option<&str> {
    if let Some(title) = section
        .title
        .as_deref()
        .filter(|title| !title.trim().is_empty())
    {
        return Some(title);
    }
    if matches!(
        section.role,
        SectionRole::FrontMatter | SectionRole::BackMatter
    ) {
        return None;
    }
    Some(role_label(&section.role))
}

fn role_epub_type(role: &SectionRole) -> Option<&'static str> {
    match role {
        SectionRole::FrontMatter => Some("frontmatter"),
        SectionRole::Part | SectionRole::Volume => Some("part"),
        SectionRole::Chapter | SectionRole::Work | SectionRole::Installment => Some("chapter"),
        SectionRole::BackMatter => Some("backmatter"),
        SectionRole::Scene | SectionRole::Unassigned => None,
    }
}

fn media_type_for_path(path: &Path) -> Option<&'static str> {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "jpg" | "jpeg" => Some("image/jpeg"),
        "png" => Some("image/png"),
        "gif" => Some("image/gif"),
        "svg" => Some("image/svg+xml"),
        _ => None,
    }
}

fn extension_for_media_type(media_type: &str) -> &'static str {
    match media_type {
        "image/jpeg" => "jpg",
        "image/png" => "png",
        "image/gif" => "gif",
        "image/svg+xml" => "svg",
        _ => "bin",
    }
}

fn safe_token(value: &str) -> String {
    let value = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.') {
                character
            } else {
                '-'
            }
        })
        .collect::<String>();
    let value = value.trim_matches(['-', '.']);
    if value.is_empty() {
        "item".to_string()
    } else {
        value.to_ascii_lowercase()
    }
}

fn xml_id_token(value: &str) -> String {
    let encoded = value
        .as_bytes()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    format!("id-{encoded}")
}

fn xml_declaration() -> &'static str {
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
}

fn escape_text(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if matches!(character, '\u{9}' | '\u{A}' | '\u{D}')
                || ('\u{20}'..='\u{D7FF}').contains(&character)
                || ('\u{E000}'..='\u{FFFD}').contains(&character)
                || ('\u{10000}'..='\u{10FFFF}').contains(&character)
            {
                character
            } else {
                '\u{FFFD}'
            }
        })
        .collect::<String>()
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn escape_attr(value: &str) -> String {
    escape_text(value)
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::publishing::html::parse_quill_html;
    use crate::publishing::model::{
        BookContributor, BookMetadata, ContributorRole, InlineMarks, LinkTarget, ParagraphStyle,
        SceneBreakStyle,
    };
    use std::env;

    fn text(value: &str) -> Inline {
        Inline::Text {
            text: value.to_string(),
            marks: InlineMarks {
                bold: false,
                italic: false,
                underline: false,
                strike: false,
            },
            link: None,
        }
    }

    fn paragraph(value: &str) -> Block {
        Block::Paragraph {
            inlines: vec![text(value)],
            style: ParagraphStyle {
                alignment: ParagraphAlignment::Start,
                indent_level: 0,
                direction: TextDirection::Auto,
            },
        }
    }

    fn fixture_document() -> BookDocument {
        BookDocument {
            metadata: BookMetadata {
                title: "A & B".to_string(),
                subtitle: Some("An EPUB fixture".to_string()),
                contributors: vec![BookContributor {
                    name: "A. Writer".to_string(),
                    role: ContributorRole::Author,
                }],
                language: Some("en-US".to_string()),
                identifier: Some("urn:isbn:9780000000000".to_string()),
                publisher: Some("Fixture Press".to_string()),
                description: Some("A structural EPUB fixture.".to_string()),
                rights: Some("Copyright A. Writer".to_string()),
                ..BookMetadata::default()
            },
            sections: vec![
                BookSection {
                    source_node_id: None,
                    role: SectionRole::FrontMatter,
                    title: Some("Dedication".to_string()),
                    inclusion: SectionInclusion::AllFormats,
                    blocks: vec![paragraph("For readers.")],
                    children: vec![],
                },
                BookSection {
                    source_node_id: Some(1),
                    role: SectionRole::Chapter,
                    title: Some("First <Chapter>".to_string()),
                    inclusion: SectionInclusion::AllFormats,
                    blocks: vec![
                        paragraph("Hello\n世界"),
                        Block::Paragraph {
                            inlines: vec![
                                Inline::Text {
                                    text: "External link".to_string(),
                                    marks: InlineMarks {
                                        bold: true,
                                        italic: true,
                                        underline: true,
                                        strike: true,
                                    },
                                    link: Some(LinkTarget(
                                        "https://example.com/books?fixture=1&format=epub"
                                            .to_string(),
                                    )),
                                },
                                Inline::FootnoteReference {
                                    id: FootnoteId("note-1".to_string()),
                                },
                            ],
                            style: ParagraphStyle {
                                alignment: ParagraphAlignment::Start,
                                indent_level: 0,
                                direction: TextDirection::Auto,
                            },
                        },
                        Block::SceneBreak {
                            style: SceneBreakStyle::Asterisks,
                        },
                        Block::OrderedList {
                            items: vec![ListItem {
                                blocks: vec![paragraph("One")],
                            }],
                        },
                        Block::FootnoteDefinition {
                            id: FootnoteId("note-1".to_string()),
                            blocks: vec![paragraph("A footnote.")],
                        },
                    ],
                    children: vec![BookSection {
                        source_node_id: Some(2),
                        role: SectionRole::Scene,
                        title: Some("A Scene".to_string()),
                        inclusion: SectionInclusion::AllFormats,
                        blocks: vec![paragraph("Nested.")],
                        children: vec![],
                    }],
                },
                BookSection {
                    source_node_id: None,
                    role: SectionRole::BackMatter,
                    title: Some("About the Author".to_string()),
                    inclusion: SectionInclusion::AllFormats,
                    blocks: vec![paragraph("About.")],
                    children: vec![],
                },
            ],
            assets: vec![],
        }
    }

    fn options(root: &Path) -> EpubRenderOptions {
        EpubRenderOptions {
            project_root: root.to_path_buf(),
            identifier: "urn:isbn:9780000000000".to_string(),
            modified_utc: "2026-07-27T12:00:00Z".to_string(),
            cover: None,
            page_progression_direction: None,
            include_front_matter: true,
            include_back_matter: true,
        }
    }

    fn read_entry(path: &Path, name: &str) -> String {
        let file = fs::File::open(path).unwrap();
        let mut archive = ZipArchive::new(file).unwrap();
        let mut value = String::new();
        archive
            .by_name(name)
            .unwrap()
            .read_to_string(&mut value)
            .unwrap();
        value
    }

    #[test]
    fn package_has_epub3_structure_accessibility_metadata_and_outline_order() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("fixture.epub");
        render_epub(&fixture_document(), &options(root.path()), &path).unwrap();

        validate_epub_archive(&path).unwrap();
        let file = fs::File::open(&path).unwrap();
        let mut archive = ZipArchive::new(file).unwrap();
        let mimetype = archive.by_index(0).unwrap();
        assert_eq!(mimetype.name(), "mimetype");
        assert_eq!(mimetype.compression(), CompressionMethod::Stored);
        drop(mimetype);

        let package = read_entry(&path, "OEBPS/package.opf");
        assert!(package.contains(r#"version="3.0""#));
        assert!(package.contains("<dc:language>en-US</dc:language>"));
        assert!(package.contains("schema:accessModeSufficient"));
        assert!(package.contains("schema:accessibilityHazard"));

        let nav = read_entry(&path, "OEBPS/nav.xhtml");
        let dedication = nav.find("Dedication").unwrap();
        let chapter = nav.find("First &lt;Chapter&gt;").unwrap();
        let scene = nav.find("A Scene").unwrap();
        let back = nav.find("About the Author").unwrap();
        assert!(dedication < chapter && chapter < scene && scene < back);
        assert!(nav.contains(r#"epub:type="landmarks""#));
        assert!(nav.contains(r#"epub:type="titlepage""#));
        assert!(nav.contains(r#"epub:type="bodymatter""#));
        assert!(nav.contains(r#"epub:type="backmatter""#));

        let xhtml = read_entry(&path, "OEBPS/text/section-0002.xhtml");
        assert!(xhtml.contains("Hello<br />世界"));
        assert!(xhtml.contains("<ol><li><p>One</p></li></ol>"));
        assert!(xhtml.contains(r#"role="separator" aria-label="Scene break""#));
        let note_token = xml_id_token("note-1");
        assert!(xhtml.contains(&format!(
            "epub:type=\"noteref\" role=\"doc-noteref\" id=\"fnref-{note_token}\""
        )));
        assert!(xhtml.contains(&format!(
            "href=\"section-0002.xhtml#fn-{note_token}\"><sup>1</sup>"
        )));
        assert!(xhtml.contains(&format!(
            "epub:type=\"footnote\" role=\"doc-footnote\" id=\"fn-{note_token}\""
        )));
        assert!(xhtml.contains("epub:type=\"backlink\""));
        assert!(!xhtml.contains("<sup>note-1</sup>"));
        let css = read_entry(&path, "OEBPS/styles/book.css");
        assert!(!css.contains("font-family"));
        assert!(!css.contains("px"));
    }

    #[test]
    fn rich_editor_fixture_keeps_semantic_xhtml_and_scene_order() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("rich-editor.epub");
        let mut document = fixture_document();
        document.sections[1].blocks =
            parse_quill_html(include_str!("../fixtures/quill/rich_content.html")).unwrap();

        render_epub(&document, &options(root.path()), &path).unwrap();

        let xhtml = read_entry(&path, "OEBPS/text/section-0002.xhtml");
        assert!(xhtml.contains("<h1>Heading <strong>One</strong></h1>"));
        assert!(xhtml.contains(concat!(
            "<h2>Heading <a href=\"https://example.com/heading\">",
            "Two</a></h2>"
        )));
        assert!(xhtml.contains("<h6>Heading Six</h6>"));
        assert!(xhtml.contains("<blockquote><p>Quoted <em>emphasis</em>"));
        assert!(xhtml.contains("href=\"https://example.com/quote\""));

        let before = xhtml.find("First scene.").unwrap();
        let marker = xhtml.find("class=\"scene-break\"").unwrap();
        let after = xhtml.find("Second scene.").unwrap();
        assert!(before < marker && marker < after);
    }

    #[test]
    fn front_and_back_matter_inclusion_is_epub_specific() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("fixture.epub");
        let mut options = options(root.path());
        options.include_front_matter = false;
        options.include_back_matter = false;
        render_epub(&fixture_document(), &options, &path).unwrap();

        let nav = read_entry(&path, "OEBPS/nav.xhtml");
        assert!(!nav.contains("Dedication"));
        assert!(!nav.contains("About the Author"));
        assert!(nav.contains("First &lt;Chapter&gt;"));
    }

    #[test]
    fn untitled_matter_has_no_visible_generic_heading_or_toc_entry() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("fixture.epub");
        let mut document = fixture_document();
        document.sections[0].title = None;
        document.sections[2].title = None;

        render_epub(&document, &options(root.path()), &path).unwrap();

        let front = read_entry(&path, "OEBPS/text/section-0001.xhtml");
        assert!(front.contains("For readers."));
        assert!(!front.contains("<h1>Front Matter</h1>"));

        let back = read_entry(&path, "OEBPS/text/section-0004.xhtml");
        assert!(back.contains("About."));
        assert!(!back.contains("<h1>Back Matter</h1>"));

        let nav = read_entry(&path, "OEBPS/nav.xhtml");
        let toc = nav.split(r#"<nav epub:type="landmarks""#).next().unwrap();
        assert!(!toc.contains(">Front Matter<"));
        assert!(!toc.contains(">Back Matter<"));
        assert!(nav.contains(r#"epub:type="backmatter""#));
    }

    #[test]
    fn project_images_are_packaged_with_informative_and_decorative_semantics() {
        let root = tempfile::tempdir().unwrap();
        let asset_dir = root.path().join("assets");
        fs::create_dir_all(&asset_dir).unwrap();
        image::DynamicImage::new_rgb8(900, 600)
            .save(asset_dir.join("figure.png"))
            .unwrap();
        let mut document = fixture_document();
        let asset_id = AssetId("asset-figure".to_string());
        document.assets.push(BookAsset {
            id: asset_id.clone(),
            kind: crate::publishing::model::AssetKind::Image,
            media_type: "image/png".to_string(),
            source: AssetSource::ProjectRelativePath {
                path: "assets/figure.png".to_string(),
            },
        });
        document.sections[1].blocks.extend([
            Block::Image {
                asset_id: asset_id.clone(),
                alt: Some("Moonlit water".to_string()),
                caption: Some(vec![Inline::Text {
                    text: "Night study".to_string(),
                    marks: InlineMarks::default(),
                    link: None,
                }]),
                decorative: false,
                presentation: ImagePresentation::FullWidth,
            },
            Block::Image {
                asset_id,
                alt: None,
                caption: None,
                decorative: true,
                presentation: ImagePresentation::Block,
            },
        ]);
        let output = root.path().join("images.epub");

        render_epub(&document, &options(root.path()), &output).unwrap();

        let xhtml = read_entry(&output, "OEBPS/text/section-0002.xhtml");
        assert!(xhtml.contains(r#"class="image-full-width""#));
        assert!(xhtml.contains(r#"alt="Moonlit water""#));
        assert!(xhtml.contains("<figcaption>Night study</figcaption>"));
        assert!(xhtml.contains(r#"alt="" role="presentation" aria-hidden="true""#));
        assert!(!xhtml.contains(root.path().to_string_lossy().as_ref()));
        let package = read_entry(&output, "OEBPS/package.opf");
        assert!(package.contains("media-type=\"image/png\""));
    }

    #[test]
    fn cover_is_manifested_and_has_alternative_text() {
        let root = tempfile::tempdir().unwrap();
        let cover_path = root.path().join("cover.png");
        fs::write(&cover_path, b"fixture-png").unwrap();
        let path = root.path().join("fixture.epub");
        let mut options = options(root.path());
        options.cover = Some(EpubCover {
            source_path: cover_path,
            alt_text: "Blue cover with white lettering".to_string(),
        });
        render_epub(&fixture_document(), &options, &path).unwrap();

        let package = read_entry(&path, "OEBPS/package.opf");
        assert!(package.contains(r#"properties="cover-image""#));
        assert!(package.contains("schema:accessibilityFeature\">alternativeText"));
        let cover = read_entry(&path, "OEBPS/text/cover.xhtml");
        assert!(cover.contains(r#"alt="Blue cover with white lettering""#));
    }

    #[test]
    #[ignore = "writes the golden EPUB consumed by the EPUBCheck CI job"]
    fn writes_epubcheck_fixture() {
        let output = env::var_os("WM_EPUB_FIXTURE_PATH")
            .map(PathBuf::from)
            .expect("WM_EPUB_FIXTURE_PATH must name the generated fixture");
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        let root = tempfile::tempdir().unwrap();
        let cover_path = root.path().join("cover.svg");
        fs::write(
            &cover_path,
            r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1600"><title>Fixture cover</title><rect width="1200" height="1600" fill="#183153"/><text x="600" y="800" text-anchor="middle" fill="white">A &amp; B</text></svg>"##,
        )
        .unwrap();
        let mut render_options = options(root.path());
        render_options.cover = Some(EpubCover {
            source_path: cover_path,
            alt_text: "Blue cover titled A and B".to_string(),
        });
        render_epub(&fixture_document(), &render_options, &output).unwrap();
    }
}
