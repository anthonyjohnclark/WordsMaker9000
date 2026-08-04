use std::collections::{HashMap, HashSet};
use std::path::{Component, Path, PathBuf};

use super::assets::inspect_project_asset;
use super::model::{
    AssetId, AssetSource, Block, BookDocument, BookSection, FootnoteId, ImagePresentation, Inline,
    OutputFormat, SectionInclusion, SectionRole,
};
use super::request::{Diagnostic, DiagnosticSeverity, PublishFormat, PublishMetadataOverrides};
use super::templates::is_title_page_template_section;

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
    if !document.sections.iter().any(|section| {
        included_for_format(section, format)
            && !is_title_page_template_section(section)
            && section_has_prose(section)
    }) {
        diagnostics.push(Diagnostic::error(
            "PUBLISH_EMPTY_SCOPE",
            "The selected publication scope contains no prose.",
            None,
            Some("Include at least one non-empty section.".to_string()),
        ));
    }

    inspect_footnotes(document, format, metadata, &mut diagnostics);

    if format == PublishFormat::Docx {
        if metadata.contact.email.trim().is_empty() && metadata.contact.phone.trim().is_empty() {
            diagnostics.push(Diagnostic::warning(
                "DOCX_CONTACT_METHOD_MISSING",
                "Standard manuscript contact information has no email or phone number.",
                None,
                Some("Add an email address or phone number.".to_string()),
            ));
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

#[derive(Clone)]
struct NoteDefinitionLocation {
    node_id: Option<i64>,
    included: bool,
}

#[derive(Clone)]
struct NoteReferenceLocation {
    id: FootnoteId,
    node_id: Option<i64>,
    within_definition: Option<FootnoteId>,
}

#[derive(Default)]
struct NoteInventory {
    definitions: HashMap<FootnoteId, Vec<NoteDefinitionLocation>>,
    definition_order: Vec<FootnoteId>,
    references: Vec<NoteReferenceLocation>,
}

fn inspect_footnotes(
    document: &BookDocument,
    format: PublishFormat,
    metadata: &PublishMetadataOverrides,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let mut inventory = NoteInventory::default();
    for section in &document.sections {
        collect_section_notes(section, format, metadata, &mut inventory);
    }

    for id in &inventory.definition_order {
        let locations = &inventory.definitions[id];
        if locations.len() > 1 {
            diagnostics.push(Diagnostic::error(
                "PUBLISH_FOOTNOTE_ID_DUPLICATE",
                format!("Footnote ID {:?} appears more than once.", id.0),
                locations.iter().find_map(|location| location.node_id),
                Some("Assign each footnote definition a unique stable ID.".to_string()),
            ));
        }
    }

    let mut reference_counts: HashMap<FootnoteId, usize> = HashMap::new();
    for reference in &inventory.references {
        *reference_counts.entry(reference.id.clone()).or_default() += 1;
    }
    for id in inventory
        .references
        .iter()
        .map(|reference| &reference.id)
        .collect::<Vec<_>>()
    {
        if reference_counts.remove(id).is_some_and(|count| count > 1) {
            diagnostics.push(Diagnostic::error(
                "PUBLISH_FOOTNOTE_REFERENCE_DUPLICATE",
                format!("Footnote ID {:?} is referenced more than once.", id.0),
                inventory
                    .references
                    .iter()
                    .find(|reference| reference.id == *id)
                    .and_then(|reference| reference.node_id),
                Some("Create a separate note ID for each publication-order reference.".to_string()),
            ));
        }
    }
    if let Some(reference) = inventory
        .references
        .iter()
        .find(|reference| reference.within_definition.is_some())
    {
        diagnostics.push(Diagnostic::error(
            "PUBLISH_FOOTNOTE_NESTED_REFERENCE_UNSUPPORTED",
            "A footnote definition contains another footnote reference.",
            reference.node_id,
            Some("Move the nested note text into the outer footnote.".to_string()),
        ));
    }

    let mut reported_missing = HashSet::new();
    let mut reported_excluded = HashSet::new();
    for reference in &inventory.references {
        match inventory.definitions.get(&reference.id) {
            None if reported_missing.insert(reference.id.clone()) => {
                diagnostics.push(Diagnostic::error(
                    "PUBLISH_FOOTNOTE_DEFINITION_MISSING",
                    format!("Footnote reference {:?} has no definition.", reference.id.0),
                    reference.node_id,
                    Some("Restore the footnote definition or remove the reference.".to_string()),
                ))
            }
            Some(locations)
                if !locations.iter().any(|location| location.included)
                    && reported_excluded.insert(reference.id.clone()) =>
            {
                diagnostics.push(Diagnostic::error(
                    "PUBLISH_FOOTNOTE_DEFINITION_EXCLUDED",
                    format!(
                        "Footnote definition {:?} is outside the selected publication scope.",
                        reference.id.0
                    ),
                    reference.node_id,
                    Some(
                        "Include the section containing the definition or move the note into scope."
                            .to_string(),
                    ),
                ));
            }
            _ => {}
        }
    }

    let included_definitions = inventory
        .definition_order
        .iter()
        .filter(|id| {
            inventory
                .definitions
                .get(*id)
                .is_some_and(|locations| locations.iter().any(|location| location.included))
        })
        .cloned()
        .collect::<HashSet<_>>();
    let mut graph: HashMap<FootnoteId, Vec<FootnoteId>> = HashMap::new();
    let mut reachable = inventory
        .references
        .iter()
        .filter(|reference| reference.within_definition.is_none())
        .map(|reference| reference.id.clone())
        .collect::<HashSet<_>>();
    for reference in &inventory.references {
        if let Some(parent) = &reference.within_definition {
            graph
                .entry(parent.clone())
                .or_default()
                .push(reference.id.clone());
        }
    }

    let mut frontier = reachable.iter().cloned().collect::<Vec<_>>();
    while let Some(id) = frontier.pop() {
        for dependency in graph.get(&id).into_iter().flatten() {
            if reachable.insert(dependency.clone()) {
                frontier.push(dependency.clone());
            }
        }
    }
    for id in &inventory.definition_order {
        if included_definitions.contains(id) && !reachable.contains(id) {
            let node_id = inventory.definitions[id]
                .iter()
                .find(|location| location.included)
                .and_then(|location| location.node_id);
            diagnostics.push(Diagnostic::warning(
                "PUBLISH_FOOTNOTE_UNREACHABLE",
                format!("Footnote definition {:?} is never referenced.", id.0),
                node_id,
                Some("Add a reference or delete the unused definition.".to_string()),
            ));
        }
    }

    let mut visited = HashSet::new();
    let mut stack = Vec::new();
    let mut cycle_ids = HashSet::new();
    for id in &inventory.definition_order {
        collect_note_cycles(id, &graph, &mut visited, &mut stack, &mut cycle_ids);
    }
    if !cycle_ids.is_empty() {
        let ids = inventory
            .definition_order
            .iter()
            .filter(|id| cycle_ids.contains(*id))
            .map(|id| id.0.as_str())
            .collect::<Vec<_>>()
            .join(", ");
        diagnostics.push(Diagnostic::error(
            "PUBLISH_FOOTNOTE_CIRCULAR_REFERENCE",
            format!("Footnote definitions contain a circular reference: {ids}."),
            inventory
                .definition_order
                .iter()
                .filter(|id| cycle_ids.contains(*id))
                .find_map(|id| {
                    inventory.definitions[id]
                        .iter()
                        .find_map(|item| item.node_id)
                }),
            Some("Remove the reference cycle between note definitions.".to_string()),
        ));
    }
}

fn collect_note_cycles(
    id: &FootnoteId,
    graph: &HashMap<FootnoteId, Vec<FootnoteId>>,
    visited: &mut HashSet<FootnoteId>,
    stack: &mut Vec<FootnoteId>,
    cycle_ids: &mut HashSet<FootnoteId>,
) {
    if visited.contains(id) {
        return;
    }
    stack.push(id.clone());
    for dependency in graph.get(id).into_iter().flatten() {
        if let Some(start) = stack.iter().position(|candidate| candidate == dependency) {
            cycle_ids.extend(stack[start..].iter().cloned());
        } else {
            collect_note_cycles(dependency, graph, visited, stack, cycle_ids);
        }
    }
    stack.pop();
    visited.insert(id.clone());
}

fn collect_section_notes(
    section: &BookSection,
    format: PublishFormat,
    metadata: &PublishMetadataOverrides,
    inventory: &mut NoteInventory,
) {
    let included = match format {
        PublishFormat::Epub => included_for_epub(section, metadata),
        _ => match &section.inclusion {
            SectionInclusion::AllFormats => true,
            SectionInclusion::SelectedFormats { formats } => formats.iter().any(|candidate| {
                matches!(
                    (format, candidate),
                    (PublishFormat::Pdf, OutputFormat::Pdf)
                        | (PublishFormat::Docx, OutputFormat::Docx)
                )
            }),
            SectionInclusion::Excluded => false,
        },
    };
    collect_note_blocks(
        &section.blocks,
        section.source_node_id,
        included,
        None,
        inventory,
    );
    for child in &section.children {
        collect_section_notes(child, format, metadata, inventory);
    }
}

fn collect_note_blocks(
    blocks: &[Block],
    node_id: Option<i64>,
    included: bool,
    within_definition: Option<&FootnoteId>,
    inventory: &mut NoteInventory,
) {
    for block in blocks {
        match block {
            Block::Paragraph { inlines, .. } | Block::Heading { inlines, .. } => {
                collect_note_inlines(inlines, node_id, included, within_definition, inventory)
            }
            Block::Image { caption, .. } => {
                if let Some(caption) = caption {
                    collect_note_inlines(caption, node_id, included, within_definition, inventory);
                }
            }
            Block::OrderedList { items } | Block::BulletList { items } => {
                for item in items {
                    collect_note_blocks(
                        &item.blocks,
                        node_id,
                        included,
                        within_definition,
                        inventory,
                    );
                }
            }
            Block::BlockQuote { blocks } => {
                collect_note_blocks(blocks, node_id, included, within_definition, inventory)
            }
            Block::FootnoteDefinition { id, blocks } => {
                if !inventory.definitions.contains_key(id) {
                    inventory.definition_order.push(id.clone());
                }
                inventory
                    .definitions
                    .entry(id.clone())
                    .or_default()
                    .push(NoteDefinitionLocation { node_id, included });
                if included {
                    collect_note_blocks(blocks, node_id, true, Some(id), inventory);
                }
            }
            Block::SceneBreak { .. } | Block::PageBreak => {}
        }
    }
}

fn collect_note_inlines(
    inlines: &[Inline],
    node_id: Option<i64>,
    included: bool,
    within_definition: Option<&FootnoteId>,
    inventory: &mut NoteInventory,
) {
    if !included {
        return;
    }
    for inline in inlines {
        if let Inline::FootnoteReference { id } = inline {
            inventory.references.push(NoteReferenceLocation {
                id: id.clone(),
                node_id,
                within_definition: within_definition.cloned(),
            });
        }
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
    for section in &document.sections {
        inspect_section_for_epub(section, metadata, &mut source_ids, diagnostics);
    }
}

fn has_included_epub_section(section: &BookSection, metadata: &PublishMetadataOverrides) -> bool {
    (included_for_epub(section, metadata)
        && !is_title_page_template_section(section)
        && section_has_prose(section))
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
        inspect_block_for_epub(block, section.source_node_id, diagnostics);
    }
    for child in &section.children {
        inspect_section_for_epub(child, metadata, source_ids, diagnostics);
    }
}

fn inspect_block_for_epub(block: &Block, node_id: Option<i64>, diagnostics: &mut Vec<Diagnostic>) {
    match block {
        Block::Paragraph { inlines, .. } | Block::Heading { inlines, .. } => {
            inspect_epub_inlines(inlines, node_id, diagnostics);
        }
        Block::OrderedList { items } | Block::BulletList { items } => {
            for item in items {
                for block in &item.blocks {
                    inspect_block_for_epub(block, node_id, diagnostics);
                }
            }
        }
        Block::BlockQuote { blocks } => {
            for block in blocks {
                inspect_block_for_epub(block, node_id, diagnostics);
            }
        }
        Block::Image { caption, .. } => {
            if let Some(caption) = caption {
                inspect_epub_inlines(caption, node_id, diagnostics);
            }
        }
        Block::FootnoteDefinition { blocks, .. } => {
            for block in blocks {
                inspect_block_for_epub(block, node_id, diagnostics);
            }
        }
        Block::SceneBreak { .. } | Block::PageBreak => {}
    }
}

fn inspect_epub_inlines(
    inlines: &[Inline],
    node_id: Option<i64>,
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
            Inline::FootnoteReference { .. } => {}
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
    fn generated_title_page_does_not_make_an_empty_scope_publishable() {
        let mut doc = document(Block::Paragraph {
            inlines: vec![Inline::Text {
                text: "Excluded body".to_string(),
                marks: InlineMarks::default(),
                link: None,
            }],
            style: ParagraphStyle {
                alignment: ParagraphAlignment::Start,
                indent_level: 0,
                direction: TextDirection::Auto,
            },
        });
        doc.sections[0].inclusion = SectionInclusion::Excluded;
        doc.sections.insert(
            0,
            BookSection {
                source_node_id: None,
                role: SectionRole::FrontMatter,
                title: Some("Title Page".to_string()),
                inclusion: SectionInclusion::AllFormats,
                blocks: vec![Block::Paragraph {
                    inlines: vec![Inline::Text {
                        text: "Book by Author".to_string(),
                        marks: InlineMarks::default(),
                        link: None,
                    }],
                    style: ParagraphStyle {
                        alignment: ParagraphAlignment::Start,
                        indent_level: 0,
                        direction: TextDirection::Auto,
                    },
                }],
                children: vec![],
            },
        );
        let metadata = epub_metadata();

        let pdf = run_preflight(&doc, PublishFormat::Pdf, &metadata, true);
        assert!(pdf
            .iter()
            .any(|diagnostic| diagnostic.code == "PUBLISH_EMPTY_SCOPE"));

        let epub = run_preflight(&doc, PublishFormat::Epub, &metadata, true);
        assert!(epub
            .iter()
            .any(|diagnostic| diagnostic.code == "PUBLISH_EMPTY_SCOPE"));
        assert!(epub
            .iter()
            .any(|diagnostic| diagnostic.code == "EPUB_EMPTY_SCOPE"));
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
            1
        );
        assert!(diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == "PUBLISH_FOOTNOTE_ID_DUPLICATE"));
    }

    fn note_reference(id: &str) -> Inline {
        Inline::FootnoteReference {
            id: FootnoteId(id.to_string()),
        }
    }

    fn note_definition(id: &str, blocks: Vec<Block>) -> Block {
        Block::FootnoteDefinition {
            id: FootnoteId(id.to_string()),
            blocks,
        }
    }

    fn reference_paragraph(id: &str) -> Block {
        Block::Paragraph {
            inlines: vec![
                Inline::Text {
                    text: "Claim".to_string(),
                    marks: InlineMarks::default(),
                    link: None,
                },
                note_reference(id),
            ],
            style: ParagraphStyle {
                alignment: ParagraphAlignment::Start,
                indent_level: 0,
                direction: TextDirection::Auto,
            },
        }
    }

    #[test]
    fn shared_note_preflight_reports_missing_and_scope_excluded_definitions() {
        let mut doc = document(reference_paragraph("missing"));
        doc.sections[0].blocks.push(reference_paragraph("excluded"));
        doc.sections.push(BookSection {
            source_node_id: Some(2),
            role: SectionRole::Chapter,
            title: Some("Excluded".to_string()),
            inclusion: SectionInclusion::Excluded,
            blocks: vec![note_definition("excluded", vec![])],
            children: vec![],
        });
        let metadata = epub_metadata();

        for format in [PublishFormat::Pdf, PublishFormat::Docx, PublishFormat::Epub] {
            let diagnostics = run_preflight(&doc, format, &metadata, true);
            assert!(diagnostics
                .iter()
                .any(|diagnostic| { diagnostic.code == "PUBLISH_FOOTNOTE_DEFINITION_MISSING" }));
            assert!(diagnostics
                .iter()
                .any(|diagnostic| { diagnostic.code == "PUBLISH_FOOTNOTE_DEFINITION_EXCLUDED" }));
        }
    }

    #[test]
    fn shared_note_preflight_reports_duplicate_unreachable_and_circular_notes() {
        let mut doc = document(reference_paragraph("cycle-a"));
        doc.sections[0].blocks.extend([
            note_definition("unused", vec![]),
            note_definition("unused", vec![]),
            note_definition("cycle-a", vec![reference_paragraph("cycle-b")]),
            note_definition("cycle-b", vec![reference_paragraph("cycle-a")]),
        ]);

        let diagnostics = run_preflight(&doc, PublishFormat::Pdf, &epub_metadata(), true);
        for code in [
            "PUBLISH_FOOTNOTE_ID_DUPLICATE",
            "PUBLISH_FOOTNOTE_UNREACHABLE",
            "PUBLISH_FOOTNOTE_CIRCULAR_REFERENCE",
            "PUBLISH_FOOTNOTE_NESTED_REFERENCE_UNSUPPORTED",
        ] {
            assert!(
                diagnostics.iter().any(|diagnostic| diagnostic.code == code),
                "missing diagnostic {code}"
            );
        }
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
