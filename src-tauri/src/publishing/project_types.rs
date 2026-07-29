use std::collections::{HashMap, HashSet};

use super::model::{BookDocument, BookSection, SectionRole};
use super::request::{NodePublishingOverride, ProjectType, PublicationScope};

pub(crate) fn apply_project_strategy(
    document: &mut BookDocument,
    project_type: ProjectType,
    overrides: &HashMap<String, NodePublishingOverride>,
    scope: &PublicationScope,
    include_shared_matter: bool,
) -> Result<(), String> {
    for section in &mut document.sections {
        if !is_body_role(&section.role) {
            continue;
        }

        collapse_legacy_root_file_wrapper(section);

        match project_type {
            ProjectType::Novel | ProjectType::Novella => {
                section.role = SectionRole::Chapter;
            }
            ProjectType::Collection => {
                section.role = SectionRole::Work;
                adopt_single_scene_title(section);
            }
            ProjectType::Serial => {
                section.role = SectionRole::Installment;
                adopt_single_scene_title(section);
                for child in &mut section.children {
                    if child.role == SectionRole::Unassigned {
                        child.role = SectionRole::Chapter;
                    }
                }
            }
        }
    }

    validate_unique_source_node_ids(document)?;

    let mut applied_ids = HashSet::new();
    for section in &mut document.sections {
        apply_overrides(section, overrides, &mut applied_ids);
    }

    apply_scope(document, scope, include_shared_matter);
    Ok(())
}

fn collapse_legacy_root_file_wrapper(section: &mut BookSection) {
    let is_legacy_root_file_wrapper = section.source_node_id.is_none()
        && section.role == SectionRole::Chapter
        && section.blocks.is_empty()
        && section.children.len() == 1
        && section.children[0].role == SectionRole::Scene
        && section.children[0].source_node_id.is_some();
    if !is_legacy_root_file_wrapper {
        return;
    }

    let child = section
        .children
        .pop()
        .expect("legacy root-file wrapper has exactly one child");
    section.source_node_id = child.source_node_id;
    section.title = child.title;
    section.inclusion = child.inclusion;
    section.blocks = child.blocks;
    section.children = child.children;
}

fn validate_unique_source_node_ids(document: &BookDocument) -> Result<(), String> {
    fn visit(section: &BookSection, seen: &mut HashMap<i64, String>) -> Result<(), String> {
        if let Some(node_id) = section.source_node_id {
            let title = section
                .title
                .clone()
                .unwrap_or_else(|| format!("{:?}", section.role));
            if let Some(existing_title) = seen.insert(node_id, title.clone()) {
                return Err(format!(
                    "Duplicate source node ID {node_id} in publishing outline: \
                     \"{existing_title}\" and \"{title}\""
                ));
            }
        }
        for child in &section.children {
            visit(child, seen)?;
        }
        Ok(())
    }

    let mut seen = HashMap::new();
    for section in &document.sections {
        visit(section, &mut seen)?;
    }
    Ok(())
}

fn adopt_single_scene_title(section: &mut BookSection) {
    if section.children.len() == 1 && section.children[0].role == SectionRole::Scene {
        if let Some(title) = &section.children[0].title {
            section.title = Some(title.clone());
        }
    }
}

fn apply_overrides(
    section: &mut BookSection,
    overrides: &HashMap<String, NodePublishingOverride>,
    applied_ids: &mut HashSet<i64>,
) {
    if let Some(node_id) = section.source_node_id {
        if applied_ids.insert(node_id) {
            if let Some(node_override) = overrides.get(&node_id.to_string()) {
                section.role = node_override.role.clone();
                section.inclusion = node_override.inclusion.clone();
            }
        }
    }
    for child in &mut section.children {
        apply_overrides(child, overrides, applied_ids);
    }
}

fn apply_scope(document: &mut BookDocument, scope: &PublicationScope, include_shared_matter: bool) {
    let selected_ids = match scope {
        PublicationScope::FullProject => return,
        PublicationScope::SelectedNodes { node_ids } => node_ids.clone(),
        PublicationScope::SingleWork { node_id }
        | PublicationScope::SingleInstallment { node_id }
        | PublicationScope::Volume { node_id } => vec![*node_id],
    };
    let selected: HashSet<i64> = selected_ids.into_iter().collect();

    document.sections = document
        .sections
        .drain(..)
        .filter_map(|mut section| {
            if !is_body_role(&section.role) {
                return include_shared_matter.then_some(section);
            }
            filter_section(&mut section, &selected).then_some(section)
        })
        .collect();
}

fn filter_section(section: &mut BookSection, selected: &HashSet<i64>) -> bool {
    if section
        .source_node_id
        .is_some_and(|node_id| selected.contains(&node_id))
    {
        return true;
    }

    section.children = section
        .children
        .drain(..)
        .filter_map(|mut child| filter_section(&mut child, selected).then_some(child))
        .collect();
    !section.children.is_empty()
}

fn is_body_role(role: &SectionRole) -> bool {
    !matches!(role, SectionRole::FrontMatter | SectionRole::BackMatter)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::publishing::model::{Block, BookMetadata, SectionInclusion};

    fn section(id: i64, role: SectionRole, title: &str, children: Vec<BookSection>) -> BookSection {
        BookSection {
            source_node_id: Some(id),
            role,
            title: Some(title.to_string()),
            inclusion: SectionInclusion::AllFormats,
            blocks: vec![],
            children,
        }
    }

    fn document() -> BookDocument {
        BookDocument {
            metadata: BookMetadata {
                title: "Book".to_string(),
                subtitle: None,
                contributors: vec![],
                language: None,
                series: None,
                ..BookMetadata::default()
            },
            sections: vec![
                section(
                    1,
                    SectionRole::Chapter,
                    "Folder",
                    vec![section(2, SectionRole::Scene, "Scene", vec![])],
                ),
                section(
                    3,
                    SectionRole::Chapter,
                    "Loose Chapter",
                    vec![section(4, SectionRole::Scene, "Loose File", vec![])],
                ),
            ],
            assets: vec![],
        }
    }

    fn legacy_root_file(id: i64, title: &str) -> BookDocument {
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
                source_node_id: None,
                role: SectionRole::Chapter,
                title: Some("Chapter 1".to_string()),
                inclusion: SectionInclusion::AllFormats,
                blocks: vec![],
                children: vec![BookSection {
                    source_node_id: Some(id),
                    role: SectionRole::Scene,
                    title: Some(title.to_string()),
                    inclusion: SectionInclusion::AllFormats,
                    blocks: vec![Block::PageBreak],
                    children: vec![],
                }],
            }],
            assets: vec![],
        }
    }

    #[test]
    fn collection_and_serial_strategies_use_type_specific_root_roles() {
        for project_type in [ProjectType::Novel, ProjectType::Novella] {
            let mut prose = document();
            apply_project_strategy(
                &mut prose,
                project_type,
                &HashMap::new(),
                &PublicationScope::FullProject,
                true,
            )
            .unwrap();
            assert_eq!(prose.sections[0].role, SectionRole::Chapter);
            assert_eq!(prose.sections[0].children[0].role, SectionRole::Scene);
        }

        let mut collection = document();
        apply_project_strategy(
            &mut collection,
            ProjectType::Collection,
            &HashMap::new(),
            &PublicationScope::FullProject,
            true,
        )
        .unwrap();
        assert_eq!(collection.sections[0].role, SectionRole::Work);

        let mut serial = document();
        apply_project_strategy(
            &mut serial,
            ProjectType::Serial,
            &HashMap::new(),
            &PublicationScope::FullProject,
            true,
        )
        .unwrap();
        assert_eq!(serial.sections[0].role, SectionRole::Installment);
    }

    #[test]
    fn selected_scope_keeps_ancestors_and_discards_unselected_siblings() {
        let mut document = document();
        apply_project_strategy(
            &mut document,
            ProjectType::Novel,
            &HashMap::new(),
            &PublicationScope::SelectedNodes { node_ids: vec![2] },
            false,
        )
        .unwrap();

        assert_eq!(document.sections.len(), 1);
        assert_eq!(document.sections[0].source_node_id, Some(1));
        assert_eq!(document.sections[0].children[0].source_node_id, Some(2));
    }

    #[test]
    fn root_file_is_one_type_appropriate_section_with_its_real_identity() {
        for (project_type, expected_role) in [
            (ProjectType::Novel, SectionRole::Chapter),
            (ProjectType::Novella, SectionRole::Chapter),
            (ProjectType::Collection, SectionRole::Work),
            (ProjectType::Serial, SectionRole::Installment),
        ] {
            let mut document = legacy_root_file(42, "The Real Title");
            apply_project_strategy(
                &mut document,
                project_type,
                &HashMap::new(),
                &PublicationScope::FullProject,
                true,
            )
            .unwrap();

            let section = &document.sections[0];
            assert_eq!(section.source_node_id, Some(42));
            assert_eq!(section.title.as_deref(), Some("The Real Title"));
            assert_eq!(section.role, expected_role);
            assert_eq!(section.blocks, vec![Block::PageBreak]);
            assert!(section.children.is_empty());
        }
    }

    #[test]
    fn duplicate_source_identities_are_rejected() {
        let mut document = document();
        document.sections[1].source_node_id = Some(1);

        let error = apply_project_strategy(
            &mut document,
            ProjectType::Novel,
            &HashMap::new(),
            &PublicationScope::FullProject,
            true,
        )
        .unwrap_err();

        assert!(error.contains("Duplicate source node ID 1"));
        assert!(error.contains("Folder"));
        assert!(error.contains("Loose Chapter"));
    }
}
