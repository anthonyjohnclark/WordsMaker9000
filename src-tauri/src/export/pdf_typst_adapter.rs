use std::fs;
use std::path::{Path, PathBuf};

use chrono::Local;
use tauri::{AppHandle, Emitter};
use typst::layout::PagedDocument;
use typst_as_lib::TypstEngine;

use crate::export::types::ExportProgress;
use crate::publishing::model::{
    Block, BookDocument, BookSection, ContributorRole, HeadingLevel, Inline, InlineMarks, ListItem,
    OutputFormat, ParagraphAlignment, ParagraphStyle, SceneBreakStyle, SectionInclusion,
    SectionRole, TextDirection,
};
use crate::publishing::request::{ChapterStartSide, PdfProfileId, PrintInteriorPdfSettings};

struct PdfSection<'a> {
    title: String,
    role: SectionRole,
    blocks: &'a [Block],
}

const PUBLISHING_FONTS: [&[u8]; 9] = [
    include_bytes!("../../resources/fonts/LibertinusSerif-Regular.otf"),
    include_bytes!("../../resources/fonts/LibertinusSerif-Bold.otf"),
    include_bytes!("../../resources/fonts/LibertinusSerif-Italic.otf"),
    include_bytes!("../../resources/fonts/LibertinusSerif-BoldItalic.otf"),
    include_bytes!("../../resources/fonts/NotoSerifCJKsc-Regular.otf"),
    include_bytes!("../../resources/fonts/NotoNaskhArabic-Regular.ttf"),
    include_bytes!("../../resources/fonts/NotoSansHebrew-Regular.ttf"),
    include_bytes!("../../resources/fonts/NotoEmoji-Variable.ttf"),
    include_bytes!("../../resources/fonts/NotoSansSymbols2-Regular.ttf"),
];

pub fn generate_pdf(
    document: &BookDocument,
    output_dir: &Path,
    app: Option<&AppHandle>,
) -> Result<PathBuf, String> {
    generate_pdf_for_profile(
        document,
        output_dir,
        app,
        PdfProfileId::ProofPdf,
        &PrintInteriorPdfSettings::default(),
    )
}

pub(crate) fn generate_pdf_for_profile(
    document: &BookDocument,
    output_dir: &Path,
    app: Option<&AppHandle>,
    profile: PdfProfileId,
    print_settings: &PrintInteriorPdfSettings,
) -> Result<PathBuf, String> {
    let section_count = match profile {
        PdfProfileId::ProofPdf => publication_sections(document).len(),
        PdfProfileId::PrintInterior => print_units(document).len(),
    };
    let total_steps = section_count + 2;
    emit_progress(app, "Preparing document...", 0, total_steps);

    fs::create_dir_all(output_dir)
        .map_err(|error| format!("Failed to create exports directory: {error}"))?;

    if profile == PdfProfileId::PrintInterior {
        let errors = print_settings.validation_errors();
        if !errors.is_empty() {
            return Err(format!(
                "Print Interior settings are invalid: {}",
                errors.join("; ")
            ));
        }
    }
    let source = match profile {
        PdfProfileId::ProofPdf => proof_typst_source(document)?,
        PdfProfileId::PrintInterior => print_typst_source(document, print_settings)?,
    };
    emit_progress(
        app,
        "Typesetting publication...",
        section_count + 1,
        total_steps,
    );

    let engine = TypstEngine::builder()
        .main_file(source)
        .fonts(PUBLISHING_FONTS)
        .build();
    let warned = engine.compile::<PagedDocument>();
    if !warned.warnings.is_empty() {
        let messages = warned
            .warnings
            .iter()
            .map(|warning| warning.message.as_str())
            .collect::<Vec<_>>()
            .join("; ");
        return Err(format!(
            "PDF typesetting produced warnings and no artifact was written: {messages}"
        ));
    }
    let paged = warned
        .output
        .map_err(|error| format!("Failed to typeset PDF: {error}"))?;
    let bytes = typst_pdf::pdf(&paged, &Default::default()).map_err(|errors| {
        let messages = errors
            .iter()
            .map(|error| error.message.as_str())
            .collect::<Vec<_>>()
            .join("; ");
        format!("Failed to encode PDF: {messages}")
    })?;

    let timestamp = Local::now().format("%Y%m%d_%H%M%S");
    let filename = match profile {
        PdfProfileId::ProofPdf => format!(
            "{}_{}.pdf",
            safe_title_filename(&document.metadata.title),
            timestamp
        ),
        PdfProfileId::PrintInterior => format!(
            "{}_Print_Interior_{}.pdf",
            safe_title_filename(&document.metadata.title),
            timestamp
        ),
    };
    let output_path = output_dir.join(filename);
    emit_progress(app, "Writing PDF file...", total_steps, total_steps);
    fs::write(&output_path, bytes)
        .map_err(|error| format!("Failed to write PDF artifact: {error}"))?;
    Ok(output_path)
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

fn safe_title_filename(title: &str) -> String {
    let sanitized = title
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
        .collect::<String>();
    let trimmed = sanitized.trim();
    if trimmed.is_empty() {
        "Untitled".to_string()
    } else {
        trimmed.to_string()
    }
}

fn proof_typst_source(document: &BookDocument) -> Result<String, String> {
    let author = primary_author(document);
    let mut source = String::from(
        "#set page(paper: \"a4\", margin: 20mm)\n\
         #set text(font: (\"Libertinus Serif\", \"Noto Serif CJK SC\", \"Noto Naskh Arabic\", \"Noto Sans Hebrew\", \"Noto Emoji\", \"Noto Sans Symbols2\"), size: 12pt)\n\
         #set par(leading: 0.65em)\n",
    );
    source.push_str("#set document(title: ");
    source.push_str(&typst_string(&document.metadata.title));
    source.push_str(", author: (");
    source.push_str(&typst_string(author));
    source.push_str(",))\n");

    render_title_page(&mut source, document, author);

    for section in document.sections.iter().filter(|section| {
        section.role == SectionRole::FrontMatter && included_for_pdf(&section.inclusion)
    }) {
        if !section.blocks.is_empty() {
            source.push_str("#pagebreak()\n");
            render_blocks(&mut source, &section.blocks)?;
        }
    }

    for chapter in publication_sections(document) {
        source.push_str("#pagebreak()\n");
        source.push_str("#align(center)[#text(size: 22pt, weight: \"bold\", ");
        source.push_str(&typst_string(chapter.title.as_deref().unwrap_or_default()));
        source.push_str(")]\n#v(1.5em)\n");

        for (index, section) in project_chapter_sections(chapter).iter().enumerate() {
            if index > 0 {
                source.push_str("#pagebreak()\n");
            }
            if !section.title.is_empty() {
                source.push_str("#text(size: 14pt, weight: \"bold\", ");
                source.push_str(&typst_string(&section.title));
                source.push_str(")\n#v(0.5em)\n");
            }
            render_blocks(&mut source, section.blocks)?;
            source.push_str("#v(0.5em)\n");
        }
    }

    for section in document.sections.iter().filter(|section| {
        section.role == SectionRole::BackMatter && included_for_pdf(&section.inclusion)
    }) {
        if !section.blocks.is_empty() {
            source.push_str("#pagebreak()\n");
            render_blocks(&mut source, &section.blocks)?;
        }
    }

    Ok(source)
}

fn print_typst_source(
    document: &BookDocument,
    settings: &PrintInteriorPdfSettings,
) -> Result<String, String> {
    let author = primary_author(document);
    let (width, height) = settings.trim_size.dimensions_inches();
    let inside = settings.inside_margin_inches + settings.gutter_inches;
    let mut source = format!(
        "#set page(width: {width:.3}in, height: {height:.3}in, binding: left, \
         margin: (top: {top:.3}in, bottom: {bottom:.3}in, inside: {inside:.3}in, \
         outside: {outside:.3}in), header: none, footer: none)\n\
         #set text(font: (\"Libertinus Serif\", \"Noto Serif CJK SC\", \"Noto Naskh Arabic\", \
         \"Noto Sans Hebrew\", \"Noto Emoji\", \"Noto Sans Symbols2\"), size: 11pt)\n\
         #set par(leading: 0.55em)\n",
        top = settings.top_margin_inches,
        bottom = settings.bottom_margin_inches,
        outside = settings.outside_margin_inches,
    );
    source.push_str("#set document(title: ");
    source.push_str(&typst_string(&document.metadata.title));
    source.push_str(", author: (");
    source.push_str(&typst_string(author));
    source.push_str(",))\n");
    source.push_str("#let wm-title = ");
    source.push_str(&typst_string(&document.metadata.title));
    source.push_str("\n#let wm-author = ");
    source.push_str(&typst_string(author));
    source.push_str(
        "\n#let wm-opening-page() = {\n\
           query(<wm-opening>).any(item => item.location().page() == here().page())\n\
         }\n\
         #let wm-running-header = context {\n\
           if not wm-opening-page() {\n\
             set text(size: 8.5pt)\n\
             if calc.even(here().page()) {\n\
               align(left, wm-author)\n\
             } else {\n\
               align(right, wm-title)\n\
             }\n\
           }\n\
         }\n\
         #let wm-front-footer = context {\n\
           set text(size: 8.5pt)\n\
           align(center, counter(page).display(\"i\"))\n\
         }\n\
         #let wm-body-footer = context {\n\
           if not wm-opening-page() {\n\
             set text(size: 8.5pt)\n\
             align(center, counter(page).display(\"1\"))\n\
           }\n\
         }\n",
    );

    source.push_str("#metadata(\"opening\") <wm-opening>\n");
    render_title_page(&mut source, document, author);

    let front_sections = document
        .sections
        .iter()
        .filter(|section| {
            section.role == SectionRole::FrontMatter
                && included_for_pdf(&section.inclusion)
                && !section.blocks.is_empty()
        })
        .collect::<Vec<_>>();
    if !front_sections.is_empty() {
        source.push_str(if settings.front_matter_page_numbers {
            "#set page(header: none, footer: wm-front-footer)\n"
        } else {
            "#set page(header: none, footer: none)\n"
        });
        for section in front_sections {
            source.push_str("#pagebreak()\n");
            render_blocks(&mut source, &section.blocks)?;
        }
    }

    let body_header = if settings.running_headers {
        "wm-running-header"
    } else {
        "none"
    };
    let body_footer = if settings.body_page_numbers {
        "wm-body-footer"
    } else {
        "none"
    };
    for (unit_index, unit) in print_units(document).iter().enumerate() {
        match settings.chapter_start {
            ChapterStartSide::NextPage => {
                source.push_str(&format!(
                    "#set page(header: {body_header}, footer: {body_footer})\n\
                     #pagebreak()\n"
                ));
            }
            ChapterStartSide::Recto => {
                source.push_str(
                    "#set page(header: none, footer: none)\n\
                     #pagebreak(to: \"odd\")\n",
                );
                source.push_str(&format!(
                    "#set page(header: {body_header}, footer: {body_footer})\n"
                ));
            }
        }
        if unit_index == 0 {
            source.push_str("#counter(page).update(1)\n");
        }
        source.push_str("#metadata(\"opening\") <wm-opening>\n");
        render_print_unit(&mut source, unit)?;
    }

    for section in document.sections.iter().filter(|section| {
        section.role == SectionRole::BackMatter
            && included_for_pdf(&section.inclusion)
            && !section.blocks.is_empty()
    }) {
        source.push_str(&format!(
            "#set page(header: {body_header}, footer: {body_footer})\n\
             #pagebreak()\n\
             #metadata(\"opening\") <wm-opening>\n"
        ));
        render_blocks(&mut source, &section.blocks)?;
    }

    Ok(source)
}

fn render_print_unit(source: &mut String, unit: &BookSection) -> Result<(), String> {
    let title_size = if matches!(unit.role, SectionRole::Part | SectionRole::Volume) {
        22
    } else {
        18
    };
    source.push_str(&format!(
        "#v(12%)\n#align(center)[#text(size: {title_size}pt, weight: \"bold\", "
    ));
    source.push_str(&typst_string(unit.title.as_deref().unwrap_or_default()));
    source.push_str(")]\n#v(2em)\n");

    for (index, section) in print_unit_sections(unit).iter().enumerate() {
        if index > 0 && section.role == SectionRole::Scene {
            source.push_str("#v(0.8em)\n#align(center)[#text(\"#\")]\n#v(0.8em)\n");
        } else if !section.title.is_empty() && section.role != SectionRole::Scene {
            source.push_str("#v(1em)\n#text(size: 13pt, weight: \"bold\", ");
            source.push_str(&typst_string(&section.title));
            source.push_str(")\n#v(0.5em)\n");
        }
        render_blocks(source, section.blocks)?;
    }
    Ok(())
}

fn print_units(document: &BookDocument) -> Vec<&BookSection> {
    let mut units = Vec::new();
    collect_print_units(&document.sections, &mut units);
    units
}

fn collect_print_units<'a>(sections: &'a [BookSection], units: &mut Vec<&'a BookSection>) {
    for section in sections {
        if !included_for_pdf(&section.inclusion)
            || matches!(
                section.role,
                SectionRole::FrontMatter | SectionRole::BackMatter
            )
        {
            continue;
        }
        if is_print_unit_role(&section.role)
            || (section.role == SectionRole::Unassigned && !section.blocks.is_empty())
        {
            units.push(section);
        }
        collect_print_units(&section.children, units);
    }
}

fn is_print_unit_role(role: &SectionRole) -> bool {
    matches!(
        role,
        SectionRole::Part
            | SectionRole::Chapter
            | SectionRole::Work
            | SectionRole::Installment
            | SectionRole::Volume
    )
}

fn print_unit_sections(unit: &BookSection) -> Vec<PdfSection<'_>> {
    let mut sections = Vec::new();
    if !unit.blocks.is_empty() {
        sections.push(PdfSection {
            title: String::new(),
            role: unit.role.clone(),
            blocks: &unit.blocks,
        });
    }

    let mut folder_path = Vec::new();
    collect_print_unit_sections(unit, &mut folder_path, &mut sections);
    sections
}

fn collect_print_unit_sections<'a>(
    parent: &'a BookSection,
    folder_path: &mut Vec<&'a str>,
    sections: &mut Vec<PdfSection<'a>>,
) {
    for child in &parent.children {
        if !included_for_pdf(&child.inclusion) || is_print_unit_role(&child.role) {
            continue;
        }

        let child_title = child.title.as_deref().unwrap_or_default();
        if !child.blocks.is_empty() || child.children.is_empty() {
            let title = folder_path
                .iter()
                .copied()
                .chain((!child_title.is_empty()).then_some(child_title))
                .collect::<Vec<_>>()
                .join(" — ");
            sections.push(PdfSection {
                title,
                role: child.role.clone(),
                blocks: &child.blocks,
            });
        }

        let added_title = (!child_title.is_empty()).then_some(child_title);
        if let Some(title) = added_title {
            folder_path.push(title);
        }
        collect_print_unit_sections(child, folder_path, sections);
        if added_title.is_some() {
            folder_path.pop();
        }
    }
}

fn render_title_page(source: &mut String, document: &BookDocument, author: &str) {
    source.push_str("#align(center + horizon)[\n");
    source.push_str("  #text(size: 28pt, weight: \"bold\", ");
    source.push_str(&typst_string(&document.metadata.title));
    source.push_str(")\n");
    if let Some(subtitle) = document
        .metadata
        .subtitle
        .as_deref()
        .filter(|subtitle| !subtitle.trim().is_empty())
    {
        source.push_str("  #v(1em)\n  #text(size: 18pt, ");
        source.push_str(&typst_string(subtitle));
        source.push_str(")\n");
    }
    if !author.trim().is_empty() {
        source.push_str("  #v(2em)\n  #text(size: 16pt, ");
        source.push_str(&typst_string(author));
        source.push_str(")\n");
    }
    source.push_str("]\n");
}

fn publication_sections(document: &BookDocument) -> Vec<&BookSection> {
    document
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
        .collect()
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

fn project_chapter_sections(chapter: &BookSection) -> Vec<PdfSection<'_>> {
    let mut sections = Vec::new();
    if !chapter.blocks.is_empty() {
        sections.push(PdfSection {
            title: String::new(),
            role: chapter.role.clone(),
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

        let child_title = child.title.as_deref().unwrap_or_default();
        if !child.blocks.is_empty() || child.children.is_empty() {
            let title = folder_path
                .iter()
                .copied()
                .chain((!child_title.is_empty()).then_some(child_title))
                .collect::<Vec<_>>()
                .join(" — ");
            sections.push(PdfSection {
                title,
                role: child.role.clone(),
                blocks: &child.blocks,
            });
        }

        let added_title = (!child_title.is_empty()).then_some(child_title);
        if let Some(title) = added_title {
            folder_path.push(title);
        }
        collect_pdf_sections(child, folder_path, sections);
        if added_title.is_some() {
            folder_path.pop();
        }
    }
}

fn render_blocks(source: &mut String, blocks: &[Block]) -> Result<(), String> {
    for block in blocks {
        match block {
            Block::Paragraph { inlines, style } => render_paragraph(source, inlines, style)?,
            Block::Heading { level, inlines } => render_heading(source, level, inlines)?,
            Block::OrderedList { items } => render_list(source, items, true)?,
            Block::BulletList { items } => render_list(source, items, false)?,
            Block::BlockQuote { blocks } => {
                source.push_str("#quote(block: true)[\n");
                render_blocks(source, blocks)?;
                source.push_str("]\n");
            }
            Block::SceneBreak { style } => {
                let marker = match style {
                    SceneBreakStyle::Whitespace => "",
                    SceneBreakStyle::Asterisks => "* * *",
                    SceneBreakStyle::Custom { marker } => marker,
                };
                source.push_str("#align(center)[#text(");
                source.push_str(&typst_string(marker));
                source.push_str(")]\n#v(0.5em)\n");
            }
            Block::PageBreak => source.push_str("#pagebreak()\n"),
            Block::Image { asset_id, .. } => {
                return Err(format!(
                    "Current PDF profile cannot render image asset {:?}",
                    asset_id.0
                ))
            }
            Block::FootnoteDefinition { id, .. } => {
                return Err(format!(
                    "Current PDF profile cannot render footnote definition {:?}",
                    id.0
                ))
            }
        }
    }
    Ok(())
}

fn render_paragraph(
    source: &mut String,
    inlines: &[Inline],
    style: &ParagraphStyle,
) -> Result<(), String> {
    source.push_str("#block(width: 100%)[\n");
    match style.direction {
        TextDirection::Auto => {}
        TextDirection::LeftToRight => source.push_str("#set text(dir: ltr)\n"),
        TextDirection::RightToLeft => source.push_str("#set text(dir: rtl)\n"),
    }
    source.push_str("#set par(justify: ");
    source.push_str(if style.alignment == ParagraphAlignment::Justify {
        "true"
    } else {
        "false"
    });
    source.push_str(")\n");

    let alignment = match style.alignment {
        ParagraphAlignment::Start | ParagraphAlignment::Justify => match style.direction {
            TextDirection::RightToLeft => "right",
            _ => "left",
        },
        ParagraphAlignment::Center => "center",
        ParagraphAlignment::End => match style.direction {
            TextDirection::RightToLeft => "left",
            _ => "right",
        },
    };
    source.push_str("#align(");
    source.push_str(alignment);
    source.push_str(")[");

    let indent = style.indent_level as f32 * 1.5;
    if indent > 0.0 {
        let side = if style.direction == TextDirection::RightToLeft {
            "right"
        } else {
            "left"
        };
        source.push_str("#pad(");
        source.push_str(side);
        source.push_str(": ");
        source.push_str(&format!("{indent:.1}em"));
        source.push_str(")[");
    }
    render_inlines(source, inlines)?;
    if indent > 0.0 {
        source.push(']');
    }
    source.push_str("]\n]\n#v(0.3em)\n");
    Ok(())
}

fn render_heading(
    source: &mut String,
    level: &HeadingLevel,
    inlines: &[Inline],
) -> Result<(), String> {
    let level = match level {
        HeadingLevel::H1 => 1,
        HeadingLevel::H2 => 2,
        HeadingLevel::H3 => 3,
        HeadingLevel::H4 => 4,
        HeadingLevel::H5 => 5,
        HeadingLevel::H6 => 6,
    };
    source.push_str("#heading(level: ");
    source.push_str(&level.to_string());
    source.push_str(", outlined: false)[");
    render_inlines(source, inlines)?;
    source.push_str("]\n");
    Ok(())
}

fn render_list(source: &mut String, items: &[ListItem], ordered: bool) -> Result<(), String> {
    source.push_str(if ordered { "#enum(\n" } else { "#list(\n" });
    for item in items {
        source.push_str("[\n");
        render_blocks(source, &item.blocks)?;
        source.push_str("],\n");
    }
    source.push_str(")\n");
    Ok(())
}

fn render_inlines(source: &mut String, inlines: &[Inline]) -> Result<(), String> {
    for inline in inlines {
        match inline {
            Inline::Text { text, marks, link } => {
                for (index, line) in text.split('\n').enumerate() {
                    if index > 0 {
                        source.push_str("#linebreak()");
                    }
                    if !line.is_empty() {
                        let mut content = format!("#text({})", typst_string(line));
                        content = apply_marks(content, marks);
                        if let Some(link) = link {
                            content = format!("#link({})[{}]", typst_string(&link.0), content);
                        }
                        source.push_str(&content);
                    }
                }
            }
            Inline::FootnoteReference { id } => {
                return Err(format!(
                    "Current PDF profile cannot render footnote reference {:?}",
                    id.0
                ))
            }
        }
    }
    Ok(())
}

fn apply_marks(mut content: String, marks: &InlineMarks) -> String {
    if marks.bold {
        content = format!("#strong[{content}]");
    }
    if marks.italic {
        content = format!("#emph[{content}]");
    }
    if marks.underline {
        content = format!("#underline[{content}]");
    }
    if marks.strike {
        content = format!("#strike[{content}]");
    }
    content
}

fn typst_string(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len() + 2);
    escaped.push('"');
    for character in value.chars() {
        match character {
            '\\' => escaped.push_str("\\\\"),
            '"' => escaped.push_str("\\\""),
            '\n' => escaped.push_str("\\n"),
            '\r' => escaped.push_str("\\r"),
            '\t' => escaped.push_str("\\t"),
            control if control.is_control() => {
                escaped.push_str(&format!("\\u{{{:x}}}", control as u32));
            }
            character => escaped.push(character),
        }
    }
    escaped.push('"');
    escaped
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::publishing::model::{BookContributor, BookMetadata, InlineMarks, ParagraphStyle};
    use typst::layout::{Frame, FrameItem};

    fn acceptance_document() -> BookDocument {
        serde_json::from_str(include_str!(
            "../publishing/fixtures/pdf_acceptance_document.json"
        ))
        .unwrap()
    }

    #[test]
    fn source_escapes_user_text_and_requests_real_typography() {
        let mut document = acceptance_document();
        document.metadata.title = "A \"title\" with #markup".to_string();
        let source = proof_typst_source(&document).unwrap();

        assert!(source.contains("\"A \\\"title\\\" with #markup\""));
        assert!(source.contains("#set par(justify: true)"));
        assert!(source.contains("#set text(dir: rtl)"));
        assert!(source.contains("#linebreak()"));
        assert!(source.contains("#enum("));
        assert!(source.contains("#list("));
    }

    #[test]
    fn acceptance_document_typesets_without_warnings() {
        let source = proof_typst_source(&acceptance_document()).unwrap();
        let engine = TypstEngine::builder()
            .main_file(source)
            .fonts(PUBLISHING_FONTS)
            .build();
        let warned = engine.compile::<PagedDocument>();
        let warning_messages = warned
            .warnings
            .iter()
            .map(|warning| warning.message.as_str())
            .collect::<Vec<_>>();

        assert!(warning_messages.is_empty(), "{warning_messages:#?}");
        assert!(warned.output.is_ok());
    }

    #[test]
    fn print_source_uses_exact_geometry_and_book_pagination_rules() {
        let source =
            print_typst_source(&recto_document(), &PrintInteriorPdfSettings::default()).unwrap();

        assert!(source.contains("width: 6.000in, height: 9.000in"));
        assert!(source.contains("inside: 0.875in"));
        assert!(source.contains("outside: 0.625in"));
        assert!(source.contains("#pagebreak(to: \"odd\")"));
        assert!(source.contains("counter(page).display(\"i\")"));
        assert!(source.contains("counter(page).display(\"1\")"));
        assert_eq!(source.matches("#counter(page).update(1)").count(), 1);
    }

    #[test]
    fn print_interior_typesets_recto_chapters_with_blank_versos() {
        let source =
            print_typst_source(&recto_document(), &PrintInteriorPdfSettings::default()).unwrap();
        let engine = TypstEngine::builder()
            .main_file(source)
            .fonts(PUBLISHING_FONTS)
            .build();
        let warned = engine.compile::<PagedDocument>();
        let warning_messages = warned
            .warnings
            .iter()
            .map(|warning| warning.message.as_str())
            .collect::<Vec<_>>();

        assert!(warning_messages.is_empty(), "{warning_messages:#?}");
        let document = warned.output.unwrap();
        assert_eq!(document.pages.len(), 5);
        assert!(!frame_has_text(&document.pages[1].frame));
        assert!(!frame_has_text(&document.pages[3].frame));
        assert!(frame_has_text(&document.pages[2].frame));
        assert!(frame_has_text(&document.pages[4].frame));
    }

    #[test]
    fn nested_part_and_chapters_each_receive_structural_print_starts() {
        let mut book = recto_document();
        book.sections = vec![BookSection {
            source_node_id: Some(10),
            role: SectionRole::Part,
            title: Some("Part One".to_string()),
            inclusion: SectionInclusion::AllFormats,
            blocks: vec![],
            children: vec![chapter(11, "Chapter One"), chapter(12, "Chapter Two")],
        }];

        assert_eq!(
            print_units(&book)
                .iter()
                .map(|unit| unit.title.as_deref().unwrap())
                .collect::<Vec<_>>(),
            vec!["Part One", "Chapter One", "Chapter Two"]
        );

        let source = print_typst_source(&book, &PrintInteriorPdfSettings::default()).unwrap();
        let engine = TypstEngine::builder()
            .main_file(source)
            .fonts(PUBLISHING_FONTS)
            .build();
        let warned = engine.compile::<PagedDocument>();
        assert!(warned.warnings.is_empty(), "{:#?}", warned.warnings);
        assert_eq!(warned.output.unwrap().pages.len(), 7);
    }

    #[test]
    fn print_front_matter_uses_roman_numbers_and_suppresses_opening_folios() {
        let mut book = recto_document();
        book.sections.insert(
            0,
            BookSection {
                source_node_id: None,
                role: SectionRole::FrontMatter,
                title: Some("Dedication".to_string()),
                inclusion: SectionInclusion::AllFormats,
                blocks: vec![paragraph("For the reader.")],
                children: vec![],
            },
        );
        let source = print_typst_source(&book, &PrintInteriorPdfSettings::default()).unwrap();
        let engine = TypstEngine::builder()
            .main_file(source)
            .fonts(PUBLISHING_FONTS)
            .build();
        let warned = engine.compile::<PagedDocument>();

        assert!(warned.warnings.is_empty(), "{:#?}", warned.warnings);
        let document = warned.output.unwrap();
        assert!(frame_text(&document.pages[1].frame)
            .iter()
            .any(|text| text == "ii"));
        assert!(!frame_text(&document.pages[2].frame)
            .iter()
            .any(|text| text == "1"));
    }

    #[test]
    fn print_interior_pdf_uses_selected_trim_and_embeds_fonts() {
        let output = tempfile::tempdir().unwrap();
        let path = generate_pdf_for_profile(
            &recto_document(),
            output.path(),
            None,
            PdfProfileId::PrintInterior,
            &PrintInteriorPdfSettings::default(),
        )
        .unwrap();
        let pdf = lopdf::Document::load(path).unwrap();
        let pages = pdf.get_pages();
        let first_page = pdf
            .get_object(*pages.values().next().unwrap())
            .unwrap()
            .as_dict()
            .unwrap();
        let media_box = first_page.get(b"MediaBox").unwrap().as_array().unwrap();
        assert_eq!(pdf_number(&media_box[2]).round() as i64, 432);
        assert_eq!(pdf_number(&media_box[3]).round() as i64, 648);

        let has_embedded_font = pdf.objects.values().any(|object| {
            object
                .as_dict()
                .ok()
                .filter(|dictionary| {
                    dictionary
                        .get(b"Type")
                        .ok()
                        .and_then(|value| value.as_name().ok())
                        == Some(b"FontDescriptor")
                })
                .is_some_and(|dictionary| {
                    dictionary.has(b"FontFile")
                        || dictionary.has(b"FontFile2")
                        || dictionary.has(b"FontFile3")
                })
        });
        assert!(has_embedded_font);
    }

    #[test]
    fn acceptance_pdf_has_a4_pages_and_embedded_fonts() {
        let output = tempfile::tempdir().unwrap();
        let path = generate_pdf(&acceptance_document(), output.path(), None).unwrap();
        let pdf = lopdf::Document::load(path).unwrap();
        let pages = pdf.get_pages();
        assert!(pages.len() >= 4);

        let first_page = pdf
            .get_object(*pages.values().next().unwrap())
            .unwrap()
            .as_dict()
            .unwrap();
        let media_box = first_page.get(b"MediaBox").unwrap().as_array().unwrap();
        assert_eq!(pdf_number(&media_box[2]).round() as i64, 595);
        assert_eq!(pdf_number(&media_box[3]).round() as i64, 842);

        let has_embedded_font = pdf.objects.values().any(|object| {
            object
                .as_dict()
                .ok()
                .filter(|dictionary| {
                    dictionary
                        .get(b"Type")
                        .ok()
                        .and_then(|value| value.as_name().ok())
                        == Some(b"FontDescriptor")
                })
                .is_some_and(|dictionary| {
                    dictionary.has(b"FontFile")
                        || dictionary.has(b"FontFile2")
                        || dictionary.has(b"FontFile3")
                })
        });
        assert!(has_embedded_font);
    }

    #[test]
    fn direction_aware_alignment_uses_the_leading_edge() {
        let style = ParagraphStyle {
            alignment: ParagraphAlignment::Start,
            indent_level: 1,
            direction: TextDirection::RightToLeft,
        };
        let mut source = String::new();
        render_paragraph(&mut source, &[], &style).unwrap();

        assert!(source.contains("#align(right)"));
        assert!(source.contains("#pad(right: 1.5em)"));
    }

    #[test]
    fn unsupported_footnote_references_fail_instead_of_becoming_visible_ids() {
        let mut document = acceptance_document();
        let Block::Paragraph { inlines, .. } = &mut document.sections[1].blocks[1] else {
            panic!("acceptance fixture paragraph moved");
        };
        inlines.push(Inline::FootnoteReference {
            id: crate::publishing::model::FootnoteId("note-1".to_string()),
        });

        let error = proof_typst_source(&document).unwrap_err();

        assert_eq!(
            error,
            "Current PDF profile cannot render footnote reference \"note-1\""
        );
    }

    fn pdf_number(value: &lopdf::Object) -> f64 {
        match value {
            lopdf::Object::Integer(value) => *value as f64,
            lopdf::Object::Real(value) => *value,
            other => panic!("expected PDF number, got {other:?}"),
        }
    }

    fn recto_document() -> BookDocument {
        BookDocument {
            metadata: BookMetadata {
                title: "Recto Test".to_string(),
                contributors: vec![BookContributor {
                    name: "A. Writer".to_string(),
                    role: ContributorRole::Author,
                }],
                ..BookMetadata::default()
            },
            sections: vec![chapter(1, "Chapter One"), chapter(2, "Chapter Two")],
            assets: vec![],
        }
    }

    fn chapter(id: i64, title: &str) -> BookSection {
        BookSection {
            source_node_id: Some(id),
            role: SectionRole::Chapter,
            title: Some(title.to_string()),
            inclusion: SectionInclusion::AllFormats,
            blocks: vec![paragraph(&format!("Body for {title}."))],
            children: vec![],
        }
    }

    fn paragraph(text: &str) -> Block {
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

    fn frame_has_text(frame: &Frame) -> bool {
        frame.items().any(|(_, item)| match item {
            FrameItem::Text(_) => true,
            FrameItem::Group(group) => frame_has_text(&group.frame),
            _ => false,
        })
    }

    fn frame_text(frame: &Frame) -> Vec<String> {
        let mut text = Vec::new();
        for (_, item) in frame.items() {
            match item {
                FrameItem::Text(item) => text.push(item.text.to_string()),
                FrameItem::Group(group) => text.extend(frame_text(&group.frame)),
                _ => {}
            }
        }
        text
    }
}
