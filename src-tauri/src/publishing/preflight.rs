use super::model::{
    Block, BookDocument, BookSection, Inline, OutputFormat, SectionInclusion, SectionRole,
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
        Block::Image { .. } => diagnostics.push(Diagnostic::error(
            "DOCX_IMAGE_UNSUPPORTED",
            "Images are not supported by the initial DOCX adapter.",
            node_id,
            Some("Remove the image or exclude this section.".to_string()),
        )),
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
                (PublishFormat::Pdf, OutputFormat::Pdf) | (PublishFormat::Docx, OutputFormat::Docx)
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
        AssetId, BookMetadata, ParagraphAlignment, ParagraphStyle, TextDirection,
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
    fn unsupported_images_are_named_blocking_diagnostics() {
        let doc = document(Block::Image {
            asset_id: AssetId("image-1".to_string()),
            alt: None,
            caption: None,
        });
        let mut metadata = PublishMetadataOverrides::default();
        metadata.title = "Book".to_string();
        metadata.author = "Author".to_string();
        let diagnostics = run_preflight(&doc, PublishFormat::Docx, &metadata, true);

        assert!(diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == "DOCX_IMAGE_UNSUPPORTED"));
    }
}
