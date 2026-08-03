use std::collections::{HashMap, HashSet};
use std::path::{Component, Path, PathBuf};

use super::assets::inspect_project_asset;
use super::model::{
    AssetId, AssetSource, Block, BookDocument, BookSection, FootnoteId, ImagePresentation, Inline,
    OutputFormat, SectionInclusion, SectionRole,
};
use super::request::{Diagnostic, DiagnosticSeverity, PublishFormat, PublishMetadataOverrides};

pub(crate) fn run_preflight(
    document: &BookDocument,
    format: PublishFormat,
    metadata: &PublishMetadataOverrides,
    outline_confirmed: bool,
) -> Vec<Diagnostic> {
    let mut diagnostics = Vec::new();

    if metadata.title.trim().is_empty() {
        diagnostics.push(Diagnostic::error(
            "PUBLISH_TITLE_REQUIRED",
            "A book title is required.",
            None,
            Some("Enter a title in publishing metadata.".to_string()),
        ));
    }
    if metadata.author.trim().is_empty() {
        diagnostics.push(Diagnostic::error(
            "PUBLISH_AUTHOR_REQUIRED",
            "An author name is required.",
            None,
            Some("Enter an author name in publishing metadata.".to_string()),
        ));
    }
    if !outline_confirmed {
        diagnostics.push(Diagnostic::error(
            "PUBLISH_OUTLINE_UNCONFIRMED",
            "Confirm the inferred publishing outline before the first publish.",
            None,
            Some("Review the outline and select Confirm outline.".to_string()),
        ));
    }
    if !document
        .sections
        .iter()
        .any(|section| included_for_format(section, format) && section_has_prose(section))
    {
        diagnostics.push(Diagnostic::error(
            "PUBLISH_EMPTY_SCOPE",
            "The selected publication scope contains no prose.",
            None,
            Some("Include at least one non-empty section.".to_string()),
        ));
    }

    if format == PublishFormat::Docx {
        if metadata.contact.email.trim().is_empty() && metadata.contact.phone.trim().is_empty() {
            diagnostics.push(Diagnostic::warning(
                "DOCX_CONTACT_METHOD_MISSING",
                "Standard manuscript contact information has no email or phone number.",
                None,
                Some("Add an email address or phone number.".to_string()),
            ));
        }
        for section in &document.sections {
            inspect_section_for_docx(section, &mut diagnostics);
        }
    }
    for section in &document.sections {
        inspect_section_images(section, format, metadata, &mut diagnostics);
    }
    if format == PublishFormat::Epub {
        inspect_epub(document, metadata, &mut diagnostics);
    }

    diagnostics
}

pub(crate) fn run_asset_source_preflight(
    document: &BookDocument,
    format: PublishFormat,
    metadata: &PublishMetadataOverrides,
    project_root: &Path,
) -> Vec<Diagnostic> {
    let mut diagnostics = Vec::new();
    let mut asset_ids = HashSet::new();
    for asset in &document.assets {
        if !asset_ids.insert(asset.id.clone()) {
            diagnostics.push(Diagnostic::error(
                "PUBLISH_ASSET_ID_DUPLICATE",
                format!("Asset ID {:?} appears more than once.", asset.id.0),
                None,
                Some("Assign each project asset a unique ID.".to_string()),
            ));
        }
        let source = match &asset.source {
            AssetSource::ProjectRelativePath { path } => path,
        };
        match resolve_source_path(project_root, source, false) {
            Ok(path) if path.is_file() => match inspect_project_asset(&path) {
                Ok(inspected) => {
                    if inspected.media_type != asset.media_type {
                        diagnostics.push(Diagnostic::error(
                            "PUBLISH_ASSET_MEDIA_TYPE_MISMATCH",
                            format!(
                                "Asset {:?} is declared as {:?}, but its contents are {:?}.",
                                asset.id.0, asset.media_type, inspected.media_type
                            ),
                            None,
                            Some("Replace or re-import the asset.".to_string()),
                        ));
                    }
                    if format == PublishFormat::Docx && inspected.media_type == "image/svg+xml" {
                        diagnostics.push(Diagnostic::error(
                            "DOCX_ASSET_TYPE_UNSUPPORTED",
                            format!(
                                "Asset {:?} is SVG, which this DOCX adapter cannot embed.",
                                asset.id.0
                            ),
                            None,
                            Some(
                                "Replace the image with a PNG or JPEG for DOCX output.".to_string(),
                            ),
                        ));
                    }
                    if format == PublishFormat::Pdf
                        && inspected
                            .width_px
                            .zip(inspected.height_px)
                            .is_some_and(|(width, height)| width < 600 || height < 400)
                    {
                        diagnostics.push(Diagnostic::warning(
                            "PDF_IMAGE_LOW_RESOLUTION",
                            format!(
                                "Asset {:?} is only {} x {} pixels and may print softly.",
                                asset.id.0,
                                inspected.width_px.unwrap_or_default(),
                                inspected.height_px.unwrap_or_default()
                            ),
                            None,
                            Some(
                                "Use a higher-resolution source image for print output."
                                    .to_string(),
                            ),
                        ));
                    }
                }
                Err(message) => diagnostics.push(Diagnostic::error(
                    "PUBLISH_ASSET_INVALID",
                    format!("Asset {:?}: {message}", asset.id.0),
                    None,
                    Some("Replace or re-import the asset.".to_string()),
                )),
            },
            Ok(_) => diagnostics.push(Diagnostic::error(
                "PUBLISH_ASSET_MISSING",
                format!("Asset {:?} could not be found at {:?}.", asset.id.0, source),
                None,
                Some("Restore, replace, or remove the project asset.".to_string()),
            )),
            Err(message) => diagnostics.push(Diagnostic::error(
                "PUBLISH_ASSET_PATH_INVALID",
                format!("Asset {:?}: {message}", asset.id.0),
                None,
                Some("Relink the asset to a file stored inside the project.".to_string()),
            )),
        }
    }

    let mut referenced_assets = HashMap::new();
    for section in &document.sections {
        collect_asset_references_for_format(section, format, metadata, &mut referenced_assets);
    }
    for (asset_id, node_id) in referenced_assets {
        if !asset_ids.contains(&asset_id) {
            diagnostics.push(Diagnostic::error(
                "PUBLISH_ASSET_MISSING",
                format!("Image references missing project asset {:?}.", asset_id.0),
                node_id,
                Some("Relink the image or remove its image block.".to_string()),
            ));
        }
    }
    diagnostics
}

pub(crate) fn run_epub_source_preflight(
    _document: &BookDocument,
    metadata: &PublishMetadataOverrides,
    project_root: &Path,
) -> Vec<Diagnostic> {
    let mut diagnostics = Vec::new();
    if let Some(cover) = &metadata.ebook.cover {
        if cover.source.trim().is_empty() {
            diagnostics.push(Diagnostic::error(
                "EPUB_COVER_MISSING",
                "The selected ebook cover has no source file.",
                None,
                Some("Choose a JPEG, PNG, GIF, or SVG cover image.".to_string()),
            ));
        } else {
            match resolve_source_path(project_root, &cover.source, true) {
                Ok(path) if path.is_file() => {
                    if image_media_type(&path).is_none() {
                        diagnostics.push(Diagnostic::error(
                            "EPUB_COVER_TYPE_UNSUPPORTED",
                            format!(
                                "The ebook cover {:?} is not a supported image type.",
                                cover.source
                            ),
                            None,
                            Some("Choose a JPEG, PNG, GIF, or SVG cover image.".to_string()),
                        ));
                    }
                }
                Ok(_) => diagnostics.push(Diagnostic::error(
                    "EPUB_COVER_MISSING",
                    format!("The ebook cover {:?} could not be found.", cover.source),
                    None,
                    Some("Choose an existing cover image and retry.".to_string()),
                )),
                Err(message) => diagnostics.push(Diagnostic::error(
                    "EPUB_COVER_MISSING",
                    message,
                    None,
                    Some("Choose an existing cover image and retry.".to_string()),
                )),
            }
        }
    }

    diagnostics
}

pub(crate) fn has_blocking_diagnostics(diagnostics: &[Diagnostic]) -> bool {
    diagnostics
        .iter()
        .any(|diagnostic| diagnostic.severity == DiagnosticSeverity::Error)
}

fn inspect_section_for_docx(section: &BookSection, diagnostics: &mut Vec<Diagnostic>) {
    for block in &section.blocks {
        inspect_block_for_docx(block, section.source_node_id, diagnostics);
    }
    for child in &section.children {
        inspect_section_for_docx(child, diagnostics);
    }
}

fn inspect_block_for_docx(block: &Block, node_id: Option<i64>, diagnostics: &mut Vec<Diagnostic>) {
    match block {
        Block::Image { caption, .. } => {
            if let Some(caption) = caption {
                inspect_inlines(caption, node_id, diagnostics);
            }
        }
        Block::FootnoteDefinition { .. } => diagnostics.push(Diagnostic::error(
            "DOCX_FOOTNOTE_UNSUPPORTED",
            "Footnotes are not supported by the initial DOCX adapter.",
            node_id,
            Some("Remove the footnote or exclude this section.".to_string()),
        )),
        Block::Paragraph { inlines, .. } | Block::Heading { inlines, .. } => {
            inspect_inlines(inlines, node_id, diagnostics)
        }
        Block::OrderedList { items } | Block::BulletList { items } => {
            for item in items {
                for child in &item.blocks {
                    inspect_block_for_docx(child, node_id, diagnostics);
                }
            }
        }
        Block::BlockQuote { blocks } => {
            for child in blocks {
                inspect_block_for_docx(child, node_id, diagnostics);
            }
        }
        Block::SceneBreak { .. } | Block::PageBreak => {}
    }
}

fn inspect_section_images(
    section: &BookSection,
    format: PublishFormat,
    metadata: &PublishMetadataOverrides,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let included = match format {
        PublishFormat::Epub => included_for_epub(section, metadata),
        _ => included_for_format(section, format),
    };
    if included {
        inspect_image_blocks(&section.blocks, section.source_node_id, diagnostics);
    }
    for child in &section.children {
        inspect_section_images(child, format, metadata, diagnostics);
    }
}

fn inspect_image_blocks(blocks: &[Block], node_id: Option<i64>, diagnostics: &mut Vec<Diagnostic>) {
    for block in blocks {
        match block {
            Block::Image {
                asset_id,
                alt,
                decorative,
                presentation,
                ..
            } => {
                if !decorative && alt.as_deref().unwrap_or_default().trim().is_empty() {
                    diagnostics.push(Diagnostic::error(
                        "PUBLISH_IMAGE_ALT_REQUIRED",
                        format!("Image {:?} requires alternative text.", asset_id.0),
                        node_id,
                        Some("Add meaningful alt text or mark the image decorative.".to_string()),
                    ));
                }
                if *presentation == ImagePresentation::Bleed {
                    diagnostics.push(Diagnostic::error(
                        "PUBLISH_IMAGE_BLEED_UNSUPPORTED",
                        format!("Image {:?} requests bleed placement, which no current profile supports.", asset_id.0),
                        node_id,
                        Some("Use block or full-width placement.".to_string()),
                    ));
                }
            }
            Block::OrderedList { items } | Block::BulletList { items } => {
                for item in items {
                    inspect_image_blocks(&item.blocks, node_id, diagnostics);
                }
            }
            Block::BlockQuote { blocks } | Block::FootnoteDefinition { blocks, .. } => {
                inspect_image_blocks(blocks, node_id, diagnostics);
            }
            _ => {}
        }
    }
}

fn inspect_inlines(inlines: &[Inline], node_id: Option<i64>, diagnostics: &mut Vec<Diagnostic>) {
    if inlines
        .iter()
        .any(|inline| matches!(inline, Inline::FootnoteReference { .. }))
    {
        diagnostics.push(Diagnostic::error(
            "DOCX_FOOTNOTE_UNSUPPORTED",
            "Footnote references are not supported by the initial DOCX adapter.",
            node_id,
            Some("Remove the footnote or exclude this section.".to_string()),
        ));
    }
}

fn inspect_epub(
    document: &BookDocument,
    metadata: &PublishMetadataOverrides,
    diagnostics: &mut Vec<Diagnostic>,
) {
    if !document
        .sections
        .iter()
        .any(|section| has_included_epub_section(section, metadata))
    {
        diagnostics.push(Diagnostic::error(
            "EPUB_EMPTY_SCOPE",
            "The EPUB inclusion rules exclude every section.",
            None,
            Some("Include body content or enable the required front/back matter.".to_string()),
        ));
    }
    let language = metadata.language.as_deref().unwrap_or_default().trim();
    if language.is_empty() {
        diagnostics.push(Diagnostic::error(
            "EPUB_LANGUAGE_REQUIRED",
            "EPUB metadata requires a language.",
            None,
            Some("Enter a BCP 47 language tag such as en-US.".to_string()),
        ));
    } else if !looks_like_bcp47(language) {
        diagnostics.push(Diagnostic::error(
            "EPUB_LANGUAGE_INVALID",
            format!("EPUB language tag {language:?} is not a valid BCP 47 form."),
            None,
            Some("Use a language tag such as en, en-US, or zh-Hant.".to_string()),
        ));
    }
    if metadata
        .ebook
        .identifier
        .as_deref()
        .unwrap_or_default()
        .trim()
        .is_empty()
    {
        diagnostics.push(Diagnostic::warning(
            "EPUB_IDENTIFIER_DERIVED",
            "No publication identifier was provided; this export will use its stable export ID.",
            None,
            Some(
                "Enter an ISBN or another persistent publication identifier when available."
                    .to_string(),
            ),
        ));
    }
    match &metadata.ebook.cover {
        None => diagnostics.push(Diagnostic::warning(
            "EPUB_COVER_MISSING",
            "No ebook cover is selected.",
            None,
            Some("Choose a cover before retailer delivery.".to_string()),
        )),
        Some(cover) if cover.alt_text.trim().is_empty() => diagnostics.push(Diagnostic::error(
            "EPUB_COVER_ALT_REQUIRED",
            "The ebook cover requires alternative text.",
            None,
            Some("Describe the cover image for screen-reader users.".to_string()),
        )),
        Some(_) => {}
    }

    let mut source_ids = HashSet::new();
    let mut footnote_definitions = HashMap::new();
    let mut footnote_references = Vec::new();
    for section in &document.sections {
        inspect_section_for_epub(
            section,
            metadata,
            &mut source_ids,
            &mut footnote_definitions,
            &mut footnote_references,
            diagnostics,
        );
    }
    for (id, node_id) in footnote_references {
        if !footnote_definitions.contains_key(&id) {
            diagnostics.push(Diagnostic::error(
                "EPUB_LINK_BROKEN",
                format!("Footnote reference {:?} has no definition.", id.0),
                node_id,
                Some("Restore the footnote definition or remove the reference.".to_string()),
            ));
        }
    }
}

fn has_included_epub_section(section: &BookSection, metadata: &PublishMetadataOverrides) -> bool {
    included_for_epub(section, metadata)
        || section
            .children
            .iter()
            .any(|child| has_included_epub_section(child, metadata))
}

fn collect_asset_references_for_format(
    section: &BookSection,
    format: PublishFormat,
    metadata: &PublishMetadataOverrides,
    references: &mut HashMap<AssetId, Option<i64>>,
) {
    let included = match format {
        PublishFormat::Epub => included_for_epub(section, metadata),
        _ => included_for_format(section, format),
    };
    if included {
        collect_assets_from_blocks(&section.blocks, section.source_node_id, references);
    }
    for child in &section.children {
        collect_asset_references_for_format(child, format, metadata, references);
    }
}

fn collect_assets_from_blocks(
    blocks: &[Block],
    node_id: Option<i64>,
    references: &mut HashMap<AssetId, Option<i64>>,
) {
    for block in blocks {
        match block {
            Block::Image { asset_id, .. } => {
                references.entry(asset_id.clone()).or_insert(node_id);
            }
            Block::OrderedList { items } | Block::BulletList { items } => {
                for item in items {
                    collect_assets_from_blocks(&item.blocks, node_id, references);
                }
            }
            Block::BlockQuote { blocks } | Block::FootnoteDefinition { blocks, .. } => {
                collect_assets_from_blocks(blocks, node_id, references);
            }
            _ => {}
        }
    }
}

fn inspect_section_for_epub(
    section: &BookSection,
    metadata: &PublishMetadataOverrides,
    source_ids: &mut HashSet<i64>,
    footnote_definitions: &mut HashMap<FootnoteId, Option<i64>>,
    footnote_references: &mut Vec<(FootnoteId, Option<i64>)>,
    diagnostics: &mut Vec<Diagnostic>,
) {
    if !included_for_epub(section, metadata) {
        return;
    }
    if let Some(id) = section.source_node_id {
        if !source_ids.insert(id) {
            diagnostics.push(Diagnostic::error(
                "EPUB_DUPLICATE_ID",
                format!("Source node ID {id} appears more than once in the EPUB outline."),
                Some(id),
                Some(
                    "Ensure every source node appears only once in the Publish outline."
                        .to_string(),
                ),
            ));
        }
    }
    for block in &section.blocks {
        inspect_block_for_epub(
            block,
            section.source_node_id,
            footnote_definitions,
            footnote_references,
            diagnostics,
        );
    }
    for child in &section.children {
        inspect_section_for_epub(
            child,
            metadata,
            source_ids,
            footnote_definitions,
            footnote_references,
            diagnostics,
        );
    }
}

fn inspect_block_for_epub(
    block: &Block,
    node_id: Option<i64>,
    footnote_definitions: &mut HashMap<FootnoteId, Option<i64>>,
    footnote_references: &mut Vec<(FootnoteId, Option<i64>)>,
    diagnostics: &mut Vec<Diagnostic>,
) {
    match block {
        Block::Paragraph { inlines, .. } | Block::Heading { inlines, .. } => {
            inspect_epub_inlines(inlines, node_id, footnote_references, diagnostics);
        }
        Block::OrderedList { items } | Block::BulletList { items } => {
            for item in items {
                for block in &item.blocks {
                    inspect_block_for_epub(
                        block,
                        node_id,
                        footnote_definitions,
                        footnote_references,
                        diagnostics,
                    );
                }
            }
        }
        Block::BlockQuote { blocks } => {
            for block in blocks {
                inspect_block_for_epub(
                    block,
                    node_id,
                    footnote_definitions,
                    footnote_references,
                    diagnostics,
                );
            }
        }
        Block::Image { caption, .. } => {
            if let Some(caption) = caption {
                inspect_epub_inlines(caption, node_id, footnote_references, diagnostics);
            }
        }
        Block::FootnoteDefinition { id, blocks } => {
            if footnote_definitions.insert(id.clone(), node_id).is_some() {
                diagnostics.push(Diagnostic::error(
                    "EPUB_DUPLICATE_ID",
                    format!("Footnote ID {:?} appears more than once.", id.0),
                    node_id,
                    Some("Assign each footnote a unique ID.".to_string()),
                ));
            }
            for block in blocks {
                inspect_block_for_epub(
                    block,
                    node_id,
                    footnote_definitions,
                    footnote_references,
                    diagnostics,
                );
            }
        }
        Block::SceneBreak { .. } | Block::PageBreak => {}
    }
}

fn inspect_epub_inlines(
    inlines: &[Inline],
    node_id: Option<i64>,
    footnote_references: &mut Vec<(FootnoteId, Option<i64>)>,
    diagnostics: &mut Vec<Diagnostic>,
) {
    for inline in inlines {
        match inline {
            Inline::Text {
                link: Some(link), ..
            } if !valid_external_link(&link.0) => diagnostics.push(Diagnostic::error(
                "EPUB_LINK_BROKEN",
                format!("Link target {:?} is not a supported external URL.", link.0),
                node_id,
                Some("Use an http, https, mailto, or tel URL.".to_string()),
            )),
            Inline::FootnoteReference { id } => {
                footnote_references.push((id.clone(), node_id));
            }
            _ => {}
        }
    }
}

fn valid_external_link(value: &str) -> bool {
    let value = value.trim();
    ["https://", "http://", "mailto:", "tel:"]
        .iter()
        .any(|prefix| value.starts_with(prefix) && value.len() > prefix.len())
}

fn looks_like_bcp47(value: &str) -> bool {
    if value.contains('_') {
        return false;
    }
    let mut segments = value.split('-');
    let Some(primary) = segments.next() else {
        return false;
    };
    if !((2..=8).contains(&primary.len())
        && primary
            .chars()
            .all(|character| character.is_ascii_alphabetic())
        || matches!(primary.to_ascii_lowercase().as_str(), "x" | "i"))
    {
        return false;
    }
    segments.all(|segment| {
        (1..=8).contains(&segment.len())
            && segment
                .chars()
                .all(|character| character.is_ascii_alphanumeric())
    })
}

fn included_for_epub(section: &BookSection, metadata: &PublishMetadataOverrides) -> bool {
    let included = match &section.inclusion {
        SectionInclusion::AllFormats => true,
        SectionInclusion::SelectedFormats { formats } => formats.contains(&OutputFormat::Epub),
        SectionInclusion::Excluded => false,
    };
    included
        && (section.role != SectionRole::FrontMatter || metadata.ebook.include_front_matter)
        && (section.role != SectionRole::BackMatter || metadata.ebook.include_back_matter)
}

fn resolve_source_path(
    project_root: &Path,
    source: &str,
    allow_absolute: bool,
) -> Result<PathBuf, String> {
    let path = Path::new(source);
    if path.is_absolute() {
        return if allow_absolute {
            Ok(path.to_path_buf())
        } else {
            Err(format!("Path {source:?} must be project-relative."))
        };
    }
    if path.as_os_str().is_empty()
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(format!(
            "Path {source:?} is not a safe project-relative path."
        ));
    }
    Ok(project_root.join(path))
}

fn image_media_type(path: &Path) -> Option<&'static str> {
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

fn section_has_prose(section: &BookSection) -> bool {
    section.blocks.iter().any(block_has_prose) || section.children.iter().any(section_has_prose)
}

fn block_has_prose(block: &Block) -> bool {
    match block {
        Block::Paragraph { inlines, .. } | Block::Heading { inlines, .. } => {
            inlines.iter().any(|inline| match inline {
                Inline::Text { text, .. } => !text.trim().is_empty(),
                Inline::FootnoteReference { .. } => true,
            })
        }
        Block::OrderedList { items } | Block::BulletList { items } => items
            .iter()
            .any(|item| item.blocks.iter().any(block_has_prose)),
        Block::BlockQuote { blocks } => blocks.iter().any(block_has_prose),
        Block::SceneBreak { .. }
        | Block::PageBreak
        | Block::Image { .. }
        | Block::FootnoteDefinition { .. } => true,
    }
}

fn included_for_format(section: &BookSection, format: PublishFormat) -> bool {
    let included = match &section.inclusion {
        SectionInclusion::AllFormats => true,
        SectionInclusion::SelectedFormats { formats } => formats.iter().any(|candidate| {
            matches!(
                (format, candidate),
                (PublishFormat::Pdf, OutputFormat::Pdf)
                    | (PublishFormat::Docx, OutputFormat::Docx)
                    | (PublishFormat::Epub, OutputFormat::Epub)
            )
        }),
        SectionInclusion::Excluded => false,
    };
    (included && section.role != SectionRole::Unassigned)
        || section
            .children
            .iter()
            .any(|child| included_for_format(child, format))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::publishing::model::{
        AssetId, BookMetadata, InlineMarks, LinkTarget, ParagraphAlignment, ParagraphStyle,
        TextDirection,
    };
    use crate::publishing::request::PublishMetadataOverrides;

    fn document(block: Block) -> BookDocument {
        BookDocument {
            metadata: BookMetadata {
                title: "Book".to_string(),
                subtitle: None,
                contributors: vec![],
                language: None,
                series: None,
                ..BookMetadata::default()
            },
            sections: vec![BookSection {
                source_node_id: Some(1),
                role: SectionRole::Chapter,
                title: Some("One".to_string()),
                inclusion: SectionInclusion::AllFormats,
                blocks: vec![block],
                children: vec![],
            }],
            assets: vec![],
        }
    }

    #[test]
    fn missing_metadata_and_confirmation_are_blocking() {
        let doc = document(Block::Paragraph {
            inlines: vec![Inline::Text {
                text: "Text".to_string(),
                marks: crate::publishing::model::InlineMarks {
                    bold: false,
                    italic: false,
                    underline: false,
                    strike: false,
                },
                link: None,
            }],
            style: ParagraphStyle {
                alignment: ParagraphAlignment::Start,
                indent_level: 0,
                direction: TextDirection::Auto,
            },
        });
        let diagnostics = run_preflight(
            &doc,
            PublishFormat::Docx,
            &PublishMetadataOverrides::default(),
            false,
        );

        assert!(has_blocking_diagnostics(&diagnostics));
        assert!(diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == "PUBLISH_OUTLINE_UNCONFIRMED"));
    }

    #[test]
    fn informative_images_require_alt_text_for_every_format() {
        let doc = document(Block::Image {
            asset_id: AssetId("image-1".to_string()),
            alt: None,
            caption: None,
            decorative: false,
            presentation: ImagePresentation::Block,
        });
        let mut metadata = PublishMetadataOverrides::default();
        metadata.title = "Book".to_string();
        metadata.author = "Author".to_string();
        let diagnostics = run_preflight(&doc, PublishFormat::Docx, &metadata, true);

        assert!(diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == "PUBLISH_IMAGE_ALT_REQUIRED"));
    }

    fn epub_metadata() -> PublishMetadataOverrides {
        let mut metadata = PublishMetadataOverrides::default();
        metadata.title = "Book".to_string();
        metadata.author = "Author".to_string();
        metadata.language = Some("en-US".to_string());
        metadata
    }

    #[test]
    fn epub_preflight_names_missing_language_alt_text_and_broken_links() {
        let mut doc = document(Block::Paragraph {
            inlines: vec![Inline::Text {
                text: "Broken".to_string(),
                marks: InlineMarks {
                    bold: false,
                    italic: false,
                    underline: false,
                    strike: false,
                },
                link: Some(LinkTarget("chapter-2.xhtml".to_string())),
            }],
            style: ParagraphStyle {
                alignment: ParagraphAlignment::Start,
                indent_level: 0,
                direction: TextDirection::Auto,
            },
        });
        doc.sections[0].blocks.push(Block::Image {
            asset_id: AssetId("image-1".to_string()),
            alt: Some(" ".to_string()),
            caption: None,
            decorative: false,
            presentation: ImagePresentation::Block,
        });
        let mut metadata = epub_metadata();
        metadata.language = None;

        let diagnostics = run_preflight(&doc, PublishFormat::Epub, &metadata, true);
        for code in [
            "EPUB_LANGUAGE_REQUIRED",
            "PUBLISH_IMAGE_ALT_REQUIRED",
            "EPUB_LINK_BROKEN",
            "EPUB_COVER_MISSING",
        ] {
            assert!(
                diagnostics.iter().any(|diagnostic| diagnostic.code == code),
                "missing diagnostic {code}"
            );
        }
    }

    #[test]
    fn epub_preflight_rejects_duplicate_source_and_footnote_ids() {
        let mut doc = document(Block::FootnoteDefinition {
            id: FootnoteId("note-1".to_string()),
            blocks: vec![],
        });
        let mut duplicate = doc.sections[0].clone();
        duplicate.blocks = vec![Block::FootnoteDefinition {
            id: FootnoteId("note-1".to_string()),
            blocks: vec![],
        }];
        doc.sections.push(duplicate);

        let diagnostics = run_preflight(&doc, PublishFormat::Epub, &epub_metadata(), true);
        assert_eq!(
            diagnostics
                .iter()
                .filter(|diagnostic| diagnostic.code == "EPUB_DUPLICATE_ID")
                .count(),
            2
        );
    }

    #[test]
    fn epub_source_preflight_rejects_missing_asset_records_and_cover_files() {
        let doc = document(Block::Image {
            asset_id: AssetId("missing-image".to_string()),
            alt: Some("Description".to_string()),
            caption: None,
            decorative: false,
            presentation: ImagePresentation::Block,
        });
        let root = tempfile::tempdir().unwrap();
        let mut metadata = epub_metadata();
        metadata.ebook.cover = Some(super::super::request::EbookCover {
            source: root
                .path()
                .join("missing.png")
                .to_string_lossy()
                .to_string(),
            alt_text: "Cover".to_string(),
        });

        let mut diagnostics = run_epub_source_preflight(&doc, &metadata, root.path());
        diagnostics.extend(run_asset_source_preflight(
            &doc,
            PublishFormat::Epub,
            &metadata,
            root.path(),
        ));
        assert!(diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == "EPUB_COVER_MISSING"));
        assert!(diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == "PUBLISH_ASSET_MISSING"));
    }
}
