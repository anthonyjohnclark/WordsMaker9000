use crate::export::types::{ExportFileNode, ExportPayload};
use ego_tree::NodeRef;
use scraper::node::Node;
use scraper::Html;

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
    pub underline: bool,
    pub strikethrough: bool,
    pub block_type: BlockType,
}

#[derive(Debug, Clone, PartialEq)]
pub enum BlockType {
    Paragraph,
    ListItem,
    Heading,
}

pub fn compile(payload: &ExportPayload) -> Result<CompiledDocument, String> {
    let opts = &payload.options;
    let nodes = &payload.nodes;

    let mut chapters: Vec<Chapter> = Vec::new();

    // Separate top-level folders and top-level files
    let top_level_folders: Vec<&ExportFileNode> = nodes
        .iter()
        .filter(|n| n.parent == 0 && n.file_type == "folder")
        .collect();

    let top_level_files: Vec<&ExportFileNode> = nodes
        .iter()
        .filter(|n| n.parent == 0 && n.file_type == "file")
        .collect();

    // Process top-level folders as chapters
    for folder in &top_level_folders {
        let child_files: Vec<&ExportFileNode> = nodes
            .iter()
            .filter(|n| n.parent == folder.id && n.file_type == "file")
            .collect();

        let mut sections: Vec<Section> = Vec::new();
        for file in &child_files {
            let elements = parse_html_content(file.content.as_deref().unwrap_or(""));
            sections.push(Section {
                title: file.text.clone(),
                elements,
            });
        }

        // Recursively handle nested folders as additional sections
        let child_folders: Vec<&ExportFileNode> = nodes
            .iter()
            .filter(|n| n.parent == folder.id && n.file_type == "folder")
            .collect();

        for subfolder in &child_folders {
            let nested_files: Vec<&ExportFileNode> = nodes
                .iter()
                .filter(|n| n.parent == subfolder.id && n.file_type == "file")
                .collect();

            for file in &nested_files {
                let elements = parse_html_content(file.content.as_deref().unwrap_or(""));
                sections.push(Section {
                    title: format!("{} — {}", subfolder.text, file.text),
                    elements,
                });
            }
        }

        chapters.push(Chapter {
            title: folder.text.clone(),
            sections,
        });
    }

    // Process top-level files as auto-numbered chapters
    for (i, file) in top_level_files.iter().enumerate() {
        let elements = parse_html_content(file.content.as_deref().unwrap_or(""));
        let section = Section {
            title: file.text.clone(),
            elements,
        };
        chapters.push(Chapter {
            title: if top_level_folders.is_empty() && top_level_files.len() == 1 {
                file.text.clone()
            } else {
                format!(
                    "Chapter {}",
                    chapters.len() + i + 1 - top_level_folders.len()
                )
            },
            sections: vec![section],
        });
    }

    Ok(CompiledDocument {
        title: opts.title.clone(),
        author: opts.author.clone(),
        front_matter: opts.front_matter.clone(),
        back_matter: opts.back_matter.clone(),
        chapters,
    })
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
                    extract_inline_elements(&child_ref, false, false, false, false, &block_type);
                elements.extend(inline_elements);
            }
            Node::Text(text) => {
                let t = text.text.to_string();
                if !t.trim().is_empty() {
                    elements.push(TextElement {
                        text: t,
                        bold: false,
                        italic: false,
                        underline: false,
                        strikethrough: false,
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
                    let inline = extract_inline_elements(
                        &child_ref,
                        false,
                        false,
                        false,
                        false,
                        &BlockType::ListItem,
                    );
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
    underline: bool,
    strikethrough: bool,
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
                        underline,
                        strikethrough,
                        block_type: block_type.clone(),
                    });
                }
            }
            Node::Element(el) => {
                let tag = el.name();
                let (b, i, u, s) = match tag {
                    "strong" | "b" => (true, italic, underline, strikethrough),
                    "em" | "i" => (bold, true, underline, strikethrough),
                    "u" => (bold, italic, true, strikethrough),
                    "s" | "del" | "strike" => (bold, italic, underline, true),
                    "br" => {
                        elements.push(TextElement {
                            text: "\n".to_string(),
                            bold,
                            italic,
                            underline,
                            strikethrough,
                            block_type: block_type.clone(),
                        });
                        continue;
                    }
                    _ => (bold, italic, underline, strikethrough),
                };
                let nested = extract_inline_elements(&child, b, i, u, s, block_type);
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
    fn test_html_bold_italic() {
        let elements = parse_html_content("<p><strong>Bold</strong> and <em>italic</em></p>");
        assert!(elements.len() >= 3);
        assert!(elements[0].bold);
        assert!(!elements[0].italic);
        assert!(elements[2].italic);
        assert!(!elements[2].bold);
    }

    #[test]
    fn test_nested_formatting() {
        let elements = parse_html_content("<p><strong><em>Bold italic</em></strong></p>");
        assert_eq!(elements.len(), 1);
        assert!(elements[0].bold);
        assert!(elements[0].italic);
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
}
