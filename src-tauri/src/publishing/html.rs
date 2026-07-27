use ego_tree::NodeRef;
use scraper::node::Node;
use scraper::Html;

use super::model::{
    Block, HeadingLevel, Inline, InlineMarks, LinkTarget, ListItem, ParagraphAlignment,
    ParagraphStyle, TextDirection,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ListKind {
    Ordered,
    Bullet,
}

#[derive(Debug)]
struct RawListItem {
    kind: ListKind,
    indent: u8,
    blocks: Vec<Block>,
}

#[derive(Debug, Clone)]
struct InlineState {
    marks: InlineMarks,
    link: Option<LinkTarget>,
}

impl Default for InlineState {
    fn default() -> Self {
        Self {
            marks: InlineMarks {
                bold: false,
                italic: false,
                underline: false,
                strike: false,
            },
            link: None,
        }
    }
}

pub(crate) fn parse_quill_html(html: &str) -> Result<Vec<Block>, String> {
    if html.trim().is_empty() {
        return Ok(vec![]);
    }

    let document = Html::parse_fragment(html);
    let mut blocks = Vec::new();

    for child in document.root_element().children() {
        parse_top_level_node(child, &mut blocks)?;
    }

    Ok(blocks)
}

fn parse_top_level_node(node: NodeRef<'_, Node>, blocks: &mut Vec<Block>) -> Result<(), String> {
    match node.value() {
        Node::Text(text) => {
            if !text.text.trim().is_empty() {
                blocks.push(Block::Paragraph {
                    inlines: vec![plain_text(text.text.as_ref())],
                    style: default_paragraph_style(),
                });
            }
        }
        Node::Element(element) => match element.name() {
            "p" | "div" => blocks.push(parse_paragraph(node)?),
            "h1" | "h2" | "h3" | "h4" | "h5" | "h6" => blocks.push(parse_heading(node)?),
            "ol" | "ul" => blocks.extend(parse_list(node)?),
            "blockquote" => blocks.push(parse_block_quote(node)?),
            "br" => blocks.push(Block::Paragraph {
                inlines: vec![plain_text("\n")],
                style: default_paragraph_style(),
            }),
            tag => {
                return Err(format!(
                    "Unsupported Quill block element <{tag}>; export would omit content"
                ))
            }
        },
        _ => {}
    }

    Ok(())
}

fn parse_paragraph(node: NodeRef<'_, Node>) -> Result<Block, String> {
    Ok(Block::Paragraph {
        inlines: extract_inlines(node)?,
        style: paragraph_style(node)?,
    })
}

fn parse_heading(node: NodeRef<'_, Node>) -> Result<Block, String> {
    let level = match element_name(node) {
        Some("h1") => HeadingLevel::H1,
        Some("h2") => HeadingLevel::H2,
        Some("h3") => HeadingLevel::H3,
        Some("h4") => HeadingLevel::H4,
        Some("h5") => HeadingLevel::H5,
        Some("h6") => HeadingLevel::H6,
        _ => return Err("Expected a Quill heading element".to_string()),
    };

    Ok(Block::Heading {
        level,
        inlines: extract_inlines(node)?,
    })
}

fn parse_block_quote(node: NodeRef<'_, Node>) -> Result<Block, String> {
    let has_block_children = node.children().any(|child| {
        matches!(
            element_name(child),
            Some(
                "p" | "div" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "ol" | "ul" | "blockquote"
            )
        )
    });

    let blocks = if has_block_children {
        let mut nested = Vec::new();
        for child in node.children() {
            parse_top_level_node(child, &mut nested)?;
        }
        nested
    } else {
        vec![Block::Paragraph {
            inlines: extract_inlines(node)?,
            style: paragraph_style(node)?,
        }]
    };

    Ok(Block::BlockQuote { blocks })
}

fn parse_list(node: NodeRef<'_, Node>) -> Result<Vec<Block>, String> {
    let default_kind = match element_name(node) {
        Some("ol") => ListKind::Ordered,
        Some("ul") => ListKind::Bullet,
        _ => return Err("Expected a Quill list element".to_string()),
    };
    let mut items = Vec::new();

    for child in node.children() {
        if element_name(child) != Some("li") {
            if let Node::Text(text) = child.value() {
                if text.text.trim().is_empty() {
                    continue;
                }
            }
            return Err("Quill list contains content outside a list item".to_string());
        }

        let element = match child.value() {
            Node::Element(element) => element,
            _ => unreachable!("element_name matched a list item"),
        };
        let kind = match element.attr("data-list") {
            Some("ordered") => ListKind::Ordered,
            Some("bullet") => ListKind::Bullet,
            Some(other) => {
                return Err(format!(
                    "Unsupported Quill list type \"{other}\"; export would omit content"
                ))
            }
            None => default_kind,
        };
        let indent = indent_level(element.attr("class"))?;
        let mut blocks = vec![Block::Paragraph {
            inlines: extract_inlines_excluding_lists(child)?,
            style: default_paragraph_style(),
        }];

        for nested in child
            .children()
            .filter(|nested| matches!(element_name(*nested), Some("ol" | "ul")))
        {
            blocks.extend(parse_list(nested)?);
        }

        items.push(RawListItem {
            kind,
            indent,
            blocks,
        });
    }

    if items.is_empty() {
        return Ok(vec![]);
    }

    let mut index = 0;
    let base_indent = items[0].indent;
    build_list_level(&items, &mut index, base_indent)
}

fn build_list_level(
    raw_items: &[RawListItem],
    index: &mut usize,
    level: u8,
) -> Result<Vec<Block>, String> {
    let mut blocks = Vec::new();

    while *index < raw_items.len() {
        let raw = &raw_items[*index];
        if raw.indent < level {
            break;
        }

        if raw.indent > level {
            let nested_level = raw.indent;
            let nested = build_list_level(raw_items, index, nested_level)?;
            let parent = last_list_item_mut(&mut blocks).ok_or_else(|| {
                "Quill list begins a nested level before its parent item".to_string()
            })?;
            parent.blocks.extend(nested);
            continue;
        }

        let item = ListItem {
            blocks: raw.blocks.clone(),
        };
        match (blocks.last_mut(), raw.kind) {
            (Some(Block::OrderedList { items }), ListKind::Ordered)
            | (Some(Block::BulletList { items }), ListKind::Bullet) => items.push(item),
            (_, ListKind::Ordered) => blocks.push(Block::OrderedList { items: vec![item] }),
            (_, ListKind::Bullet) => blocks.push(Block::BulletList { items: vec![item] }),
        }
        *index += 1;
    }

    Ok(blocks)
}

fn last_list_item_mut(blocks: &mut [Block]) -> Option<&mut ListItem> {
    match blocks.last_mut()? {
        Block::OrderedList { items } | Block::BulletList { items } => items.last_mut(),
        _ => None,
    }
}

fn extract_inlines(node: NodeRef<'_, Node>) -> Result<Vec<Inline>, String> {
    let mut inlines = Vec::new();
    let state = InlineState::default();
    extract_inline_children(node, &state, false, &mut inlines)?;
    Ok(inlines)
}

fn extract_inlines_excluding_lists(node: NodeRef<'_, Node>) -> Result<Vec<Inline>, String> {
    let mut inlines = Vec::new();
    let state = InlineState::default();
    extract_inline_children(node, &state, true, &mut inlines)?;
    Ok(inlines)
}

fn extract_inline_children(
    node: NodeRef<'_, Node>,
    state: &InlineState,
    exclude_lists: bool,
    inlines: &mut Vec<Inline>,
) -> Result<(), String> {
    for child in node.children() {
        match child.value() {
            Node::Text(text) => append_text(inlines, text.text.as_ref(), state),
            Node::Element(element) => {
                let tag = element.name();
                if exclude_lists && matches!(tag, "ol" | "ul") {
                    continue;
                }
                if tag == "span"
                    && element
                        .attr("class")
                        .is_some_and(|classes| classes.split_whitespace().any(|c| c == "ql-ui"))
                {
                    continue;
                }

                let mut next = state.clone();
                match tag {
                    "strong" | "b" => next.marks.bold = true,
                    "em" | "i" => next.marks.italic = true,
                    "u" => next.marks.underline = true,
                    "s" | "del" | "strike" => next.marks.strike = true,
                    "a" => {
                        let href = element.attr("href").ok_or_else(|| {
                            "Quill link has no href; export would lose its target".to_string()
                        })?;
                        next.link = Some(LinkTarget(href.to_string()));
                    }
                    "br" => {
                        append_text(inlines, "\n", state);
                        continue;
                    }
                    "span" => {}
                    "ol" | "ul" => {
                        return Err("Unexpected nested list in inline content".to_string())
                    }
                    other => {
                        return Err(format!(
                            "Unsupported Quill inline element <{other}>; export would omit content"
                        ))
                    }
                }
                extract_inline_children(child, &next, exclude_lists, inlines)?;
            }
            _ => {}
        }
    }

    Ok(())
}

fn append_text(inlines: &mut Vec<Inline>, text: &str, state: &InlineState) {
    if text.is_empty() {
        return;
    }

    inlines.push(Inline::Text {
        text: text.to_string(),
        marks: state.marks.clone(),
        link: state.link.clone(),
    });
}

fn paragraph_style(node: NodeRef<'_, Node>) -> Result<ParagraphStyle, String> {
    let element = match node.value() {
        Node::Element(element) => element,
        _ => return Ok(default_paragraph_style()),
    };
    let classes = element.attr("class").unwrap_or_default();
    let alignment = if has_class(classes, "ql-align-center") {
        ParagraphAlignment::Center
    } else if has_class(classes, "ql-align-right") {
        ParagraphAlignment::End
    } else if has_class(classes, "ql-align-justify") {
        ParagraphAlignment::Justify
    } else {
        ParagraphAlignment::Start
    };
    let direction = if has_class(classes, "ql-direction-rtl") || element.attr("dir") == Some("rtl")
    {
        TextDirection::RightToLeft
    } else if element.attr("dir") == Some("ltr") {
        TextDirection::LeftToRight
    } else {
        TextDirection::Auto
    };

    Ok(ParagraphStyle {
        alignment,
        indent_level: indent_level(Some(classes))?,
        direction,
    })
}

fn indent_level(classes: Option<&str>) -> Result<u8, String> {
    let Some(indent_class) = classes
        .unwrap_or_default()
        .split_whitespace()
        .find(|class| class.starts_with("ql-indent-"))
    else {
        return Ok(0);
    };
    let value = indent_class
        .trim_start_matches("ql-indent-")
        .parse::<u8>()
        .map_err(|_| format!("Invalid Quill indentation class \"{indent_class}\""))?;
    Ok(value)
}

fn has_class(classes: &str, expected: &str) -> bool {
    classes.split_whitespace().any(|class| class == expected)
}

fn element_name(node: NodeRef<'_, Node>) -> Option<&str> {
    match node.value() {
        Node::Element(element) => Some(element.name()),
        _ => None,
    }
}

fn default_paragraph_style() -> ParagraphStyle {
    ParagraphStyle {
        alignment: ParagraphAlignment::Start,
        indent_level: 0,
        direction: TextDirection::Auto,
    }
}

fn plain_text(text: &str) -> Inline {
    Inline::Text {
        text: text.to_string(),
        marks: InlineState::default().marks,
        link: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text<'a>(inline: &'a Inline) -> (&'a str, &'a InlineMarks, Option<&'a str>) {
        match inline {
            Inline::Text { text, marks, link } => {
                (text, marks, link.as_ref().map(|target| target.0.as_str()))
            }
            Inline::FootnoteReference { .. } => panic!("expected text inline"),
        }
    }

    fn paragraph(block: &Block) -> (&[Inline], &ParagraphStyle) {
        match block {
            Block::Paragraph { inlines, style } => (inlines, style),
            _ => panic!("expected paragraph"),
        }
    }

    #[test]
    fn parses_current_toolbar_inline_formats_and_unicode_fixture() {
        let blocks = parse_quill_html(include_str!("fixtures/quill/current_toolbar.html")).unwrap();

        assert_eq!(blocks.len(), 2);
        let (inlines, _) = paragraph(&blocks[0]);
        assert_eq!(text(&inlines[0]).0, "Plain “smart” — café. ");
        assert_eq!(text(&inlines[1]).0, "Bold");
        assert!(text(&inlines[1]).1.bold);
        assert_eq!(text(&inlines[2]).0, " and ");
        assert!(text(&inlines[3]).1.italic);
        assert!(text(&inlines[5]).1.underline);
        assert!(text(&inlines[7]).1.strike);
        assert!(text(&inlines[9]).1.bold);
        assert!(text(&inlines[9]).1.italic);
        assert!(text(&inlines[9]).1.underline);
        assert!(text(&inlines[9]).1.strike);

        let (soft_break, _) = paragraph(&blocks[1]);
        assert_eq!(
            soft_break
                .iter()
                .map(|inline| text(inline).0)
                .collect::<Vec<_>>(),
            vec!["Before", "\n", "After"]
        );
    }

    #[test]
    fn parses_quill_two_ordered_bullet_and_nested_lists_in_source_order() {
        let blocks = parse_quill_html(include_str!("fixtures/quill/lists.html")).unwrap();

        assert_eq!(blocks.len(), 2);
        let ordered_items = match &blocks[0] {
            Block::OrderedList { items } => items,
            _ => panic!("expected ordered list"),
        };
        assert_eq!(ordered_items.len(), 2);
        assert_eq!(
            text(paragraph(&ordered_items[0].blocks[0]).0.first().unwrap()).0,
            "One"
        );
        assert_eq!(
            text(paragraph(&ordered_items[1].blocks[0]).0.first().unwrap()).0,
            "Two"
        );

        let nested = match &ordered_items[1].blocks[1] {
            Block::BulletList { items } => items,
            _ => panic!("expected nested bullet list"),
        };
        assert_eq!(
            text(paragraph(&nested[0].blocks[0]).0.first().unwrap()).0,
            "Nested A"
        );
        assert_eq!(
            text(paragraph(&nested[1].blocks[0]).0.first().unwrap()).0,
            "Nested B"
        );

        let trailing_bullets = match &blocks[1] {
            Block::BulletList { items } => items,
            _ => panic!("expected trailing bullet list"),
        };
        assert_eq!(trailing_bullets.len(), 1);
        assert_eq!(
            text(paragraph(&trailing_bullets[0].blocks[0]).0.first().unwrap()).0,
            "Final bullet"
        );
    }

    #[test]
    fn parses_paragraph_style_headings_quotes_and_links_without_html_in_the_ir() {
        let html = concat!(
            "<p class=\"ql-align-center ql-indent-2 ql-direction-rtl\">Centered</p>",
            "<h2>Heading</h2>",
            "<blockquote>Quoted <a href=\"https://example.com\">link</a></blockquote>"
        );
        let blocks = parse_quill_html(html).unwrap();

        let (_, style) = paragraph(&blocks[0]);
        assert_eq!(style.alignment, ParagraphAlignment::Center);
        assert_eq!(style.indent_level, 2);
        assert_eq!(style.direction, TextDirection::RightToLeft);
        assert!(matches!(
            blocks[1],
            Block::Heading {
                level: HeadingLevel::H2,
                ..
            }
        ));
        let quote = match &blocks[2] {
            Block::BlockQuote { blocks } => blocks,
            _ => panic!("expected block quote"),
        };
        let (quoted, _) = paragraph(&quote[0]);
        assert_eq!(text(&quoted[1]).2, Some("https://example.com"));
    }

    #[test]
    fn rejects_content_that_cannot_be_represented_instead_of_dropping_it() {
        let error = parse_quill_html("<table><tr><td>Lost</td></tr></table>").unwrap_err();
        assert!(error.contains("<table>"));
        assert!(error.contains("omit content"));

        let error = parse_quill_html(
            "<ol><li data-list=\"checked\"><span class=\"ql-ui\"></span>Done</li></ol>",
        )
        .unwrap_err();
        assert!(error.contains("checked"));
    }

    #[test]
    fn empty_html_is_an_empty_block_sequence() {
        assert!(parse_quill_html("").unwrap().is_empty());
    }
}
