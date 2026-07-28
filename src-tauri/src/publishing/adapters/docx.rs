use std::fs::File;
use std::io::Read;
use std::path::Path;

use docx_rs::{
    AbstractNumbering, AlignmentType, BreakType, Docx, Header, Hyperlink, HyperlinkType,
    IndentLevel, Level, LevelJc, LevelText, LineSpacing, LineSpacingType, NumberFormat, Numbering,
    NumberingId, PageMargin, PageNum, PageNumType, PageSize, Paragraph, Run, RunFonts, Section,
    SpecialIndentType, Start, Style, StyleType,
};

use crate::publishing::model::{
    Block, BookDocument, BookSection, HeadingLevel, Inline, InlineMarks, ListItem, OutputFormat,
    ParagraphAlignment, ParagraphStyle, SceneBreakStyle, SectionInclusion, SectionRole,
};
use crate::publishing::request::{ContactInformation, DocxProfileId};

const LETTER_WIDTH: u32 = 12_240;
const LETTER_HEIGHT: u32 = 15_840;
const ONE_INCH: i32 = 1_440;
const HALF_INCH: i32 = 720;
const BODY_FONT_SIZE: usize = 24;
const ORDERED_NUMBERING_ID: usize = 41;
const BULLET_NUMBERING_ID: usize = 42;
const MAX_LIST_DEPTH: usize = 8;

const STYLE_TITLE: &str = "WMTitle";
const STYLE_SUBTITLE: &str = "WMSubtitle";
const STYLE_BODY: &str = "WMBody";
const STYLE_CONTACT: &str = "WMContact";
const STYLE_BYLINE: &str = "WMByline";
const STYLE_PART: &str = "WMPart";
const STYLE_CHAPTER: &str = "WMChapter";
const STYLE_SCENE: &str = "WMScene";
const STYLE_SCENE_BREAK: &str = "WMSceneBreak";
const STYLE_QUOTE: &str = "WMQuote";
const STYLE_LIST: &str = "WMList";

#[derive(Debug, Clone)]
pub(crate) struct DocxRenderOptions {
    pub profile: DocxProfileId,
    pub author: String,
    pub contact: ContactInformation,
}

pub(crate) fn render_docx(
    document: &BookDocument,
    options: &DocxRenderOptions,
    output_path: &Path,
) -> Result<(), String> {
    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create DOCX output directory: {error}"))?;
    }

    let mut docx = base_document(document, options.profile);
    docx = add_numberings(docx);

    match options.profile {
        DocxProfileId::StandardManuscript => {
            docx = render_standard_title_page(docx, document, options);
            docx = render_standard_body(docx, document, options)?;
        }
        DocxProfileId::CleanHandoff => {
            docx = render_clean_body(docx, document, options)?;
        }
    }

    let file = File::create(output_path)
        .map_err(|error| format!("Failed to create DOCX artifact: {error}"))?;
    docx.build()
        .pack(file)
        .map_err(|error| format!("Failed to package DOCX artifact: {error}"))?;
    validate_docx(output_path, options.profile)
}

fn base_document(document: &BookDocument, profile: DocxProfileId) -> Docx {
    let fonts = manuscript_fonts();
    let body_spacing = body_spacing(profile);
    let mut docx = Docx::new()
        .default_fonts(fonts.clone())
        .default_size(BODY_FONT_SIZE)
        .default_line_spacing(body_spacing.clone())
        .page_size(LETTER_WIDTH, LETTER_HEIGHT)
        .page_margin(manuscript_margins())
        .custom_property("Title", document.metadata.title.clone())
        .custom_property(
            "Author",
            document
                .metadata
                .contributors
                .first()
                .map(|contributor| contributor.name.clone())
                .unwrap_or_default(),
        )
        .custom_property("PublishingProfile", profile_name(profile));

    for style in named_styles(profile, fonts, body_spacing) {
        docx = docx.add_style(style);
    }
    docx
}

fn render_standard_title_page(
    docx: Docx,
    document: &BookDocument,
    options: &DocxRenderOptions,
) -> Docx {
    let contact = &options.contact;
    let mut title_section = Section::new()
        .page_size(PageSize::new().size(LETTER_WIDTH, LETTER_HEIGHT))
        .page_margin(manuscript_margins());

    for line in contact_lines(contact) {
        title_section = title_section.add_paragraph(
            Paragraph::new()
                .style(STYLE_CONTACT)
                .add_run(Run::new().add_text(line)),
        );
    }
    title_section = title_section
        .add_paragraph(Paragraph::new().style(STYLE_CONTACT))
        .add_paragraph(
            Paragraph::new()
                .style(STYLE_TITLE)
                .align(AlignmentType::Center)
                .add_run(
                    Run::new()
                        .bold()
                        .add_text(document.metadata.title.to_uppercase()),
                ),
        );
    if let Some(subtitle) = document
        .metadata
        .subtitle
        .as_ref()
        .filter(|subtitle| !subtitle.trim().is_empty())
    {
        title_section = title_section.add_paragraph(
            Paragraph::new()
                .style(STYLE_SUBTITLE)
                .align(AlignmentType::Center)
                .add_run(Run::new().add_text(subtitle)),
        );
    }
    title_section = title_section.add_paragraph(
        Paragraph::new()
            .style(STYLE_BYLINE)
            .add_run(Run::new().add_text(format!("by {}", options.author))),
    );
    docx.add_section(title_section)
}

fn render_standard_body(
    mut docx: Docx,
    document: &BookDocument,
    options: &DocxRenderOptions,
) -> Result<Docx, String> {
    let surname = derive_header_surname(&options.contact.header_surname, &options.author);
    let short_title = if options.contact.short_title.trim().is_empty() {
        document.metadata.title.clone()
    } else {
        options.contact.short_title.trim().to_string()
    };
    let header = Header::new().add_paragraph(
        Paragraph::new()
            .style(STYLE_BODY)
            .align(AlignmentType::Right)
            .add_run(Run::new().add_text(format!("{surname} / {short_title} / ")))
            .add_page_num(PageNum::new()),
    );
    docx = docx
        .page_num_type(PageNumType::new().start(1))
        .header(header);
    let mut state = RenderState::new(DocxProfileId::StandardManuscript);
    state.render_sections(&document.sections, 0)?;
    Ok(state
        .paragraphs
        .into_iter()
        .fold(docx, |document, paragraph| {
            document.add_paragraph(paragraph)
        }))
}

fn render_clean_body(
    mut docx: Docx,
    document: &BookDocument,
    options: &DocxRenderOptions,
) -> Result<Docx, String> {
    docx = docx.add_paragraph(
        Paragraph::new()
            .style(STYLE_TITLE)
            .add_run(Run::new().add_text(&document.metadata.title)),
    );
    let mut state = RenderState::new(DocxProfileId::CleanHandoff);
    if let Some(subtitle) = document
        .metadata
        .subtitle
        .as_ref()
        .filter(|subtitle| !subtitle.trim().is_empty())
    {
        state.push(
            Paragraph::new()
                .style(STYLE_SUBTITLE)
                .add_run(Run::new().add_text(subtitle)),
        );
    }
    state.push(
        Paragraph::new()
            .style(STYLE_BYLINE)
            .add_run(Run::new().add_text(format!("by {}", options.author))),
    );
    state.content_started = true;
    state.render_sections(&document.sections, 0)?;
    Ok(state
        .paragraphs
        .into_iter()
        .fold(docx, |document, paragraph| {
            document.add_paragraph(paragraph)
        }))
}

struct RenderState {
    profile: DocxProfileId,
    paragraphs: Vec<Paragraph>,
    content_started: bool,
}

impl RenderState {
    fn new(profile: DocxProfileId) -> Self {
        Self {
            profile,
            paragraphs: Vec::new(),
            content_started: false,
        }
    }

    fn push(&mut self, paragraph: Paragraph) {
        self.paragraphs.push(paragraph);
    }

    fn render_sections(&mut self, sections: &[BookSection], depth: usize) -> Result<(), String> {
        let visible: Vec<&BookSection> = sections
            .iter()
            .filter(|section| section_or_descendant_included(section))
            .collect();

        let mut previous_was_scene = false;
        for section in visible {
            if self.profile == DocxProfileId::StandardManuscript
                && section.role == SectionRole::Scene
                && previous_was_scene
            {
                self.push(scene_marker("#"));
            }
            self.render_section(section, depth)?;
            previous_was_scene = section.role == SectionRole::Scene;
        }
        Ok(())
    }

    fn render_section(&mut self, section: &BookSection, depth: usize) -> Result<(), String> {
        if !section_included(section) {
            return self.render_sections(&section.children, depth + 1);
        }

        if let Some(title) = section
            .title
            .as_ref()
            .filter(|title| !title.trim().is_empty())
        {
            if let Some(style) = title_style(&section.role, self.profile) {
                let mut paragraph = Paragraph::new()
                    .style(style)
                    .add_run(Run::new().add_text(title));
                if starts_new_page(&section.role) && self.content_started {
                    paragraph = paragraph.page_break_before(true);
                }
                self.push(paragraph);
                self.content_started = true;
            }
        } else if starts_new_page(&section.role) && self.content_started {
            self.push(
                Paragraph::new()
                    .style(STYLE_BODY)
                    .add_run(Run::new().add_break(BreakType::Page)),
            );
        }

        self.render_blocks(&section.blocks, 0)?;
        self.render_sections(&section.children, depth + 1)
    }

    fn render_blocks(&mut self, blocks: &[Block], list_depth: usize) -> Result<(), String> {
        for block in blocks {
            match block {
                Block::Paragraph { inlines, style } => {
                    let paragraph = add_inlines(paragraph_for_style(style), inlines)?;
                    self.push(paragraph);
                    self.content_started = true;
                }
                Block::Heading { level, inlines } => {
                    let paragraph =
                        add_inlines(Paragraph::new().style(heading_style(level)), inlines)?;
                    self.push(paragraph);
                    self.content_started = true;
                }
                Block::OrderedList { items } => {
                    self.render_list(items, list_depth, ORDERED_NUMBERING_ID)?;
                }
                Block::BulletList { items } => {
                    self.render_list(items, list_depth, BULLET_NUMBERING_ID)?;
                }
                Block::BlockQuote { blocks } => {
                    self.render_quote(blocks, list_depth)?;
                }
                Block::SceneBreak { style } => {
                    let marker = match self.profile {
                        DocxProfileId::StandardManuscript => "#".to_string(),
                        DocxProfileId::CleanHandoff => scene_marker_text(style),
                    };
                    self.push(scene_marker(&marker));
                }
                Block::PageBreak => self.push(
                    Paragraph::new()
                        .style(STYLE_BODY)
                        .add_run(Run::new().add_break(BreakType::Page)),
                ),
                Block::Image { .. } => return Err(
                    "DOCX rendering reached an image that should have been blocked by preflight."
                        .to_string(),
                ),
                Block::FootnoteDefinition { .. } => return Err(
                    "DOCX rendering reached a footnote that should have been blocked by preflight."
                        .to_string(),
                ),
            }
        }
        Ok(())
    }

    fn render_list(
        &mut self,
        items: &[ListItem],
        depth: usize,
        numbering_id: usize,
    ) -> Result<(), String> {
        let level = depth.min(MAX_LIST_DEPTH);
        for item in items {
            let mut first_block = true;
            for block in &item.blocks {
                match block {
                    Block::Paragraph { inlines, .. } => {
                        let paragraph = add_inlines(
                            Paragraph::new()
                                .style(STYLE_LIST)
                                .numbering(NumberingId::new(numbering_id), IndentLevel::new(level)),
                            inlines,
                        )?;
                        self.push(paragraph);
                        first_block = false;
                        self.content_started = true;
                    }
                    Block::OrderedList { items } => {
                        self.render_list(items, level + 1, ORDERED_NUMBERING_ID)?;
                        first_block = false;
                    }
                    Block::BulletList { items } => {
                        self.render_list(items, level + 1, BULLET_NUMBERING_ID)?;
                        first_block = false;
                    }
                    other => {
                        if first_block {
                            self.push(Paragraph::new().style(STYLE_LIST).numbering(
                                NumberingId::new(numbering_id),
                                IndentLevel::new(level),
                            ));
                            first_block = false;
                        }
                        self.render_blocks(std::slice::from_ref(other), level + 1)?;
                    }
                }
            }
            if first_block {
                self.push(
                    Paragraph::new()
                        .style(STYLE_LIST)
                        .numbering(NumberingId::new(numbering_id), IndentLevel::new(level)),
                );
            }
        }
        Ok(())
    }

    fn render_quote(&mut self, blocks: &[Block], depth: usize) -> Result<(), String> {
        for block in blocks {
            match block {
                Block::Paragraph { inlines, .. } => {
                    self.push(add_inlines(Paragraph::new().style(STYLE_QUOTE), inlines)?);
                    self.content_started = true;
                }
                nested => self.render_blocks(std::slice::from_ref(nested), depth)?,
            }
        }
        Ok(())
    }
}

fn paragraph_for_style(style: &ParagraphStyle) -> Paragraph {
    let mut paragraph = Paragraph::new()
        .style(STYLE_BODY)
        .align(match style.alignment {
            ParagraphAlignment::Start => AlignmentType::Left,
            ParagraphAlignment::Center => AlignmentType::Center,
            ParagraphAlignment::End => AlignmentType::Right,
            ParagraphAlignment::Justify => AlignmentType::Both,
        });
    if style.indent_level > 0 {
        paragraph = paragraph.indent(
            Some(i32::from(style.indent_level) * HALF_INCH),
            None,
            None,
            None,
        );
    }
    paragraph
}

fn add_inlines(mut paragraph: Paragraph, inlines: &[Inline]) -> Result<Paragraph, String> {
    for inline in inlines {
        match inline {
            Inline::Text { text, marks, link } => {
                let run = marked_run(text, marks);
                paragraph = if let Some(target) = link {
                    paragraph.add_hyperlink(
                        Hyperlink::new(target.0.clone(), HyperlinkType::External).add_run(run),
                    )
                } else {
                    paragraph.add_run(run)
                };
            }
            Inline::FootnoteReference { .. } => {
                return Err(
                    "DOCX rendering reached a footnote reference that should have been blocked by preflight."
                        .to_string(),
                )
            }
        }
    }
    Ok(paragraph)
}

fn marked_run(text: &str, marks: &InlineMarks) -> Run {
    let mut run = Run::new().fonts(manuscript_fonts()).size(BODY_FONT_SIZE);
    if marks.bold {
        run = run.bold();
    }
    if marks.italic {
        run = run.italic();
    }
    if marks.underline {
        run = run.underline("single");
    }
    if marks.strike {
        run = run.strike();
    }

    for (index, part) in text.split('\n').enumerate() {
        if index > 0 {
            run = run.add_break(BreakType::TextWrapping);
        }
        if !part.is_empty() {
            run = run.add_text(part);
        }
    }
    run
}

fn named_styles(profile: DocxProfileId, fonts: RunFonts, body_spacing: LineSpacing) -> Vec<Style> {
    let body = {
        let style = Style::new(STYLE_BODY, StyleType::Paragraph)
            .name("WM Body")
            .fonts(fonts.clone())
            .size(BODY_FONT_SIZE)
            .line_spacing(body_spacing);
        match profile {
            DocxProfileId::StandardManuscript => style.indent(
                None,
                Some(SpecialIndentType::FirstLine(HALF_INCH)),
                None,
                None,
            ),
            DocxProfileId::CleanHandoff => style,
        }
    };

    vec![
        body,
        Style::new(STYLE_CONTACT, StyleType::Paragraph)
            .name("WM Contact")
            .fonts(fonts.clone())
            .size(BODY_FONT_SIZE),
        Style::new(STYLE_TITLE, StyleType::Paragraph)
            .name("WM Title")
            .fonts(fonts.clone())
            .size(32)
            .bold()
            .align(AlignmentType::Center),
        Style::new(STYLE_SUBTITLE, StyleType::Paragraph)
            .name("WM Subtitle")
            .fonts(fonts.clone())
            .size(26)
            .italic()
            .align(AlignmentType::Center),
        Style::new(STYLE_BYLINE, StyleType::Paragraph)
            .name("WM Byline")
            .fonts(fonts.clone())
            .size(BODY_FONT_SIZE)
            .align(AlignmentType::Center),
        Style::new(STYLE_PART, StyleType::Paragraph)
            .name("WM Part")
            .fonts(fonts.clone())
            .size(28)
            .bold()
            .align(AlignmentType::Center)
            .outline_lvl(0),
        Style::new(STYLE_CHAPTER, StyleType::Paragraph)
            .name("WM Chapter")
            .fonts(fonts.clone())
            .size(26)
            .bold()
            .align(AlignmentType::Center)
            .outline_lvl(1),
        Style::new(STYLE_SCENE, StyleType::Paragraph)
            .name("WM Scene")
            .fonts(fonts.clone())
            .size(BODY_FONT_SIZE)
            .italic()
            .outline_lvl(2),
        Style::new(STYLE_SCENE_BREAK, StyleType::Paragraph)
            .name("WM Scene Break")
            .fonts(fonts.clone())
            .size(BODY_FONT_SIZE)
            .align(AlignmentType::Center),
        Style::new(STYLE_QUOTE, StyleType::Paragraph)
            .name("WM Quote")
            .fonts(fonts.clone())
            .size(BODY_FONT_SIZE)
            .italic()
            .indent(Some(HALF_INCH), None, Some(HALF_INCH), None),
        Style::new(STYLE_LIST, StyleType::Paragraph)
            .name("WM List")
            .fonts(fonts)
            .size(BODY_FONT_SIZE),
    ]
}

fn add_numberings(mut docx: Docx) -> Docx {
    let mut ordered = AbstractNumbering::new(ORDERED_NUMBERING_ID);
    let mut bullet = AbstractNumbering::new(BULLET_NUMBERING_ID);
    for level in 0..=MAX_LIST_DEPTH {
        let left = ((level + 1) as i32) * HALF_INCH;
        ordered = ordered.add_level(
            Level::new(
                level,
                Start::new(1),
                NumberFormat::new("decimal"),
                LevelText::new(format!("%{}.", level + 1)),
                LevelJc::new("left"),
            )
            .indent(
                Some(left),
                Some(SpecialIndentType::Hanging(360)),
                None,
                None,
            ),
        );
        bullet = bullet.add_level(
            Level::new(
                level,
                Start::new(1),
                NumberFormat::new("bullet"),
                LevelText::new(if level % 2 == 0 { "•" } else { "◦" }),
                LevelJc::new("left"),
            )
            .fonts(manuscript_fonts())
            .indent(
                Some(left),
                Some(SpecialIndentType::Hanging(360)),
                None,
                None,
            ),
        );
    }
    docx = docx
        .add_abstract_numbering(ordered)
        .add_numbering(Numbering::new(ORDERED_NUMBERING_ID, ORDERED_NUMBERING_ID))
        .add_abstract_numbering(bullet)
        .add_numbering(Numbering::new(BULLET_NUMBERING_ID, BULLET_NUMBERING_ID));
    docx
}

fn manuscript_fonts() -> RunFonts {
    RunFonts::new()
        .ascii("Times New Roman")
        .hi_ansi("Times New Roman")
        .east_asia("Times New Roman")
        .cs("Times New Roman")
}

fn manuscript_margins() -> PageMargin {
    PageMargin::new()
        .top(ONE_INCH)
        .right(ONE_INCH)
        .bottom(ONE_INCH)
        .left(ONE_INCH)
        .header(HALF_INCH)
        .footer(HALF_INCH)
}

fn body_spacing(profile: DocxProfileId) -> LineSpacing {
    match profile {
        DocxProfileId::StandardManuscript => LineSpacing::new()
            .line_rule(LineSpacingType::Auto)
            .line(480)
            .after(0),
        DocxProfileId::CleanHandoff => LineSpacing::new()
            .line_rule(LineSpacingType::Auto)
            .line(240)
            .after(120),
    }
}

fn heading_style(level: &HeadingLevel) -> &'static str {
    match level {
        HeadingLevel::H1 | HeadingLevel::H2 => STYLE_CHAPTER,
        HeadingLevel::H3 | HeadingLevel::H4 | HeadingLevel::H5 | HeadingLevel::H6 => STYLE_SCENE,
    }
}

fn title_style(role: &SectionRole, profile: DocxProfileId) -> Option<&'static str> {
    match role {
        SectionRole::Part | SectionRole::Volume => Some(STYLE_PART),
        SectionRole::Chapter | SectionRole::Work | SectionRole::Installment => Some(STYLE_CHAPTER),
        SectionRole::Scene if profile == DocxProfileId::CleanHandoff => Some(STYLE_SCENE),
        SectionRole::FrontMatter | SectionRole::BackMatter => Some(STYLE_CHAPTER),
        SectionRole::Scene | SectionRole::Unassigned => None,
    }
}

fn starts_new_page(role: &SectionRole) -> bool {
    matches!(
        role,
        SectionRole::Part
            | SectionRole::Volume
            | SectionRole::Chapter
            | SectionRole::Work
            | SectionRole::Installment
            | SectionRole::BackMatter
    )
}

fn section_included(section: &BookSection) -> bool {
    match &section.inclusion {
        SectionInclusion::AllFormats => true,
        SectionInclusion::SelectedFormats { formats } => formats.contains(&OutputFormat::Docx),
        SectionInclusion::Excluded => false,
    }
}

fn section_or_descendant_included(section: &BookSection) -> bool {
    section_included(section) || section.children.iter().any(section_or_descendant_included)
}

fn scene_marker_text(style: &SceneBreakStyle) -> String {
    match style {
        SceneBreakStyle::Whitespace => String::new(),
        SceneBreakStyle::Asterisks => "* * *".to_string(),
        SceneBreakStyle::Custom { marker } => marker.clone(),
    }
}

fn scene_marker(marker: &str) -> Paragraph {
    Paragraph::new()
        .style(STYLE_SCENE_BREAK)
        .align(AlignmentType::Center)
        .add_run(Run::new().add_text(marker))
}

fn contact_lines(contact: &ContactInformation) -> Vec<String> {
    [
        contact.author_name.trim(),
        contact.mailing_address.trim(),
        contact.email.trim(),
        contact.phone.trim(),
    ]
    .into_iter()
    .filter(|line| !line.is_empty())
    .map(ToString::to_string)
    .collect()
}

fn derive_header_surname(configured: &str, author: &str) -> String {
    if !configured.trim().is_empty() {
        configured.trim().to_string()
    } else {
        author
            .split_whitespace()
            .last()
            .unwrap_or(author)
            .to_string()
    }
}

fn profile_name(profile: DocxProfileId) -> &'static str {
    match profile {
        DocxProfileId::StandardManuscript => "standard_manuscript",
        DocxProfileId::CleanHandoff => "clean_handoff",
    }
}

fn validate_docx(path: &Path, profile: DocxProfileId) -> Result<(), String> {
    let file = File::open(path)
        .map_err(|error| format!("Failed to reopen DOCX for validation: {error}"))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|error| format!("DOCX is not a valid ZIP: {error}"))?;
    for required in [
        "[Content_Types].xml",
        "word/document.xml",
        "word/styles.xml",
        "word/numbering.xml",
        "docProps/custom.xml",
    ] {
        archive
            .by_name(required)
            .map_err(|_| format!("DOCX package is missing required part {required}"))?;
    }
    if profile == DocxProfileId::StandardManuscript
        && !archive
            .file_names()
            .any(|name| name.starts_with("word/header"))
    {
        return Err("Standard manuscript DOCX is missing its running header.".to_string());
    }

    let mut document_xml = String::new();
    archive
        .by_name("word/document.xml")
        .map_err(|error| format!("Failed to inspect DOCX document XML: {error}"))?
        .read_to_string(&mut document_xml)
        .map_err(|error| format!("DOCX document XML is unreadable: {error}"))?;
    if !document_xml.contains("<w:document") || !document_xml.contains("<w:sectPr") {
        return Err("DOCX document XML is structurally incomplete.".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::publishing::model::{
        BookContributor, BookMetadata, ContributorRole, ParagraphAlignment, TextDirection,
    };

    fn sample_document() -> BookDocument {
        let marks = InlineMarks {
            bold: true,
            italic: true,
            underline: true,
            strike: true,
        };
        BookDocument {
            metadata: BookMetadata {
                title: "The Unicode Book".to_string(),
                subtitle: Some("A Handoff".to_string()),
                contributors: vec![BookContributor {
                    name: "A. Writer".to_string(),
                    role: ContributorRole::Author,
                }],
                language: Some("en-US".to_string()),
                series: None,
            },
            sections: vec![BookSection {
                source_node_id: Some(1),
                role: SectionRole::Chapter,
                title: Some("Chapter One".to_string()),
                inclusion: SectionInclusion::AllFormats,
                blocks: vec![
                    Block::Paragraph {
                        inlines: vec![Inline::Text {
                            text: "Hello\n世界 — Привет".to_string(),
                            marks,
                            link: Some(crate::publishing::model::LinkTarget(
                                "https://example.com".to_string(),
                            )),
                        }],
                        style: ParagraphStyle {
                            alignment: ParagraphAlignment::Start,
                            indent_level: 0,
                            direction: TextDirection::Auto,
                        },
                    },
                    Block::OrderedList {
                        items: vec![ListItem {
                            blocks: vec![
                                Block::Paragraph {
                                    inlines: vec![Inline::Text {
                                        text: "One".to_string(),
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
                                },
                                Block::BulletList {
                                    items: vec![ListItem {
                                        blocks: vec![Block::Paragraph {
                                            inlines: vec![Inline::Text {
                                                text: "Nested".to_string(),
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
                                        }],
                                    }],
                                },
                            ],
                        }],
                    },
                    Block::SceneBreak {
                        style: SceneBreakStyle::Asterisks,
                    },
                ],
                children: vec![
                    BookSection {
                        source_node_id: Some(2),
                        role: SectionRole::Scene,
                        title: Some("Visible only in handoff".to_string()),
                        inclusion: SectionInclusion::AllFormats,
                        blocks: vec![],
                        children: vec![],
                    },
                    BookSection {
                        source_node_id: Some(3),
                        role: SectionRole::Scene,
                        title: Some("Second scene".to_string()),
                        inclusion: SectionInclusion::AllFormats,
                        blocks: vec![],
                        children: vec![],
                    },
                ],
            }],
            assets: vec![],
        }
    }

    fn options(profile: DocxProfileId) -> DocxRenderOptions {
        DocxRenderOptions {
            profile,
            author: "A. Writer".to_string(),
            contact: ContactInformation {
                author_name: "A. Writer".to_string(),
                email: "writer@example.com".to_string(),
                phone: "555-0100".to_string(),
                mailing_address: "1 Main Street".to_string(),
                header_surname: "Writer".to_string(),
                short_title: "Unicode".to_string(),
            },
        }
    }

    fn zip_part(path: &Path, name: &str) -> String {
        let file = File::open(path).unwrap();
        let mut archive = zip::ZipArchive::new(file).unwrap();
        let mut contents = String::new();
        archive
            .by_name(name)
            .unwrap()
            .read_to_string(&mut contents)
            .unwrap();
        contents
    }

    fn style_definition<'a>(styles: &'a str, style_id: &str) -> &'a str {
        let marker = format!("w:styleId=\"{style_id}\"");
        let marker_start = styles.find(&marker).unwrap();
        let style_start = styles[..marker_start].rfind("<w:style").unwrap();
        let relative_end = styles[marker_start..].find("</w:style>").unwrap();
        let style_end = marker_start + relative_end + "</w:style>".len();
        &styles[style_start..style_end]
    }

    #[test]
    fn standard_manuscript_has_header_numbering_marks_and_hidden_scene_titles() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("standard.docx");
        render_docx(
            &sample_document(),
            &options(DocxProfileId::StandardManuscript),
            &path,
        )
        .unwrap();

        let document = zip_part(&path, "word/document.xml");
        let styles = zip_part(&path, "word/styles.xml");
        let numbering = zip_part(&path, "word/numbering.xml");
        let header = zip_part(&path, "word/header1.xml");
        let relationships = zip_part(&path, "word/_rels/document.xml.rels");
        let properties = zip_part(&path, "docProps/custom.xml");

        assert!(document.contains("Hello"));
        assert!(document.contains("世界"));
        assert!(document.contains("<w:br"));
        assert!(document.contains("<w:b"));
        assert!(document.contains("<w:i"));
        assert!(document.contains("<w:strike"));
        assert!(document.contains("w:pgSz w:w=\"12240\" w:h=\"15840\""));
        assert!(document.contains("w:pgMar w:top=\"1440\""));
        assert!(document.contains("w:pgNumType w:start=\"1\""));
        assert!(!document.contains("Visible only in handoff"));
        assert!(document.contains("#"));
        assert!(!document.contains("* * *"));
        assert!(document.contains(STYLE_SCENE_BREAK));
        assert!(document.contains("w:pStyle w:val=\"WMContact\""));
        assert!(document.contains("w:pStyle w:val=\"WMByline\""));
        assert!(styles.contains("Times New Roman"));
        assert!(styles.contains("w:line=\"480\""));
        assert!(numbering.contains("w:numFmt w:val=\"decimal\""));
        assert!(numbering.contains("w:numFmt w:val=\"bullet\""));
        assert!(header.contains("Writer / Unicode /"));
        assert!(header.contains("PAGE"));
        assert!(
            relationships.contains("hyperlink"),
            "relationships were {relationships}"
        );
        assert!(
            relationships.contains("https://example.com"),
            "relationships were {relationships}"
        );
        assert!(properties.contains("The Unicode Book"));
        assert!(properties.contains("standard_manuscript"));

        let contact_style = style_definition(&styles, STYLE_CONTACT);
        assert!(!contact_style.contains("<w:ind"));
        let byline_style = style_definition(&styles, STYLE_BYLINE);
        assert!(byline_style.contains("w:jc w:val=\"center\""));
        assert!(!byline_style.contains("<w:ind"));
    }

    #[test]
    fn clean_handoff_uses_named_styles_and_visible_scene_titles() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("handoff.docx");
        render_docx(
            &sample_document(),
            &options(DocxProfileId::CleanHandoff),
            &path,
        )
        .unwrap();

        let document = zip_part(&path, "word/document.xml");
        let styles = zip_part(&path, "word/styles.xml");
        assert!(document.contains("Visible only in handoff"));
        assert!(document.contains("* * *"));
        assert!(document.contains("WMScene"));
        assert!(document.contains(STYLE_SCENE_BREAK));
        assert!(document.contains("w:pStyle w:val=\"WMByline\""));
        assert!(styles.contains("WM Scene Break"));
        assert!(styles.contains("WM Byline"));
        assert!(styles.contains("WM Body"));
        assert!(styles.contains("w:line=\"240\""));
        assert!(styles.contains("w:after=\"120\""));
    }
}
