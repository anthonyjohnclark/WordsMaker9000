use crate::export::types::{ExportFileNode, ExportPayload};
use ego_tree::NodeRef;
use scraper::node::Node;
use scraper::Html;
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct CompiledDocument {
    pub title: String,
    pub author: String,
    pub front_matter: Option<String>,
    pub back_matter: Option<String>,
    pub chapters: Vec<Chapter>,
}

#[derive(Debug, Clone)]
pub struct Chapter {
    pub title: String,
    pub sections: Vec<Section>,
}

#[derive(Debug, Clone)]
pub struct Section {
    pub title: String,
    pub elements: Vec<TextElement>,
}

#[derive(Debug, Clone)]
pub struct TextElement {
    pub text: String,
    pub bold: bool,
    pub italic: bool,
    pub block_type: BlockType,
}

#[derive(Debug, Clone, PartialEq)]
pub enum BlockType {
    Paragraph,
    ParagraphBreak,
    ListItem,
    Heading,
}

pub fn compile(payload: &ExportPayload) -> Result<CompiledDocument, String> {
    let opts = &payload.options;
    let children = validate_and_index_nodes(&payload.nodes)?;
    let top_level_nodes = children.get(&0).cloned().unwrap_or_default();
    let top_level_file_count = top_level_nodes
        .iter()
        .filter(|node| node.file_type == "file")
        .count();
    let has_top_level_folders = top_level_nodes
        .iter()
        .any(|node| node.file_type == "folder");

    let mut chapters = Vec::new();
    let mut top_level_file_number = 0;

    for node in top_level_nodes {
        match node.file_type.as_str() {
            "folder" => {
                let mut sections = Vec::new();
                let mut folder_path = Vec::new();
                collect_sections(node.id, &children, &mut folder_path, &mut sections);
                chapters.push(Chapter {
                    title: node.text.clone(),
                    sections,
                });
            }
            "file" => {
                top_level_file_number += 1;
                let content = node
                    .content
                    .as_deref()
                    .expect("file content is validated before traversal");
                chapters.push(Chapter {
                    title: if !has_top_level_folders && top_level_file_count == 1 {
                        node.text.clone()
                    } else {
                        format!("Chapter {}", top_level_file_number)
                    },
                    sections: vec![Section {
                        title: node.text.clone(),
                        elements: parse_html_content(content),
                    }],
                });
            }
            _ => unreachable!("node types are validated before traversal"),
        }
    }

    Ok(CompiledDocument {
        title: opts.title.clone(),
        author: opts.author.clone(),
        front_matter: opts.front_matter.clone(),
        back_matter: opts.back_matter.clone(),
        chapters,
    })
}

#[derive(Clone, Copy, PartialEq)]
enum VisitState {
    Visiting,
    Visited,
}

fn validate_and_index_nodes(
    nodes: &[ExportFileNode],
) -> Result<HashMap<i64, Vec<&ExportFileNode>>, String> {
    let mut nodes_by_id = HashMap::new();

    for node in nodes {
        if node.id == 0 {
            return Err(format!("Project node \"{}\" uses reserved ID 0", node.text));
        }
        if node.file_type != "file" && node.file_type != "folder" {
            return Err(format!(
                "Project node \"{}\" (ID {}) has unknown type \"{}\"",
                node.text, node.id, node.file_type
            ));
        }
        if node.file_type == "file" && node.content.is_none() {
            return Err(format!(
                "File \"{}\" (node {}) has no export content",
                node.text, node.id
            ));
        }
        if nodes_by_id.insert(node.id, node).is_some() {
            return Err(format!(
                "Project tree contains duplicate node ID {}",
                node.id
            ));
        }
    }

    let mut children: HashMap<i64, Vec<&ExportFileNode>> = HashMap::new();
    for node in nodes {
        if node.parent != 0 {
            let parent = nodes_by_id.get(&node.parent).ok_or_else(|| {
                format!(
                    "Project node \"{}\" (ID {}) has missing parent {}",
                    node.text, node.id, node.parent
                )
            })?;
            if parent.file_type != "folder" {
                return Err(format!(
                    "Project node \"{}\" (ID {}) has file parent \"{}\" (ID {})",
                    node.text, node.id, parent.text, parent.id
                ));
            }
        }
        children.entry(node.parent).or_default().push(node);
    }

    let mut states = HashMap::new();
    for node in nodes {
        validate_parent_chain(node.id, &nodes_by_id, &mut states)?;
    }

    Ok(children)
}

fn validate_parent_chain(
    node_id: i64,
    nodes_by_id: &HashMap<i64, &ExportFileNode>,
    states: &mut HashMap<i64, VisitState>,
) -> Result<(), String> {
    match states.get(&node_id) {
        Some(VisitState::Visited) => return Ok(()),
        Some(VisitState::Visiting) => {
            let node = nodes_by_id
                .get(&node_id)
                .expect("cycle node must exist after parent validation");
            return Err(format!(
                "Project tree contains a cycle involving \"{}\" (ID {})",
                node.text, node.id
            ));
        }
        None => {}
    }

    states.insert(node_id, VisitState::Visiting);
    let node = nodes_by_id
        .get(&node_id)
        .expect("validated node ID must exist");
    if node.parent != 0 {
        validate_parent_chain(node.parent, nodes_by_id, states)?;
    }
    states.insert(node_id, VisitState::Visited);
    Ok(())
}

fn collect_sections(
    folder_id: i64,
    children: &HashMap<i64, Vec<&ExportFileNode>>,
    folder_path: &mut Vec<String>,
    sections: &mut Vec<Section>,
) {
    let Some(child_nodes) = children.get(&folder_id) else {
        return;
    };

    for child in child_nodes {
        if child.file_type == "folder" {
            folder_path.push(child.text.clone());
            collect_sections(child.id, children, folder_path, sections);
            folder_path.pop();
            continue;
        }

        let content = child
            .content
            .as_deref()
            .expect("file content is validated before traversal");
        let title = if folder_path.is_empty() {
            child.text.clone()
        } else {
            format!("{} — {}", folder_path.join(" — "), child.text)
        };
        sections.push(Section {
            title,
            elements: parse_html_content(content),
        });
    }
}

fn parse_html_content(html: &str) -> Vec<TextElement> {
    if html.trim().is_empty() {
        return vec![];
    }

    let document = Html::parse_fragment(html);
    let mut elements: Vec<TextElement> = Vec::new();

    for child in document.root_element().children() {
        let child_ref: NodeRef<'_, Node> = child;
        match child_ref.value() {
            Node::Element(el) => {
                let tag = el.name();
                let block_type = match tag {
                    "h1" | "h2" | "h3" | "h4" | "h5" | "h6" => BlockType::Heading,
                    "li" => BlockType::ListItem,
                    "ol" | "ul" => {
                        let list_elements = parse_list_node(&child_ref);
                        elements.extend(list_elements);
                        continue;
                    }
                    _ => BlockType::Paragraph,
                };

                let inline_elements =
                    extract_inline_elements(&child_ref, false, false, &block_type);
                elements.extend(inline_elements);

                elements.push(TextElement {
                    text: String::new(),
                    bold: false,
                    italic: false,
                    block_type: BlockType::ParagraphBreak,
                });
            }
            Node::Text(text) => {
                let t = text.text.to_string();
                if !t.trim().is_empty() {
                    elements.push(TextElement {
                        text: t,
                        bold: false,
                        italic: false,
                        block_type: BlockType::Paragraph,
                    });
                }
            }
            _ => {}
        }
    }

    elements
}

fn parse_list_node(node: &NodeRef<'_, Node>) -> Vec<TextElement> {
    let mut elements = Vec::new();

    for child in node.children() {
        let child_ref: NodeRef<'_, Node> = child;
        match child_ref.value() {
            Node::Element(el) => {
                let tag = el.name();
                if tag == "li" {
                    let inline =
                        extract_inline_elements(&child_ref, false, false, &BlockType::ListItem);
                    elements.extend(inline);
                } else if tag == "ol" || tag == "ul" {
                    let nested = parse_list_node(&child_ref);
                    elements.extend(nested);
                }
            }
            _ => {}
        }
    }

    elements
}

fn extract_inline_elements(
    node: &NodeRef<'_, Node>,
    bold: bool,
    italic: bool,
    block_type: &BlockType,
) -> Vec<TextElement> {
    let mut elements = Vec::new();

    for child in node.children() {
        let child_ref: NodeRef<'_, Node> = child;
        match child_ref.value() {
            Node::Text(text) => {
                let t = text.text.to_string();
                if !t.is_empty() {
                    elements.push(TextElement {
                        text: t,
                        bold,
                        italic,
                        block_type: block_type.clone(),
                    });
                }
            }
            Node::Element(el) => {
                let tag = el.name();
                let (b, i) = match tag {
                    "strong" | "b" => (true, italic),
                    "em" | "i" => (bold, true),
                    "u" | "s" | "del" | "strike" => (bold, italic),
                    "br" => {
                        elements.push(TextElement {
                            text: "\n".to_string(),
                            bold,
                            italic,
                            block_type: block_type.clone(),
                        });
                        continue;
                    }
                    _ => (bold, italic),
                };
                let nested = extract_inline_elements(&child, b, i, block_type);
                elements.extend(nested);
            }
            _ => {}
        }
    }

    elements
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::export::types::{ExportFileNode, ExportOptions, ExportPayload};

    fn make_payload(nodes: Vec<ExportFileNode>) -> ExportPayload {
        ExportPayload {
            project_name: "test".to_string(),
            nodes,
            options: ExportOptions {
                title: "Test Book".to_string(),
                author: "Test Author".to_string(),
                front_matter: None,
                back_matter: None,
            },
        }
    }

    fn file(id: i64, parent: i64, text: &str, content: Option<&str>) -> ExportFileNode {
        ExportFileNode {
            id,
            parent,
            text: text.to_string(),
            file_type: "file".to_string(),
            content: content.map(str::to_string),
        }
    }

    fn folder(id: i64, parent: i64, text: &str) -> ExportFileNode {
        ExportFileNode {
            id,
            parent,
            text: text.to_string(),
            file_type: "folder".to_string(),
            content: None,
        }
    }

    #[test]
    fn test_empty_project() {
        let payload = make_payload(vec![]);
        let doc = compile(&payload).unwrap();
        assert_eq!(doc.chapters.len(), 0);
    }

    #[test]
    fn test_top_level_files_only() {
        let payload = make_payload(vec![
            ExportFileNode {
                id: 1,
                parent: 0,
                text: "Scene 1".to_string(),
                file_type: "file".to_string(),
                content: Some("<p>Hello world</p>".to_string()),
            },
            ExportFileNode {
                id: 2,
                parent: 0,
                text: "Scene 2".to_string(),
                file_type: "file".to_string(),
                content: Some("<p>Goodbye world</p>".to_string()),
            },
        ]);
        let doc = compile(&payload).unwrap();
        assert_eq!(doc.chapters.len(), 2);
        assert_eq!(doc.chapters[0].title, "Chapter 1");
        assert_eq!(doc.chapters[1].title, "Chapter 2");
    }

    #[test]
    fn test_folders_as_chapters() {
        let payload = make_payload(vec![
            ExportFileNode {
                id: 1,
                parent: 0,
                text: "Act One".to_string(),
                file_type: "folder".to_string(),
                content: None,
            },
            ExportFileNode {
                id: 2,
                parent: 1,
                text: "Opening".to_string(),
                file_type: "file".to_string(),
                content: Some("<p>It was a dark night.</p>".to_string()),
            },
        ]);
        let doc = compile(&payload).unwrap();
        assert_eq!(doc.chapters.len(), 1);
        assert_eq!(doc.chapters[0].title, "Act One");
        assert_eq!(doc.chapters[0].sections.len(), 1);
        assert_eq!(doc.chapters[0].sections[0].title, "Opening");
    }

    #[test]
    fn test_interleaved_root_items_preserve_order() {
        let payload = make_payload(vec![
            file(1, 0, "Loose Opening", Some("<p>Opening</p>")),
            folder(2, 0, "Act One"),
            file(3, 2, "Inside Act", Some("<p>Act</p>")),
            file(4, 0, "Loose Closing", Some("<p>Closing</p>")),
        ]);

        let doc = compile(&payload).unwrap();

        assert_eq!(doc.chapters.len(), 3);
        assert_eq!(doc.chapters[0].title, "Chapter 1");
        assert_eq!(doc.chapters[0].sections[0].title, "Loose Opening");
        assert_eq!(doc.chapters[1].title, "Act One");
        assert_eq!(doc.chapters[1].sections[0].title, "Inside Act");
        assert_eq!(doc.chapters[2].title, "Chapter 2");
        assert_eq!(doc.chapters[2].sections[0].title, "Loose Closing");
    }

    #[test]
    fn test_arbitrary_depth_and_nested_sibling_order() {
        let payload = make_payload(vec![
            folder(1, 0, "Book"),
            file(2, 1, "Opening", Some("<p>Opening</p>")),
            folder(3, 1, "Part One"),
            file(4, 3, "Scene One", Some("<p>Scene one</p>")),
            folder(5, 3, "Sequence"),
            folder(6, 5, "Beat"),
            file(7, 6, "Deep Scene", Some("<p>Deep scene</p>")),
            file(8, 1, "Closing", Some("<p>Closing</p>")),
        ]);

        let doc = compile(&payload).unwrap();
        let section_titles: Vec<&str> = doc.chapters[0]
            .sections
            .iter()
            .map(|section| section.title.as_str())
            .collect();

        assert_eq!(
            section_titles,
            vec![
                "Opening",
                "Part One — Scene One",
                "Part One — Sequence — Beat — Deep Scene",
                "Closing",
            ]
        );
    }

    #[test]
    fn test_empty_root_folder_is_preserved() {
        let payload = make_payload(vec![folder(1, 0, "Empty Act")]);

        let doc = compile(&payload).unwrap();

        assert_eq!(doc.chapters.len(), 1);
        assert_eq!(doc.chapters[0].title, "Empty Act");
        assert!(doc.chapters[0].sections.is_empty());
    }

    #[test]
    fn test_missing_parent_is_rejected() {
        let payload = make_payload(vec![file(1, 99, "Orphan", Some("<p>Lost</p>"))]);

        let error = compile(&payload).unwrap_err();

        assert!(error.contains("Orphan"));
        assert!(error.contains("ID 1"));
        assert!(error.contains("missing parent 99"));
    }

    #[test]
    fn test_cycle_is_rejected() {
        let payload = make_payload(vec![folder(1, 2, "One"), folder(2, 1, "Two")]);

        let error = compile(&payload).unwrap_err();

        assert!(error.contains("cycle"));
        assert!(error.contains("ID"));
    }

    #[test]
    fn test_duplicate_id_is_rejected() {
        let payload = make_payload(vec![
            folder(1, 0, "Act"),
            file(1, 0, "Duplicate", Some("<p>Duplicate</p>")),
        ]);

        let error = compile(&payload).unwrap_err();

        assert!(error.contains("duplicate node ID 1"));
    }

    #[test]
    fn test_file_parent_is_rejected() {
        let payload = make_payload(vec![
            file(1, 0, "Parent File", Some("<p>Parent</p>")),
            file(2, 1, "Child File", Some("<p>Child</p>")),
        ]);

        let error = compile(&payload).unwrap_err();

        assert!(error.contains("Child File"));
        assert!(error.contains("file parent"));
        assert!(error.contains("Parent File"));
    }

    #[test]
    fn test_unknown_node_type_is_rejected() {
        let payload = make_payload(vec![ExportFileNode {
            id: 1,
            parent: 0,
            text: "Mystery".to_string(),
            file_type: "document".to_string(),
            content: Some("<p>Mystery</p>".to_string()),
        }]);

        let error = compile(&payload).unwrap_err();

        assert!(error.contains("Mystery"));
        assert!(error.contains("unknown type"));
    }

    #[test]
    fn test_missing_file_content_is_rejected_but_empty_content_is_valid() {
        let missing_payload = make_payload(vec![file(1, 0, "Missing", None)]);
        let empty_payload = make_payload(vec![file(1, 0, "Empty", Some(""))]);

        let error = compile(&missing_payload).unwrap_err();
        let empty_doc = compile(&empty_payload).unwrap();

        assert!(error.contains("Missing"));
        assert!(error.contains("node 1"));
        assert_eq!(empty_doc.chapters.len(), 1);
        assert!(empty_doc.chapters[0].sections[0].elements.is_empty());
    }

    #[test]
    fn test_html_bold_italic() {
        let elements = parse_html_content("<p><strong>Bold</strong> and <em>italic</em></p>");
        // 3 inline elements + 1 ParagraphBreak sentinel
        assert_eq!(elements.len(), 4);
        assert!(elements[0].bold);
        assert!(!elements[0].italic);
        assert_eq!(elements[0].block_type, BlockType::Paragraph);
        assert!(elements[2].italic);
        assert!(!elements[2].bold);
        assert_eq!(elements[2].block_type, BlockType::Paragraph);
        assert_eq!(elements[3].block_type, BlockType::ParagraphBreak);
    }

    #[test]
    fn test_nested_formatting() {
        let elements = parse_html_content("<p><strong><em>Bold italic</em></strong></p>");
        // 1 inline element + 1 ParagraphBreak
        assert_eq!(elements.len(), 2);
        assert!(elements[0].bold);
        assert!(elements[0].italic);
        assert_eq!(elements[0].block_type, BlockType::Paragraph);
        assert_eq!(elements[1].block_type, BlockType::ParagraphBreak);
    }

    #[test]
    fn test_empty_content() {
        let elements = parse_html_content("");
        assert_eq!(elements.len(), 0);
    }

    #[test]
    fn test_list_items() {
        let elements = parse_html_content("<ul><li>Item one</li><li>Item two</li></ul>");
        assert_eq!(elements.len(), 2);
        assert_eq!(elements[0].block_type, BlockType::ListItem);
        assert_eq!(elements[1].block_type, BlockType::ListItem);
    }

    #[test]
    fn test_inline_italic_same_paragraph() {
        let elements = parse_html_content("<p>Hello <em>world</em> foo</p>");
        // "Hello ", "world" (italic), " foo", ParagraphBreak
        assert_eq!(elements.len(), 4);
        assert_eq!(elements[0].block_type, BlockType::Paragraph);
        assert_eq!(elements[1].block_type, BlockType::Paragraph);
        assert!(elements[1].italic);
        assert_eq!(elements[2].block_type, BlockType::Paragraph);
        assert_eq!(elements[3].block_type, BlockType::ParagraphBreak);
    }

    #[test]
    fn test_multiple_paragraphs_separated() {
        let elements = parse_html_content("<p>First</p><p>Second</p>");
        // "First", ParagraphBreak, "Second", ParagraphBreak
        assert_eq!(elements.len(), 4);
        assert_eq!(elements[0].text, "First");
        assert_eq!(elements[0].block_type, BlockType::Paragraph);
        assert_eq!(elements[1].block_type, BlockType::ParagraphBreak);
        assert_eq!(elements[2].text, "Second");
        assert_eq!(elements[2].block_type, BlockType::Paragraph);
        assert_eq!(elements[3].block_type, BlockType::ParagraphBreak);
    }

    #[test]
    fn test_bold_inline_same_paragraph() {
        let elements = parse_html_content("<p>Some <strong>bold</strong> text</p>");
        // "Some ", "bold" (bold), " text", ParagraphBreak
        assert_eq!(elements.len(), 4);
        assert_eq!(elements[0].block_type, BlockType::Paragraph);
        assert!(!elements[0].bold);
        assert_eq!(elements[1].block_type, BlockType::Paragraph);
        assert!(elements[1].bold);
        assert_eq!(elements[2].block_type, BlockType::Paragraph);
        assert!(!elements[2].bold);
        assert_eq!(elements[3].block_type, BlockType::ParagraphBreak);
    }
}
