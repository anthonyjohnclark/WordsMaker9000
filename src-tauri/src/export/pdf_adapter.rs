use std::fs;
use std::path::{Path, PathBuf};

use chrono::Local;
use genpdf::elements::{Break, PageBreak, Paragraph};
use genpdf::fonts::{self, FontData, FontFamily};
use genpdf::style::Style;
use genpdf::{Document, Element};
use tauri::{AppHandle, Emitter};

use crate::export::types::ExportProgress;
use crate::publishing::model::{
    Block, BookDocument, BookSection, ContributorRole, HeadingLevel, Inline, InlineMarks, ListItem,
    OutputFormat, SceneBreakStyle, SectionInclusion, SectionRole,
};

struct PdfSection<'a> {
    title: String,
    blocks: &'a [Block],
}

fn load_font_family() -> Result<FontFamily<FontData>, String> {
    let liberation_dirs: &[&str] = &[
        "/usr/share/fonts/truetype/liberation",
        "/usr/share/fonts/liberation",
        "/Library/Fonts",
    ];
    for dir in liberation_dirs {
        if let Ok(family) = fonts::from_files(dir, "LiberationSerif", None) {
            return Ok(family);
        }
    }

    let win_fonts = Path::new("C:\\Windows\\Fonts");
    if win_fonts.exists() {
        let regular = win_fonts.join("times.ttf");
        let bold = win_fonts.join("timesbd.ttf");
        let italic = win_fonts.join("timesi.ttf");
        let bold_italic = win_fonts.join("timesbi.ttf");

        if regular.exists() {
            let regular_data = FontData::load(&regular, None)
                .map_err(|e| format!("Failed to load times.ttf: {e}"))?;
            let bold_data = if bold.exists() {
                FontData::load(&bold, None).ok()
            } else {
                None
            };
            let italic_data = if italic.exists() {
                FontData::load(&italic, None).ok()
            } else {
                None
            };
            let bold_italic_data = if bold_italic.exists() {
                FontData::load(&bold_italic, None).ok()
            } else {
                None
            };

            return Ok(FontFamily {
                regular: regular_data.clone(),
                bold: bold_data.unwrap_or_else(|| regular_data.clone()),
                italic: italic_data.unwrap_or_else(|| regular_data.clone()),
                bold_italic: bold_italic_data.unwrap_or(regular_data),
            });
        }

        let arial_regular = win_fonts.join("arial.ttf");
        let arial_bold = win_fonts.join("arialbd.ttf");
        let arial_italic = win_fonts.join("ariali.ttf");
        let arial_bi = win_fonts.join("arialbi.ttf");

        if arial_regular.exists() {
            let regular_data = FontData::load(&arial_regular, None)
                .map_err(|e| format!("Failed to load arial.ttf: {e}"))?;
            let bold_data = FontData::load(&arial_bold, None).ok();
            let italic_data = FontData::load(&arial_italic, None).ok();
            let bold_italic_data = FontData::load(&arial_bi, None).ok();

            return Ok(FontFamily {
                regular: regular_data.clone(),
                bold: bold_data.unwrap_or_else(|| regular_data.clone()),
                italic: italic_data.unwrap_or_else(|| regular_data.clone()),
                bold_italic: bold_italic_data.unwrap_or(regular_data),
            });
        }
    }

    let mac_times = Path::new("/Library/Fonts/Times New Roman.ttf");
    if mac_times.exists() {
        let regular_data = FontData::load(mac_times, None)
            .map_err(|e| format!("Failed to load macOS Times: {e}"))?;
        return Ok(FontFamily {
            regular: regular_data.clone(),
            bold: regular_data.clone(),
            italic: regular_data.clone(),
            bold_italic: regular_data,
        });
    }

    Err("Could not find a suitable font (Times New Roman, Arial, or Liberation Serif).".to_string())
}

fn emit_progress(app: Option<&AppHandle>, stage: &str, current: usize, total: usize) {
    if let Some(app) = app {
        let _ = app.emit(
            "export-progress",
            ExportProgress {
                stage: stage.to_string(),
                current,
                total,
            },
        );
    }
}

pub fn generate_pdf(
    document: &BookDocument,
    output_dir: &Path,
    app: Option<&AppHandle>,
) -> Result<PathBuf, String> {
    let chapters: Vec<&BookSection> = document
        .sections
        .iter()
        .filter(|section| {
            matches!(
                section.role,
                SectionRole::Chapter
                    | SectionRole::Work
                    | SectionRole::Installment
                    | SectionRole::Part
                    | SectionRole::Volume
            ) && included_for_pdf(&section.inclusion)
        })
        .collect();
    let total_steps = chapters.len() + 2;

    emit_progress(app, "Preparing document...", 0, total_steps);

    fs::create_dir_all(output_dir)
        .map_err(|e| format!("Failed to create exports directory: {e}"))?;

    let font_family = load_font_family()?;
    let mut pdf = Document::new(font_family);
    pdf.set_title(&document.metadata.title);
    pdf.set_minimal_conformance();

    let mut decorator = genpdf::SimplePageDecorator::new();
    decorator.set_margins(20);
    pdf.set_page_decorator(decorator);

    render_title_page(&mut pdf, &document.metadata.title, primary_author(document));

    for section in document.sections.iter().filter(|section| {
        section.role == SectionRole::FrontMatter && included_for_pdf(&section.inclusion)
    }) {
        render_legacy_matter(&mut pdf, section)?;
    }

    for (index, chapter) in chapters.iter().enumerate() {
        emit_progress(
            app,
            &format!("Rendering chapter {} of {}...", index + 1, chapters.len()),
            index + 1,
            total_steps,
        );
        render_chapter(&mut pdf, chapter)?;
    }

    for section in document.sections.iter().filter(|section| {
        section.role == SectionRole::BackMatter && included_for_pdf(&section.inclusion)
    }) {
        render_legacy_matter(&mut pdf, section)?;
    }

    let timestamp = Local::now().format("%Y%m%d_%H%M%S");
    let safe_title: String = document
        .metadata
        .title
        .chars()
        .map(|character| {
            if character.is_alphanumeric()
                || character == ' '
                || character == '-'
                || character == '_'
            {
                character
            } else {
                '_'
            }
        })
        .collect();
    let filename = format!("{}_{}.pdf", safe_title.trim(), timestamp);
    let output_path = output_dir.join(filename);

    emit_progress(app, "Writing PDF file...", total_steps, total_steps);

    pdf.render_to_file(&output_path)
        .map_err(|e| format!("Failed to render PDF: {e}"))?;

    Ok(output_path)
}

fn primary_author(document: &BookDocument) -> &str {
    document
        .metadata
        .contributors
        .iter()
        .find(|contributor| contributor.role == ContributorRole::Author)
        .map(|contributor| contributor.name.as_str())
        .unwrap_or_default()
}

fn included_for_pdf(inclusion: &SectionInclusion) -> bool {
    match inclusion {
        SectionInclusion::AllFormats => true,
        SectionInclusion::SelectedFormats { formats } => formats.contains(&OutputFormat::Pdf),
        SectionInclusion::Excluded => false,
    }
}

fn render_title_page(pdf: &mut Document, title: &str, author: &str) {
    for _ in 0..12 {
        pdf.push(Break::new(1));
    }

    let title_paragraph = Paragraph::new(title).aligned(genpdf::Alignment::Center);
    pdf.push(title_paragraph.styled(Style::new().bold().with_font_size(28)));

    pdf.push(Break::new(2));

    let author_paragraph = Paragraph::new(author).aligned(genpdf::Alignment::Center);
    pdf.push(author_paragraph.styled(Style::new().with_font_size(16)));
}

fn render_legacy_matter(pdf: &mut Document, section: &BookSection) -> Result<(), String> {
    let text = legacy_matter_text(&section.blocks)?;
    if !text.trim().is_empty() {
        pdf.push(PageBreak::new());
        pdf.push(Paragraph::new(text));
    }
    Ok(())
}

fn legacy_matter_text(blocks: &[Block]) -> Result<String, String> {
    let mut text = String::new();
    for (index, block) in blocks.iter().enumerate() {
        let Block::Paragraph { inlines, .. } = block else {
            return Err(
                "Current PDF adapter only supports paragraphs in legacy front/back matter"
                    .to_string(),
            );
        };
        if index > 0 {
            text.push('\n');
        }
        text.push_str(&inline_plain_text(inlines)?);
    }
    Ok(text)
}

fn render_chapter(pdf: &mut Document, chapter: &BookSection) -> Result<(), String> {
    pdf.push(PageBreak::new());

    let chapter_title = chapter.title.as_deref().unwrap_or_default();
    let heading = Paragraph::new(chapter_title).aligned(genpdf::Alignment::Center);
    pdf.push(heading.styled(Style::new().bold().with_font_size(22)));
    pdf.push(Break::new(1.5));

    let sections = project_chapter_sections(chapter);

    for (index, section) in sections.iter().enumerate() {
        if index > 0 {
            pdf.push(PageBreak::new());
        }
        render_section(pdf, section)?;
    }

    Ok(())
}

fn project_chapter_sections(chapter: &BookSection) -> Vec<PdfSection<'_>> {
    let mut sections = Vec::new();
    if !chapter.blocks.is_empty() {
        sections.push(PdfSection {
            title: String::new(),
            blocks: &chapter.blocks,
        });
    }

    let mut folder_path = Vec::new();
    collect_pdf_sections(chapter, &mut folder_path, &mut sections);
    sections
}

fn collect_pdf_sections<'a>(
    parent: &'a BookSection,
    folder_path: &mut Vec<&'a str>,
    sections: &mut Vec<PdfSection<'a>>,
) {
    for child in &parent.children {
        if !included_for_pdf(&child.inclusion) {
            continue;
        }

        if child.role == SectionRole::Scene {
            let file_title = child.title.as_deref().unwrap_or_default();
            let title = if folder_path.is_empty() {
                file_title.to_string()
            } else {
                format!("{} — {file_title}", folder_path.join(" — "))
            };
            sections.push(PdfSection {
                title,
                blocks: &child.blocks,
            });
            continue;
        }

        let added_title = child.title.as_deref();
        if let Some(title) = added_title {
            folder_path.push(title);
        }
        collect_pdf_sections(child, folder_path, sections);
        if added_title.is_some() {
            folder_path.pop();
        }
    }
}

fn render_section(pdf: &mut Document, section: &PdfSection<'_>) -> Result<(), String> {
    if !section.title.is_empty() {
        let heading = Paragraph::new(section.title.as_str());
        pdf.push(heading.styled(Style::new().bold().with_font_size(14)));
        pdf.push(Break::new(0.5));
    }

    render_blocks(pdf, section.blocks)?;

    pdf.push(Break::new(0.5));
    Ok(())
}

fn render_blocks(pdf: &mut Document, blocks: &[Block]) -> Result<(), String> {
    for block in blocks {
        match block {
            Block::Paragraph { inlines, .. } => render_paragraph(pdf, inlines)?,
            Block::Heading { level, inlines } => render_heading(pdf, level, inlines)?,
            Block::OrderedList { items } | Block::BulletList { items } => {
                render_legacy_list(pdf, items)?
            }
            Block::BlockQuote { blocks } => render_blocks(pdf, blocks)?,
            Block::SceneBreak { style } => render_scene_break(pdf, style),
            Block::PageBreak => pdf.push(PageBreak::new()),
            Block::Image { asset_id, .. } => {
                return Err(format!(
                    "Current PDF adapter cannot render image asset \"{}\"",
                    asset_id.0
                ))
            }
            Block::FootnoteDefinition { id, .. } => {
                return Err(format!(
                    "Current PDF adapter cannot render footnote definition \"{}\"",
                    id.0
                ))
            }
        }
    }
    Ok(())
}

fn render_paragraph(pdf: &mut Document, inlines: &[Inline]) -> Result<(), String> {
    let Some(paragraph) = styled_paragraph(inlines, 12, false)? else {
        return Ok(());
    };
    pdf.push(paragraph);
    pdf.push(Break::new(0.3));
    Ok(())
}

fn render_heading(
    pdf: &mut Document,
    level: &HeadingLevel,
    inlines: &[Inline],
) -> Result<(), String> {
    let size = match level {
        HeadingLevel::H1 => 16,
        HeadingLevel::H2 => 15,
        HeadingLevel::H3 | HeadingLevel::H4 | HeadingLevel::H5 | HeadingLevel::H6 => 14,
    };
    let Some(paragraph) = styled_paragraph(inlines, size, true)? else {
        return Ok(());
    };
    pdf.push(paragraph);
    pdf.push(Break::new(0.3));
    Ok(())
}

fn styled_paragraph(
    inlines: &[Inline],
    font_size: u8,
    force_bold: bool,
) -> Result<Option<Paragraph>, String> {
    if inlines.is_empty() {
        return Ok(None);
    }

    let mut paragraph = Paragraph::default();
    for inline in inlines {
        match inline {
            Inline::Text { text, marks, .. } => {
                let mut effective_marks = marks.clone();
                effective_marks.bold |= force_bold;
                paragraph.push_styled(text, build_style(&effective_marks, font_size));
            }
            Inline::FootnoteReference { id } => {
                return Err(format!(
                    "Current PDF adapter cannot render footnote reference \"{}\"",
                    id.0
                ))
            }
        }
    }
    Ok(Some(paragraph))
}

fn render_legacy_list(pdf: &mut Document, items: &[ListItem]) -> Result<(), String> {
    for item in items {
        for block in &item.blocks {
            match block {
                Block::Paragraph { inlines, .. } => {
                    for inline in inlines {
                        let Inline::Text { text, marks, .. } = inline else {
                            let Inline::FootnoteReference { id } = inline else {
                                unreachable!()
                            };
                            return Err(format!(
                                "Current PDF adapter cannot render footnote reference \"{}\"",
                                id.0
                            ));
                        };
                        let mut paragraph = Paragraph::default();
                        paragraph.push_styled(format!("  - {text}"), build_style(marks, 12));
                        pdf.push(paragraph);
                        pdf.push(Break::new(0.15));
                    }
                }
                Block::OrderedList { items } | Block::BulletList { items } => {
                    render_legacy_list(pdf, items)?
                }
                other => render_blocks(pdf, std::slice::from_ref(other))?,
            }
        }
    }
    Ok(())
}

fn render_scene_break(pdf: &mut Document, style: &SceneBreakStyle) {
    match style {
        SceneBreakStyle::Whitespace => pdf.push(Break::new(1)),
        SceneBreakStyle::Asterisks => {
            pdf.push(Paragraph::new("* * *").aligned(genpdf::Alignment::Center))
        }
        SceneBreakStyle::Custom { marker } => {
            pdf.push(Paragraph::new(marker.as_str()).aligned(genpdf::Alignment::Center))
        }
    }
}

fn inline_plain_text(inlines: &[Inline]) -> Result<String, String> {
    let mut text = String::new();
    for inline in inlines {
        match inline {
            Inline::Text {
                text: inline_text, ..
            } => text.push_str(inline_text),
            Inline::FootnoteReference { id } => {
                return Err(format!(
                    "Current PDF adapter cannot render footnote reference \"{}\"",
                    id.0
                ))
            }
        }
    }
    Ok(text)
}

fn build_style(marks: &InlineMarks, font_size: u8) -> Style {
    let mut style = Style::new().with_font_size(font_size);
    if marks.bold {
        style = style.bold();
    }
    if marks.italic {
        style = style.italic();
    }
    style
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::publishing::model::{
        BookContributor, BookMetadata, ParagraphAlignment, ParagraphStyle, TextDirection,
    };
    use std::env;

    fn text_block(text: &str) -> Block {
        Block::Paragraph {
            inlines: vec![Inline::Text {
                text: text.to_string(),
                marks: InlineMarks {
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
        }
    }

    fn section(role: SectionRole, title: &str, children: Vec<BookSection>) -> BookSection {
        BookSection {
            source_node_id: None,
            role,
            title: Some(title.to_string()),
            inclusion: SectionInclusion::AllFormats,
            blocks: vec![],
            children,
        }
    }

    fn scene(title: &str, text: &str) -> BookSection {
        BookSection {
            source_node_id: Some(1),
            role: SectionRole::Scene,
            title: Some(title.to_string()),
            inclusion: SectionInclusion::AllFormats,
            blocks: vec![text_block(text)],
            children: vec![],
        }
    }

    fn document(title: &str, sections: Vec<BookSection>) -> BookDocument {
        BookDocument {
            metadata: BookMetadata {
                title: title.to_string(),
                subtitle: None,
                contributors: vec![BookContributor {
                    name: "Test Author".to_string(),
                    role: ContributorRole::Author,
                }],
                language: None,
                series: None,
                ..BookMetadata::default()
            },
            sections,
            assets: vec![],
        }
    }

    #[test]
    fn compatibility_projection_flattens_folder_titles_in_source_order() {
        let chapter = section(
            SectionRole::Chapter,
            "Book",
            vec![
                scene("Opening", "Opening"),
                section(
                    SectionRole::Unassigned,
                    "Part One",
                    vec![
                        scene("Scene One", "One"),
                        section(
                            SectionRole::Unassigned,
                            "Sequence",
                            vec![section(
                                SectionRole::Unassigned,
                                "Beat",
                                vec![scene("Deep Scene", "Deep")],
                            )],
                        ),
                    ],
                ),
                scene("Closing", "Closing"),
            ],
        );
        let mut path = Vec::new();
        let mut flattened = Vec::new();

        collect_pdf_sections(&chapter, &mut path, &mut flattened);

        assert_eq!(
            flattened
                .iter()
                .map(|section| section.title.as_str())
                .collect::<Vec<_>>(),
            vec![
                "Opening",
                "Part One — Scene One",
                "Part One — Sequence — Beat — Deep Scene",
                "Closing",
            ]
        );
    }

    #[test]
    fn compatibility_projection_keeps_direct_root_file_chapter_blocks() {
        let mut chapter = section(SectionRole::Chapter, "Root File", vec![]);
        chapter.source_node_id = Some(7);
        chapter.blocks = vec![text_block("Direct chapter prose")];

        let projected = project_chapter_sections(&chapter);

        assert_eq!(projected.len(), 1);
        assert!(projected[0].title.is_empty());
        assert_eq!(projected[0].blocks, chapter.blocks.as_slice());
    }

    #[test]
    fn excluded_and_non_pdf_sections_do_not_reach_the_adapter() {
        let mut excluded = scene("Excluded", "No");
        excluded.inclusion = SectionInclusion::Excluded;
        let mut epub_only = scene("EPUB", "No");
        epub_only.inclusion = SectionInclusion::SelectedFormats {
            formats: vec![OutputFormat::Epub],
        };
        let pdf_scene = scene("PDF", "Yes");
        let chapter = section(
            SectionRole::Chapter,
            "Book",
            vec![excluded, epub_only, pdf_scene],
        );
        let mut path = Vec::new();
        let mut flattened = Vec::new();

        collect_pdf_sections(&chapter, &mut path, &mut flattened);

        assert_eq!(flattened.len(), 1);
        assert_eq!(flattened[0].title, "PDF");
    }

    #[test]
    fn empty_document_does_not_panic() {
        let doc = document("Empty", vec![]);
        let output_dir = env::temp_dir().join("wm9000_test_exports");
        let _ = generate_pdf(&doc, &output_dir, None);
    }

    #[test]
    fn special_characters_in_title_are_accepted() {
        let front = BookSection {
            source_node_id: None,
            role: SectionRole::FrontMatter,
            title: None,
            inclusion: SectionInclusion::AllFormats,
            blocks: vec![text_block("Copyright 2024")],
            children: vec![],
        };
        let back = BookSection {
            source_node_id: None,
            role: SectionRole::BackMatter,
            title: None,
            inclusion: SectionInclusion::AllFormats,
            blocks: vec![text_block("The End")],
            children: vec![],
        };
        let doc = document("Test: A Book / With Special Chars", vec![front, back]);
        let output_dir = env::temp_dir().join("wm9000_test_exports_special");
        let _ = generate_pdf(&doc, &output_dir, None);
    }
}
