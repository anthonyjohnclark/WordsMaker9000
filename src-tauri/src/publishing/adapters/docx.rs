use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};

use docx_rs::{
    AbstractNumbering, AlignmentType, BreakType, Docx, Header, Hyperlink, HyperlinkType,
    IndentLevel, Level, LevelJc, LevelText, LineSpacing, LineSpacingType, NumberFormat, Numbering,
    NumberingId, PageMargin, PageNum, PageNumType, PageSize, Paragraph, Pic, Run, RunFonts,
    Section, SpecialIndentType, Start, Style, StyleType,
};

use crate::publishing::model::{
    AssetSource, Block, BookDocument, BookSection, HeadingLevel, ImagePresentation, Inline,
    InlineMarks, ListItem, OutputFormat, ParagraphAlignment, ParagraphStyle, SceneBreakStyle,
    SectionInclusion, SectionRole, TextDirection,
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
const STYLE_CAPTION: &str = "WMCaption";
const STYLE_QUOTE: &str = "WMQuote";
const STYLE_LIST: &str = "WMList";
const STYLE_HEADING_1: &str = "WMHeading1";
const STYLE_HEADING_2: &str = "WMHeading2";
const STYLE_HEADING_3: &str = "WMHeading3";
const STYLE_HEADING_4: &str = "WMHeading4";
const STYLE_HEADING_5: &str = "WMHeading5";
const STYLE_HEADING_6: &str = "WMHeading6";

#[derive(Debug, Clone)]
pub(crate) struct DocxRenderOptions {
    pub profile: DocxProfileId,
    pub author: String,
    pub contact: ContactInformation,
    pub project_root: PathBuf,
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
    finalize_docx_package(
        output_path,
        &document.metadata.title,
        &options.author,
        &image_descriptions(document),
    )?;
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
    let mut state = RenderState::new(DocxProfileId::StandardManuscript, document, options);
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
    let mut state = RenderState::new(DocxProfileId::CleanHandoff, document, options);
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
    asset_paths: HashMap<String, String>,
    project_root: PathBuf,
}

impl RenderState {
    fn new(profile: DocxProfileId, document: &BookDocument, options: &DocxRenderOptions) -> Self {
        let asset_paths = document
            .assets
            .iter()
            .map(|asset| {
                let path = match &asset.source {
                    AssetSource::ProjectRelativePath { path } => path.clone(),
                };
                (asset.id.0.clone(), path)
            })
            .collect();
        Self {
            profile,
            paragraphs: Vec::new(),
            content_started: false,
            asset_paths,
            project_root: options.project_root.clone(),
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
                Block::Image {
                    asset_id,
                    caption,
                    presentation,
                    ..
                } => self.render_image(&asset_id.0, caption.as_deref(), presentation)?,
                Block::FootnoteDefinition { .. } => return Err(
                    "DOCX rendering reached a footnote that should have been blocked by preflight."
                        .to_string(),
                ),
            }
        }
        Ok(())
    }

    fn render_image(
        &mut self,
        asset_id: &str,
        caption: Option<&[Inline]>,
        presentation: &ImagePresentation,
    ) -> Result<(), String> {
        if *presentation == ImagePresentation::Bleed {
            return Err(format!(
                "DOCX cannot render bleed image asset {asset_id:?}."
            ));
        }
        let relative = self
            .asset_paths
            .get(asset_id)
            .ok_or_else(|| format!("DOCX image references missing asset {asset_id:?}."))?;
        let relative_path = Path::new(relative);
        if relative_path.is_absolute()
            || relative_path.as_os_str().is_empty()
            || relative_path
                .components()
                .any(|component| !matches!(component, Component::Normal(_)))
        {
            return Err(format!("DOCX image asset {asset_id:?} has an unsafe path."));
        }
        let path = self.project_root.join(relative_path);
        let bytes = std::fs::read(&path)
            .map_err(|error| format!("Failed to read DOCX image {}: {error}", path.display()))?;
        let mut picture = std::panic::catch_unwind(|| Pic::new(&bytes))
            .map_err(|_| format!("DOCX could not decode image asset {asset_id:?}."))?;
        let (source_width, source_height) = picture.size;
        let maximum_width = match presentation {
            ImagePresentation::Block => 4_572_000,
            ImagePresentation::FullWidth => 5_943_600,
            ImagePresentation::Bleed => unreachable!(),
        };
        if source_width > 0 && source_height > 0 {
            let width = match presentation {
                ImagePresentation::FullWidth => maximum_width,
                ImagePresentation::Block => source_width.min(maximum_width),
                ImagePresentation::Bleed => unreachable!(),
            };
            let height =
                ((u64::from(source_height) * u64::from(width)) / u64::from(source_width)) as u32;
            picture = picture.size(width, height.max(1));
        }
        self.push(
            Paragraph::new()
                .style(STYLE_BODY)
                .align(AlignmentType::Center)
                .add_run(Run::new().add_image(picture)),
        );
        if let Some(caption) = caption {
            self.push(add_inlines(
                Paragraph::new()
                    .style(STYLE_CAPTION)
                    .align(AlignmentType::Center),
                caption,
            )?);
        }
        self.content_started = true;
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
    let right_to_left = style.direction == TextDirection::RightToLeft;
    let mut paragraph =
        Paragraph::new()
            .style(STYLE_BODY)
            .align(match (&style.alignment, &style.direction) {
                (ParagraphAlignment::Center, _) => AlignmentType::Center,
                (ParagraphAlignment::Start, TextDirection::RightToLeft) => AlignmentType::Right,
                (ParagraphAlignment::End, TextDirection::RightToLeft) => AlignmentType::Left,
                (ParagraphAlignment::Start, _) => AlignmentType::Left,
                (ParagraphAlignment::End, _) => AlignmentType::Right,
                (ParagraphAlignment::Justify, _) => AlignmentType::Both,
            });
    if right_to_left {
        paragraph.property = paragraph.property.bidi(true);
    }
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
        Style::new(STYLE_CAPTION, StyleType::Paragraph)
            .name("WM Caption")
            .fonts(fonts.clone())
            .size(20)
            .italic()
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
        authored_heading_style(STYLE_HEADING_1, "WM Heading 1", 32, 0),
        authored_heading_style(STYLE_HEADING_2, "WM Heading 2", 30, 1),
        authored_heading_style(STYLE_HEADING_3, "WM Heading 3", 28, 2),
        authored_heading_style(STYLE_HEADING_4, "WM Heading 4", 26, 3),
        authored_heading_style(STYLE_HEADING_5, "WM Heading 5", 24, 4),
        authored_heading_style(STYLE_HEADING_6, "WM Heading 6", 24, 5),
    ]
}

fn authored_heading_style(
    id: &'static str,
    name: &'static str,
    size: usize,
    outline_level: usize,
) -> Style {
    Style::new(id, StyleType::Paragraph)
        .name(name)
        .fonts(manuscript_fonts())
        .size(size)
        .bold()
        .outline_lvl(outline_level)
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
        HeadingLevel::H1 => STYLE_HEADING_1,
        HeadingLevel::H2 => STYLE_HEADING_2,
        HeadingLevel::H3 => STYLE_HEADING_3,
        HeadingLevel::H4 => STYLE_HEADING_4,
        HeadingLevel::H5 => STYLE_HEADING_5,
        HeadingLevel::H6 => STYLE_HEADING_6,
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
    let mut lines = Vec::new();
    lines.extend(non_empty_lines(&contact.author_name));
    lines.extend(non_empty_lines(&contact.mailing_address));
    lines.extend(non_empty_lines(&contact.email));
    lines.extend(non_empty_lines(&contact.phone));
    lines
}

fn non_empty_lines(value: &str) -> impl Iterator<Item = String> + '_ {
    value
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToString::to_string)
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

fn finalize_docx_package(
    path: &Path,
    title: &str,
    author: &str,
    image_descriptions: &[Option<String>],
) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "DOCX output path has no parent directory.".to_string())?;
    let mut replacement = tempfile::NamedTempFile::new_in(parent)
        .map_err(|error| format!("Failed to prepare DOCX metadata update: {error}"))?;
    let created_at = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
    let core_xml = format!(
        concat!(
            "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>",
            "<cp:coreProperties ",
            "xmlns:cp=\"http://schemas.openxmlformats.org/package/2006/metadata/core-properties\" ",
            "xmlns:dc=\"http://purl.org/dc/elements/1.1/\" ",
            "xmlns:dcterms=\"http://purl.org/dc/terms/\" ",
            "xmlns:dcmitype=\"http://purl.org/dc/dcmitype/\" ",
            "xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\">",
            "<dcterms:created xsi:type=\"dcterms:W3CDTF\">{created_at}</dcterms:created>",
            "<dc:creator>{author}</dc:creator>",
            "<cp:lastModifiedBy>{author}</cp:lastModifiedBy>",
            "<dcterms:modified xsi:type=\"dcterms:W3CDTF\">{created_at}</dcterms:modified>",
            "<cp:revision>1</cp:revision>",
            "<dc:title>{title}</dc:title>",
            "</cp:coreProperties>"
        ),
        created_at = created_at,
        author = xml_text(author),
        title = xml_text(title),
    );

    {
        let source = File::open(path)
            .map_err(|error| format!("Failed to reopen DOCX for metadata update: {error}"))?;
        let mut archive = zip::ZipArchive::new(source)
            .map_err(|error| format!("DOCX is not a valid ZIP: {error}"))?;
        let mut writer = zip::ZipWriter::new(replacement.as_file_mut());
        let mut replaced_core = false;

        for index in 0..archive.len() {
            let entry = archive
                .by_index(index)
                .map_err(|error| format!("Failed to read DOCX package entry: {error}"))?;
            if entry.name() == "docProps/core.xml" {
                writer
                    .start_file(
                        "docProps/core.xml",
                        zip::write::SimpleFileOptions::default()
                            .compression_method(zip::CompressionMethod::Deflated),
                    )
                    .map_err(|error| format!("Failed to write DOCX core properties: {error}"))?;
                writer
                    .write_all(core_xml.as_bytes())
                    .map_err(|error| format!("Failed to write DOCX core properties: {error}"))?;
                replaced_core = true;
            } else if entry.name() == "word/document.xml" {
                let mut document_xml = String::new();
                let mut entry = entry;
                entry
                    .read_to_string(&mut document_xml)
                    .map_err(|error| format!("Failed to read DOCX document XML: {error}"))?;
                let document_xml = add_rtl_run_properties(&document_xml);
                let document_xml = add_image_descriptions(&document_xml, image_descriptions)?;
                writer
                    .start_file(
                        "word/document.xml",
                        zip::write::SimpleFileOptions::default()
                            .compression_method(zip::CompressionMethod::Deflated),
                    )
                    .map_err(|error| format!("Failed to update DOCX RTL semantics: {error}"))?;
                writer
                    .write_all(document_xml.as_bytes())
                    .map_err(|error| format!("Failed to update DOCX RTL semantics: {error}"))?;
            } else {
                writer
                    .raw_copy_file(entry)
                    .map_err(|error| format!("Failed to copy DOCX package entry: {error}"))?;
            }
        }
        if !replaced_core {
            return Err("DOCX package is missing docProps/core.xml.".to_string());
        }
        writer
            .finish()
            .map_err(|error| format!("Failed to finish DOCX metadata update: {error}"))?;
    }

    replacement
        .as_file_mut()
        .sync_all()
        .map_err(|error| format!("Failed to flush DOCX metadata update: {error}"))?;
    std::fs::copy(replacement.path(), path)
        .map_err(|error| format!("Failed to install DOCX metadata update: {error}"))?;
    Ok(())
}

fn image_descriptions(document: &BookDocument) -> Vec<Option<String>> {
    fn collect_blocks(blocks: &[Block], descriptions: &mut Vec<Option<String>>) {
        for block in blocks {
            match block {
                Block::Image {
                    alt, decorative, ..
                } => descriptions.push(if *decorative {
                    None
                } else {
                    Some(alt.clone().unwrap_or_default())
                }),
                Block::OrderedList { items } | Block::BulletList { items } => {
                    for item in items {
                        collect_blocks(&item.blocks, descriptions);
                    }
                }
                Block::BlockQuote { blocks } | Block::FootnoteDefinition { blocks, .. } => {
                    collect_blocks(blocks, descriptions);
                }
                _ => {}
            }
        }
    }
    fn collect_sections(sections: &[BookSection], descriptions: &mut Vec<Option<String>>) {
        for section in sections {
            if section_included(section) {
                collect_blocks(&section.blocks, descriptions);
            }
            collect_sections(&section.children, descriptions);
        }
    }

    let mut descriptions = Vec::new();
    collect_sections(&document.sections, &mut descriptions);
    descriptions
}

fn add_image_descriptions(
    document_xml: &str,
    descriptions: &[Option<String>],
) -> Result<String, String> {
    let mut updated = String::with_capacity(document_xml.len() + descriptions.len() * 32);
    let mut remaining = document_xml;
    for description in descriptions {
        let Some(start) = remaining.find("<wp:docPr") else {
            return Err("DOCX image metadata count does not match rendered images.".to_string());
        };
        updated.push_str(&remaining[..start]);
        let element = &remaining[start..];
        let end = element
            .find('>')
            .ok_or_else(|| "DOCX image metadata element is malformed.".to_string())?;
        let (opening, rest) = element.split_at(end);
        let (opening, self_closing) = opening
            .strip_suffix('/')
            .map(|value| (value, true))
            .unwrap_or((opening, false));
        updated.push_str(opening);
        updated.push_str(" descr=\"");
        updated.push_str(&xml_attr(description.as_deref().unwrap_or_default()));
        updated.push_str("\"");
        if description.is_none() {
            if !self_closing {
                return Err(
                    "DOCX decorative image metadata element is not self-closing.".to_string(),
                );
            }
            updated.push_str("><a:extLst><a:ext uri=\"{C183D7F6-B498-43B3-948B-1728B52AA6E4}\"><adec:decorative xmlns:adec=\"http://schemas.microsoft.com/office/drawing/2017/decorative\" val=\"1\" /></a:ext></a:extLst></wp:docPr>");
            remaining = &rest[1..];
            continue;
        } else if self_closing {
            updated.push('/');
        }
        remaining = rest;
    }
    updated.push_str(remaining);
    Ok(updated)
}

fn add_rtl_run_properties(document_xml: &str) -> String {
    let mut updated = String::with_capacity(document_xml.len());
    let mut remaining = document_xml;

    while let Some(paragraph_start) = remaining.find("<w:p") {
        updated.push_str(&remaining[..paragraph_start]);
        let paragraph = &remaining[paragraph_start..];
        let Some(relative_end) = paragraph.find("</w:p>") else {
            updated.push_str(paragraph);
            return updated;
        };
        let paragraph_end = relative_end + "</w:p>".len();
        let paragraph = &paragraph[..paragraph_end];
        if paragraph.contains("<w:bidi") {
            updated.push_str(
                &paragraph
                    .replace("<w:rPr>", "<w:rPr><w:rtl />")
                    .replace("<w:rPr />", "<w:rPr><w:rtl /></w:rPr>"),
            );
        } else {
            updated.push_str(paragraph);
        }
        remaining = &remaining[paragraph_end..];
    }
    updated.push_str(remaining);
    updated
}

fn xml_text(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn xml_attr(value: &str) -> String {
    xml_text(value)
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
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
        "docProps/core.xml",
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
    use crate::publishing::html::parse_quill_html;
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
                ..BookMetadata::default()
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
                    Block::Paragraph {
                        inlines: vec![Inline::Text {
                            text: "עברית".to_string(),
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
                            direction: TextDirection::RightToLeft,
                        },
                    },
                    Block::Heading {
                        level: HeadingLevel::H1,
                        inlines: vec![Inline::Text {
                            text: "Heading One".to_string(),
                            marks: InlineMarks {
                                bold: false,
                                italic: false,
                                underline: false,
                                strike: false,
                            },
                            link: None,
                        }],
                    },
                    Block::Heading {
                        level: HeadingLevel::H6,
                        inlines: vec![Inline::Text {
                            text: "Heading Six".to_string(),
                            marks: InlineMarks {
                                bold: false,
                                italic: false,
                                underline: false,
                                strike: false,
                            },
                            link: None,
                        }],
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
                mailing_address: "1 Main Street\nSecond Floor".to_string(),
                header_surname: "Writer".to_string(),
                short_title: "Unicode".to_string(),
            },
            project_root: PathBuf::new(),
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
    fn embeds_project_images_with_dimensions_caption_and_ooxml_alt_text() {
        let root = tempfile::tempdir().unwrap();
        let assets = root.path().join("assets");
        std::fs::create_dir_all(&assets).unwrap();
        image::DynamicImage::new_rgb8(1200, 800)
            .save(assets.join("figure.png"))
            .unwrap();
        let mut document = sample_document();
        document.assets.push(crate::publishing::model::BookAsset {
            id: crate::publishing::model::AssetId("asset-figure".to_string()),
            kind: crate::publishing::model::AssetKind::Image,
            media_type: "image/png".to_string(),
            source: AssetSource::ProjectRelativePath {
                path: "assets/figure.png".to_string(),
            },
        });
        document.sections[0].blocks.push(Block::Image {
            asset_id: crate::publishing::model::AssetId("asset-figure".to_string()),
            alt: Some("Moonlit water & reeds".to_string()),
            caption: Some(vec![Inline::Text {
                text: "Night study".to_string(),
                marks: InlineMarks::default(),
                link: None,
            }]),
            decorative: false,
            presentation: ImagePresentation::FullWidth,
        });
        document.sections[0].blocks.push(Block::Image {
            asset_id: crate::publishing::model::AssetId("asset-figure".to_string()),
            alt: None,
            caption: None,
            decorative: true,
            presentation: ImagePresentation::Block,
        });
        let output = root.path().join("image.docx");
        let mut render_options = options(DocxProfileId::CleanHandoff);
        render_options.project_root = root.path().to_path_buf();

        render_docx(&document, &render_options, &output).unwrap();

        let document_xml = zip_part(&output, "word/document.xml");
        let relationships = zip_part(&output, "word/_rels/document.xml.rels");
        assert!(document_xml.contains("<w:drawing>"));
        assert!(document_xml.contains("descr=\"Moonlit water &amp; reeds\""));
        assert!(document_xml.contains("adec:decorative"));
        assert!(document_xml.contains("Night study"));
        assert!(relationships.contains("relationships/image"));
        let file = File::open(&output).unwrap();
        let archive = zip::ZipArchive::new(file).unwrap();
        assert!(archive
            .file_names()
            .any(|name| name.starts_with("word/media/")));
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
        let core_properties = zip_part(&path, "docProps/core.xml");

        assert!(document.contains("Hello"));
        assert!(document.contains("世界"));
        assert!(document.contains("<w:br"));
        assert!(document.contains("<w:b"));
        assert!(document.contains("<w:i"));
        assert!(document.contains("<w:strike"));
        assert!(document.contains("<w:bidi"));
        assert!(document.contains("<w:rtl"));
        assert!(document.contains("w:pStyle w:val=\"WMHeading1\""));
        assert!(document.contains("w:pStyle w:val=\"WMHeading6\""));
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
        assert!(core_properties.contains("<dc:title>The Unicode Book</dc:title>"));
        assert!(core_properties.contains("<dc:creator>A. Writer</dc:creator>"));
        assert_eq!(
            contact_lines(&options(DocxProfileId::StandardManuscript).contact),
            vec![
                "A. Writer",
                "1 Main Street",
                "Second Floor",
                "writer@example.com",
                "555-0100"
            ]
        );

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
        assert!(styles.contains("WM Heading 1"));
        assert!(styles.contains("WM Heading 6"));
        assert!(styles.contains("w:line=\"240\""));
        assert!(styles.contains("w:after=\"120\""));
    }

    #[test]
    fn rich_editor_fixture_keeps_headings_quotes_links_and_scene_order() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("rich-editor.docx");
        let mut document = sample_document();
        document.sections[0].blocks =
            parse_quill_html(include_str!("../fixtures/quill/rich_content.html")).unwrap();

        render_docx(&document, &options(DocxProfileId::CleanHandoff), &path).unwrap();

        let document_xml = zip_part(&path, "word/document.xml");
        let relationships = zip_part(&path, "word/_rels/document.xml.rels");
        for level in 1..=6 {
            assert!(document_xml.contains(&format!("w:pStyle w:val=\"WMHeading{level}\"")));
        }
        assert!(document_xml.contains("<w:b"));
        assert!(document_xml.contains("w:pStyle w:val=\"WMQuote\""));
        assert!(relationships.contains("https://example.com/heading"));
        assert!(relationships.contains("https://example.com/quote"));

        let before = document_xml.find("First scene.").unwrap();
        let marker = document_xml.find("* * *").unwrap();
        let after = document_xml.find("Second scene.").unwrap();
        assert!(before < marker && marker < after);
    }

    #[test]
    fn authored_heading_levels_have_distinct_named_styles() {
        assert_eq!(heading_style(&HeadingLevel::H1), STYLE_HEADING_1);
        assert_eq!(heading_style(&HeadingLevel::H2), STYLE_HEADING_2);
        assert_eq!(heading_style(&HeadingLevel::H3), STYLE_HEADING_3);
        assert_eq!(heading_style(&HeadingLevel::H4), STYLE_HEADING_4);
        assert_eq!(heading_style(&HeadingLevel::H5), STYLE_HEADING_5);
        assert_eq!(heading_style(&HeadingLevel::H6), STYLE_HEADING_6);
    }
}
