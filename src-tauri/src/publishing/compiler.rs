use std::collections::HashMap;

use crate::export::types::{ExportFileNode, ExportPayload};

use super::html::parse_quill_html;
use super::model::{
    Block, BookContributor, BookDocument, BookMetadata, BookSection, ContributorRole, Inline,
    InlineMarks, ParagraphAlignment, ParagraphStyle, SectionInclusion, SectionRole, TextDirection,
};

pub(crate) fn compile(payload: &ExportPayload) -> Result<BookDocument, String> {
    let children = validate_and_index_nodes(&payload.nodes)?;
    let top_level_nodes = children.get(&0).cloned().unwrap_or_default();
    let top_level_file_count = top_level_nodes
        .iter()
        .filter(|node| node.file_type == "file")
        .count();
    let has_top_level_folders = top_level_nodes
        .iter()
        .any(|node| node.file_type == "folder");
    let mut sections = Vec::new();

    if let Some(front_matter) = &payload.options.front_matter {
        sections.push(matter_section(SectionRole::FrontMatter, front_matter));
    }

    let mut top_level_file_number = 0;
    for node in top_level_nodes {
        match node.file_type.as_str() {
            "folder" => sections.push(compile_folder(node, SectionRole::Chapter, &children)?),
            "file" => {
                top_level_file_number += 1;
                let chapter_title = if !has_top_level_folders && top_level_file_count == 1 {
                    node.text.clone()
                } else {
                    format!("Chapter {top_level_file_number}")
                };
                sections.push(BookSection {
                    source_node_id: None,
                    role: SectionRole::Chapter,
                    title: Some(chapter_title),
                    inclusion: SectionInclusion::AllFormats,
                    blocks: vec![],
                    children: vec![compile_file(node)?],
                });
            }
            _ => unreachable!("node types are validated before traversal"),
        }
    }

    if let Some(back_matter) = &payload.options.back_matter {
        sections.push(matter_section(SectionRole::BackMatter, back_matter));
    }

    Ok(BookDocument {
        metadata: BookMetadata {
            title: payload.options.title.clone(),
            subtitle: None,
            contributors: vec![BookContributor {
                name: payload.options.author.clone(),
                role: ContributorRole::Author,
            }],
            language: None,
            series: None,
            ..BookMetadata::default()
        },
        sections,
        assets: vec![],
    })
}

fn matter_section(role: SectionRole, content: &str) -> BookSection {
    BookSection {
        source_node_id: None,
        role,
        title: None,
        inclusion: SectionInclusion::AllFormats,
        blocks: vec![plain_paragraph(content)],
        children: vec![],
    }
}

fn compile_folder(
    node: &ExportFileNode,
    role: SectionRole,
    children: &HashMap<i64, Vec<&ExportFileNode>>,
) -> Result<BookSection, String> {
    let child_sections = children
        .get(&node.id)
        .map(|nodes| {
            nodes
                .iter()
                .map(|child| match child.file_type.as_str() {
                    "folder" => compile_folder(child, SectionRole::Unassigned, children),
                    "file" => compile_file(child),
                    _ => unreachable!("node types are validated before traversal"),
                })
                .collect::<Result<Vec<_>, _>>()
        })
        .transpose()?
        .unwrap_or_default();

    Ok(BookSection {
        source_node_id: Some(node.id),
        role,
        title: Some(node.text.clone()),
        inclusion: SectionInclusion::AllFormats,
        blocks: vec![],
        children: child_sections,
    })
}

fn compile_file(node: &ExportFileNode) -> Result<BookSection, String> {
    let content = node
        .content
        .as_deref()
        .expect("file content is validated before traversal");
    let blocks = parse_quill_html(content)
        .map_err(|error| format!("File \"{}\" (node {}): {error}", node.text, node.id))?;

    Ok(BookSection {
        source_node_id: Some(node.id),
        role: SectionRole::Scene,
        title: Some(node.text.clone()),
        inclusion: SectionInclusion::AllFormats,
        blocks,
        children: vec![],
    })
}

fn plain_paragraph(text: &str) -> Block {
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::export::types::{ExportOptions, ExportPayload};

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

    fn body_sections(document: &BookDocument) -> Vec<&BookSection> {
        document
            .sections
            .iter()
            .filter(|section| section.role == SectionRole::Chapter)
            .collect()
    }

    #[test]
    fn empty_project_compiles_to_an_empty_body() {
        let document = compile(&make_payload(vec![])).unwrap();
        assert!(document.sections.is_empty());
        assert!(document.assets.is_empty());
    }

    #[test]
    fn top_level_files_are_numbered_as_independent_chapters() {
        let document = compile(&make_payload(vec![
            file(1, 0, "Scene 1", Some("<p>Hello world</p>")),
            file(2, 0, "Scene 2", Some("<p>Goodbye world</p>")),
        ]))
        .unwrap();
        let chapters = body_sections(&document);

        assert_eq!(chapters.len(), 2);
        assert_eq!(chapters[0].title.as_deref(), Some("Chapter 1"));
        assert_eq!(chapters[0].children[0].title.as_deref(), Some("Scene 1"));
        assert_eq!(chapters[1].title.as_deref(), Some("Chapter 2"));
        assert_eq!(chapters[1].children[0].title.as_deref(), Some("Scene 2"));
    }

    #[test]
    fn a_single_top_level_file_retains_the_legacy_chapter_title() {
        let document = compile(&make_payload(vec![file(
            1,
            0,
            "Only Scene",
            Some("<p>Text</p>"),
        )]))
        .unwrap();

        assert_eq!(
            body_sections(&document)[0].title.as_deref(),
            Some("Only Scene")
        );
    }

    #[test]
    fn folders_are_chapters_with_recursive_semantic_children() {
        let document = compile(&make_payload(vec![
            folder(1, 0, "Act One"),
            folder(2, 1, "Sequence"),
            file(3, 2, "Opening", Some("<p>It was a dark night.</p>")),
        ]))
        .unwrap();
        let chapter = body_sections(&document)[0];

        assert_eq!(chapter.title.as_deref(), Some("Act One"));
        assert_eq!(chapter.source_node_id, Some(1));
        assert_eq!(chapter.children[0].role, SectionRole::Unassigned);
        assert_eq!(chapter.children[0].title.as_deref(), Some("Sequence"));
        assert_eq!(chapter.children[0].children[0].role, SectionRole::Scene);
        assert_eq!(
            chapter.children[0].children[0].title.as_deref(),
            Some("Opening")
        );
    }

    #[test]
    fn interleaved_root_items_and_root_file_numbering_preserve_source_order() {
        let document = compile(&make_payload(vec![
            file(1, 0, "Loose Opening", Some("<p>Opening</p>")),
            folder(2, 0, "Act One"),
            file(3, 2, "Inside Act", Some("<p>Act</p>")),
            file(4, 0, "Loose Closing", Some("<p>Closing</p>")),
        ]))
        .unwrap();
        let chapters = body_sections(&document);

        assert_eq!(chapters.len(), 3);
        assert_eq!(chapters[0].title.as_deref(), Some("Chapter 1"));
        assert_eq!(
            chapters[0].children[0].title.as_deref(),
            Some("Loose Opening")
        );
        assert_eq!(chapters[1].title.as_deref(), Some("Act One"));
        assert_eq!(chapters[1].children[0].title.as_deref(), Some("Inside Act"));
        assert_eq!(chapters[2].title.as_deref(), Some("Chapter 2"));
        assert_eq!(
            chapters[2].children[0].title.as_deref(),
            Some("Loose Closing")
        );
    }

    #[test]
    fn arbitrary_depth_and_nested_sibling_order_are_retained() {
        let document = compile(&make_payload(vec![
            folder(1, 0, "Book"),
            file(2, 1, "Opening", Some("<p>Opening</p>")),
            folder(3, 1, "Part One"),
            file(4, 3, "Scene One", Some("<p>Scene one</p>")),
            folder(5, 3, "Sequence"),
            folder(6, 5, "Beat"),
            file(7, 6, "Deep Scene", Some("<p>Deep scene</p>")),
            file(8, 1, "Closing", Some("<p>Closing</p>")),
        ]))
        .unwrap();
        let chapter = body_sections(&document)[0];

        assert_eq!(chapter.children[0].title.as_deref(), Some("Opening"));
        assert_eq!(chapter.children[1].title.as_deref(), Some("Part One"));
        assert_eq!(
            chapter.children[1].children[0].title.as_deref(),
            Some("Scene One")
        );
        assert_eq!(
            chapter.children[1].children[1].children[0].children[0]
                .title
                .as_deref(),
            Some("Deep Scene")
        );
        assert_eq!(chapter.children[2].title.as_deref(), Some("Closing"));
    }

    #[test]
    fn empty_root_folder_is_preserved() {
        let document = compile(&make_payload(vec![folder(1, 0, "Empty Act")])).unwrap();
        let chapter = body_sections(&document)[0];

        assert_eq!(chapter.title.as_deref(), Some("Empty Act"));
        assert!(chapter.children.is_empty());
    }

    #[test]
    fn front_and_back_matter_wrap_the_ordered_body() {
        let mut payload = make_payload(vec![folder(1, 0, "Body")]);
        payload.options.front_matter = Some("Copyright".to_string());
        payload.options.back_matter = Some("The End".to_string());

        let document = compile(&payload).unwrap();

        assert_eq!(document.sections[0].role, SectionRole::FrontMatter);
        assert_eq!(document.sections[1].role, SectionRole::Chapter);
        assert_eq!(document.sections[2].role, SectionRole::BackMatter);
    }

    #[test]
    fn parser_errors_name_the_source_file_and_node() {
        let error = compile(&make_payload(vec![file(
            7,
            0,
            "Broken Scene",
            Some("<table/>"),
        )]))
        .unwrap_err();

        assert!(error.contains("Broken Scene"));
        assert!(error.contains("node 7"));
        assert!(error.contains("<table>"));
    }

    #[test]
    fn missing_parent_is_rejected() {
        let error = compile(&make_payload(vec![file(
            1,
            99,
            "Orphan",
            Some("<p>Lost</p>"),
        )]))
        .unwrap_err();

        assert!(error.contains("Orphan"));
        assert!(error.contains("ID 1"));
        assert!(error.contains("missing parent 99"));
    }

    #[test]
    fn cycle_is_rejected() {
        let error = compile(&make_payload(vec![
            folder(1, 2, "One"),
            folder(2, 1, "Two"),
        ]))
        .unwrap_err();

        assert!(error.contains("cycle"));
        assert!(error.contains("ID"));
    }

    #[test]
    fn duplicate_id_is_rejected() {
        let error = compile(&make_payload(vec![
            folder(1, 0, "Act"),
            file(1, 0, "Duplicate", Some("<p>Duplicate</p>")),
        ]))
        .unwrap_err();

        assert!(error.contains("duplicate node ID 1"));
    }

    #[test]
    fn file_parent_is_rejected() {
        let error = compile(&make_payload(vec![
            file(1, 0, "Parent File", Some("<p>Parent</p>")),
            file(2, 1, "Child File", Some("<p>Child</p>")),
        ]))
        .unwrap_err();

        assert!(error.contains("Child File"));
        assert!(error.contains("file parent"));
        assert!(error.contains("Parent File"));
    }

    #[test]
    fn unknown_node_type_is_rejected() {
        let error = compile(&make_payload(vec![ExportFileNode {
            id: 1,
            parent: 0,
            text: "Mystery".to_string(),
            file_type: "document".to_string(),
            content: Some("<p>Mystery</p>".to_string()),
        }]))
        .unwrap_err();

        assert!(error.contains("Mystery"));
        assert!(error.contains("unknown type"));
    }

    #[test]
    fn missing_file_content_is_rejected_but_empty_content_is_valid() {
        let missing_error = compile(&make_payload(vec![file(1, 0, "Missing", None)])).unwrap_err();
        let empty_document = compile(&make_payload(vec![file(1, 0, "Empty", Some(""))])).unwrap();

        assert!(missing_error.contains("Missing"));
        assert!(missing_error.contains("node 1"));
        assert!(body_sections(&empty_document)[0].children[0]
            .blocks
            .is_empty());
    }

    #[test]
    fn small_novel_fixture_compiles_end_to_end_without_reordering_or_format_loss() {
        let payload: ExportPayload =
            serde_json::from_str(include_str!("fixtures/small_novel_payload.json")).unwrap();
        let document = compile(&payload).unwrap();
        let chapters = body_sections(&document);

        assert_eq!(document.metadata.title, "The Winter Archive");
        assert_eq!(document.sections[0].role, SectionRole::FrontMatter);
        assert_eq!(chapters.len(), 2);
        assert_eq!(chapters[0].title.as_deref(), Some("Part One"));
        assert_eq!(chapters[0].children[0].title.as_deref(), Some("Arrival"));
        assert_eq!(chapters[0].children[1].title.as_deref(), Some("The Town"));
        assert_eq!(
            chapters[0].children[1].children[0].title.as_deref(),
            Some("Night Market")
        );
        assert_eq!(chapters[1].title.as_deref(), Some("Chapter 1"));
        assert_eq!(chapters[1].children[0].title.as_deref(), Some("Coda"));

        let Block::Paragraph { inlines, .. } = &chapters[0].children[0].blocks[0] else {
            panic!("arrival should start with a paragraph");
        };
        let Inline::Text { text, marks, .. } = &inlines[1] else {
            panic!("arrival emphasis should be text");
        };
        assert_eq!(text, "at last");
        assert!(marks.bold);

        let night_market = &chapters[0].children[1].children[0];
        let Block::Paragraph { inlines, .. } = &night_market.blocks[0] else {
            panic!("night market should start with a paragraph");
        };
        assert!(matches!(
            &inlines[0],
            Inline::Text { marks, .. } if marks.italic
        ));
        assert!(matches!(
            &inlines[2],
            Inline::Text { marks, .. } if marks.underline
        ));
        assert!(matches!(
            &inlines[4],
            Inline::Text { marks, .. } if marks.strike
        ));
        let Block::OrderedList { items } = &night_market.blocks[1] else {
            panic!("night market should contain an ordered list");
        };
        assert_eq!(items.len(), 2);
        assert!(matches!(items[0].blocks[1], Block::BulletList { .. }));
        assert_eq!(
            document.sections.last().unwrap().role,
            SectionRole::BackMatter
        );
    }
}
