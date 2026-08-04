use std::collections::{BTreeMap, HashSet};

use serde::Serialize;

use super::model::{
    Block, BookDocument, BookSection, HeadingLevel, Inline, InlineMarks, ListItem,
    ParagraphAlignment, ParagraphStyle, SectionInclusion, SectionRole, TextDirection,
};
use super::request::{
    ChapterStartSide, MasterPageSelection, MatterTemplateSelection, PrintInteriorPdfSettings,
    PublishMetadataOverrides,
};

pub(crate) const TITLE_PAGE_TEMPLATE_ID: &str = "title_page";
pub(crate) const PROFILE_DEFAULT_MASTER_PAGE_ID: &str = "profile_default";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum MatterPlacement {
    Front,
    Back,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub(crate) struct MatterTemplateVariableDefinition {
    pub key: &'static str,
    pub label: &'static str,
    pub required: bool,
    pub multiline: bool,
    pub default_from: Option<&'static str>,
    pub default_value: Option<&'static str>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub(crate) struct MatterTemplateDefinition {
    pub id: &'static str,
    pub version: u32,
    pub label: &'static str,
    pub output_title: &'static str,
    pub description: &'static str,
    pub placement: MatterPlacement,
    pub variables: Vec<MatterTemplateVariableDefinition>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub(crate) struct MasterPageDefinition {
    pub id: &'static str,
    pub version: u32,
    pub label: &'static str,
    pub description: &'static str,
    pub settings: Option<MasterPageSettings>,
    pub intentional_blank_pages: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub(crate) struct MasterPageSettings {
    pub chapter_start: ChapterStartSide,
    pub running_headers: bool,
    pub front_matter_page_numbers: bool,
    pub body_page_numbers: bool,
}

impl MasterPageSettings {
    fn apply_to(&self, current: &PrintInteriorPdfSettings) -> PrintInteriorPdfSettings {
        let mut resolved = current.clone();
        resolved.chapter_start = self.chapter_start;
        resolved.running_headers = self.running_headers;
        resolved.front_matter_page_numbers = self.front_matter_page_numbers;
        resolved.body_page_numbers = self.body_page_numbers;
        resolved
    }
}

fn variable(
    key: &'static str,
    label: &'static str,
    required: bool,
    multiline: bool,
    default_from: Option<&'static str>,
    default_value: Option<&'static str>,
) -> MatterTemplateVariableDefinition {
    MatterTemplateVariableDefinition {
        key,
        label,
        required,
        multiline,
        default_from,
        default_value,
    }
}

pub(crate) fn matter_template_catalog() -> Vec<MatterTemplateDefinition> {
    vec![
        MatterTemplateDefinition {
            id: TITLE_PAGE_TEMPLATE_ID,
            version: 1,
            label: "Title page",
            output_title: "Title Page",
            description: "Uses the publication title, subtitle, and author metadata.",
            placement: MatterPlacement::Front,
            variables: vec![],
        },
        MatterTemplateDefinition {
            id: "copyright",
            version: 1,
            label: "Copyright",
            output_title: "Copyright",
            description: "A copyright notice with an optional rights statement.",
            placement: MatterPlacement::Front,
            variables: vec![
                variable("year", "Copyright year", true, false, None, None),
                variable(
                    "holder",
                    "Copyright holder",
                    true,
                    false,
                    Some("author"),
                    None,
                ),
                variable(
                    "rights_statement",
                    "Rights statement",
                    false,
                    true,
                    None,
                    Some("All rights reserved."),
                ),
            ],
        },
        MatterTemplateDefinition {
            id: "dedication",
            version: 1,
            label: "Dedication",
            output_title: "Dedication",
            description: "A short dedication set apart in the front matter.",
            placement: MatterPlacement::Front,
            variables: vec![variable("text", "Dedication", true, true, None, None)],
        },
        MatterTemplateDefinition {
            id: "contents",
            version: 1,
            label: "Contents",
            output_title: "Contents",
            description: "A deterministic list of included structural sections.",
            placement: MatterPlacement::Front,
            variables: vec![],
        },
        MatterTemplateDefinition {
            id: "acknowledgements",
            version: 1,
            label: "Acknowledgements",
            output_title: "Acknowledgements",
            description: "Acknowledgements in the back matter.",
            placement: MatterPlacement::Back,
            variables: vec![variable("text", "Acknowledgements", true, true, None, None)],
        },
        MatterTemplateDefinition {
            id: "author_biography",
            version: 1,
            label: "Author biography",
            output_title: "About the Author",
            description: "An About the Author page.",
            placement: MatterPlacement::Back,
            variables: vec![variable("text", "Biography", true, true, None, None)],
        },
        MatterTemplateDefinition {
            id: "also_by",
            version: 1,
            label: "Also By",
            output_title: "Also By",
            description: "One previously published title per line.",
            placement: MatterPlacement::Back,
            variables: vec![variable("titles", "Titles", true, true, None, None)],
        },
    ]
}

pub(crate) fn master_page_catalog() -> Vec<MasterPageDefinition> {
    vec![
        MasterPageDefinition {
            id: PROFILE_DEFAULT_MASTER_PAGE_ID,
            version: 1,
            label: "Profile default",
            description: "Uses the selected format profile and Print Interior controls.",
            settings: None,
            intentional_blank_pages: false,
        },
        MasterPageDefinition {
            id: "classic_book",
            version: 1,
            label: "Classic book",
            description:
                "Recto section starts, intentional blank versos, running heads, and folios.",
            settings: Some(MasterPageSettings {
                chapter_start: ChapterStartSide::Recto,
                running_headers: true,
                front_matter_page_numbers: true,
                body_page_numbers: true,
            }),
            intentional_blank_pages: true,
        },
        MasterPageDefinition {
            id: "minimal_book",
            version: 1,
            label: "Minimal book",
            description: "Next-page starts, no running heads, and body folios only.",
            settings: Some(MasterPageSettings {
                chapter_start: ChapterStartSide::NextPage,
                running_headers: false,
                front_matter_page_numbers: false,
                body_page_numbers: true,
            }),
            intentional_blank_pages: false,
        },
    ]
}

pub(crate) fn resolve_matter_templates(
    selections: &[MatterTemplateSelection],
    metadata: &PublishMetadataOverrides,
) -> Result<Vec<MatterTemplateSelection>, String> {
    let catalog = matter_template_catalog();
    let mut seen = HashSet::new();
    let mut resolved = Vec::with_capacity(selections.len());
    for selection in selections {
        if !seen.insert((selection.template_id.clone(), selection.template_version)) {
            return Err(format!(
                "Matter template {:?} version {} is selected more than once.",
                selection.template_id, selection.template_version
            ));
        }
        let definition = catalog
            .iter()
            .find(|candidate| {
                candidate.id == selection.template_id
                    && candidate.version == selection.template_version
            })
            .ok_or_else(|| {
                format!(
                    "Unknown matter template {:?} version {}.",
                    selection.template_id, selection.template_version
                )
            })?;
        let allowed = definition
            .variables
            .iter()
            .map(|variable| variable.key)
            .collect::<HashSet<_>>();
        if let Some(key) = selection
            .variables
            .keys()
            .find(|key| !allowed.contains(key.as_str()))
        {
            return Err(format!(
                "Matter template {:?} version {} has unknown variable {:?}.",
                selection.template_id, selection.template_version, key
            ));
        }

        let mut variables = BTreeMap::new();
        for variable in &definition.variables {
            let supplied = selection
                .variables
                .get(variable.key)
                .map(|value| value.trim())
                .filter(|value| !value.is_empty());
            let default_from = match variable.default_from {
                Some("title") => Some(metadata.title.trim()),
                Some("subtitle") => metadata.subtitle.as_deref().map(str::trim),
                Some("author") => Some(metadata.author.trim()),
                Some(_) | None => None,
            }
            .filter(|value| !value.is_empty());
            let value = supplied
                .or(default_from)
                .or(variable.default_value)
                .unwrap_or_default();
            if variable.required && value.is_empty() {
                return Err(format!(
                    "Matter template {:?} requires variable {:?}.",
                    definition.label, variable.label
                ));
            }
            if value.chars().count() > 20_000 {
                return Err(format!(
                    "Matter template {:?} variable {:?} is too long.",
                    definition.label, variable.label
                ));
            }
            variables.insert(variable.key.to_string(), value.to_string());
        }
        resolved.push(MatterTemplateSelection {
            template_id: selection.template_id.clone(),
            template_version: selection.template_version,
            variables,
        });
    }
    if !seen.contains(&(TITLE_PAGE_TEMPLATE_ID.to_string(), 1)) {
        resolved.insert(
            0,
            MatterTemplateSelection {
                template_id: TITLE_PAGE_TEMPLATE_ID.to_string(),
                template_version: 1,
                variables: BTreeMap::new(),
            },
        );
    }
    Ok(resolved)
}

pub(crate) fn resolve_master_page(
    selection: &MasterPageSelection,
    current: &PrintInteriorPdfSettings,
) -> Result<PrintInteriorPdfSettings, String> {
    let definition = master_page_catalog()
        .into_iter()
        .find(|candidate| {
            candidate.id == selection.template_id && candidate.version == selection.template_version
        })
        .ok_or_else(|| {
            format!(
                "Unknown master-page template {:?} version {}.",
                selection.template_id, selection.template_version
            )
        })?;
    Ok(definition
        .settings
        .map(|settings| settings.apply_to(current))
        .unwrap_or_else(|| current.clone()))
}

pub(crate) fn apply_matter_templates(
    document: &mut BookDocument,
    selections: &[MatterTemplateSelection],
) -> Result<(), String> {
    if selections.is_empty() {
        return Ok(());
    }
    let catalog = matter_template_catalog();
    let contents = publication_titles(&document.sections);
    let mut front = Vec::new();
    let mut back = Vec::new();
    for selection in selections {
        let definition = catalog
            .iter()
            .find(|candidate| {
                candidate.id == selection.template_id
                    && candidate.version == selection.template_version
            })
            .ok_or_else(|| {
                format!(
                    "Unknown matter template {:?} version {}.",
                    selection.template_id, selection.template_version
                )
            })?;
        let section = render_template(definition, selection, document, &contents)?;
        match definition.placement {
            MatterPlacement::Front => front.push(section),
            MatterPlacement::Back => back.push(section),
        }
    }

    let mut existing_front = Vec::new();
    let mut body = Vec::new();
    let mut existing_back = Vec::new();
    for section in std::mem::take(&mut document.sections) {
        match section.role {
            SectionRole::FrontMatter => existing_front.push(section),
            SectionRole::BackMatter => existing_back.push(section),
            _ => body.push(section),
        }
    }
    front.extend(existing_front);
    back.splice(0..0, existing_back);
    front.extend(body);
    front.extend(back);
    document.sections = front;
    Ok(())
}

pub(crate) fn is_title_page_template_section(section: &BookSection) -> bool {
    section.source_node_id.is_none()
        && section.role == SectionRole::FrontMatter
        && section.title.as_deref() == Some("Title Page")
}

fn render_template(
    definition: &MatterTemplateDefinition,
    selection: &MatterTemplateSelection,
    document: &BookDocument,
    contents: &[String],
) -> Result<BookSection, String> {
    let value = |key: &str| {
        selection
            .variables
            .get(key)
            .map(String::as_str)
            .unwrap_or_default()
    };
    let (title, blocks) = match definition.id {
        TITLE_PAGE_TEMPLATE_ID => {
            let mut blocks = vec![heading(HeadingLevel::H1, &document.metadata.title)];
            if let Some(subtitle) = document
                .metadata
                .subtitle
                .as_deref()
                .filter(|subtitle| !subtitle.trim().is_empty())
            {
                blocks.push(heading(HeadingLevel::H2, subtitle));
            }
            if let Some(author) = document.metadata.contributors.first() {
                blocks.push(paragraph(&author.name, ParagraphAlignment::Center));
            }
            (Some(definition.output_title.to_string()), blocks)
        }
        "copyright" => {
            let notice = format!("Copyright © {} {}.", value("year"), value("holder"));
            let mut blocks = vec![paragraph(&notice, ParagraphAlignment::Start)];
            blocks.extend(paragraphs(
                value("rights_statement"),
                ParagraphAlignment::Start,
            ));
            (Some(definition.output_title.to_string()), blocks)
        }
        "dedication" => (
            Some(definition.output_title.to_string()),
            paragraphs(value("text"), ParagraphAlignment::Center),
        ),
        "contents" => (
            Some(definition.output_title.to_string()),
            vec![Block::BulletList {
                items: contents
                    .iter()
                    .map(|title| ListItem {
                        blocks: vec![paragraph(title, ParagraphAlignment::Start)],
                    })
                    .collect(),
            }],
        ),
        "acknowledgements" => (
            Some(definition.output_title.to_string()),
            paragraphs(value("text"), ParagraphAlignment::Start),
        ),
        "author_biography" => (
            Some(definition.output_title.to_string()),
            paragraphs(value("text"), ParagraphAlignment::Start),
        ),
        "also_by" => (
            Some(definition.output_title.to_string()),
            vec![Block::BulletList {
                items: nonempty_lines(value("titles"))
                    .map(|title| ListItem {
                        blocks: vec![paragraph(title, ParagraphAlignment::Center)],
                    })
                    .collect(),
            }],
        ),
        _ => {
            return Err(format!(
                "No renderer exists for matter template {:?}.",
                definition.id
            ))
        }
    };
    Ok(BookSection {
        source_node_id: None,
        role: match definition.placement {
            MatterPlacement::Front => SectionRole::FrontMatter,
            MatterPlacement::Back => SectionRole::BackMatter,
        },
        title,
        inclusion: SectionInclusion::AllFormats,
        blocks,
        children: vec![],
    })
}

fn publication_titles(sections: &[BookSection]) -> Vec<String> {
    let mut titles = Vec::new();
    for section in sections {
        if matches!(
            section.role,
            SectionRole::Part
                | SectionRole::Chapter
                | SectionRole::Work
                | SectionRole::Installment
                | SectionRole::Volume
        ) && !matches!(section.inclusion, SectionInclusion::Excluded)
        {
            if let Some(title) = section
                .title
                .as_deref()
                .filter(|title| !title.trim().is_empty())
            {
                titles.push(title.to_string());
            }
        }
        titles.extend(publication_titles(&section.children));
    }
    titles
}

fn nonempty_lines(value: &str) -> impl Iterator<Item = &str> {
    value.lines().map(str::trim).filter(|line| !line.is_empty())
}

fn paragraphs(value: &str, alignment: ParagraphAlignment) -> Vec<Block> {
    nonempty_lines(value)
        .map(|line| paragraph(line, alignment.clone()))
        .collect()
}

fn heading(level: HeadingLevel, text: &str) -> Block {
    Block::Heading {
        level,
        inlines: vec![plain_inline(text)],
    }
}

fn paragraph(text: &str, alignment: ParagraphAlignment) -> Block {
    Block::Paragraph {
        inlines: vec![plain_inline(text)],
        style: ParagraphStyle {
            alignment,
            indent_level: 0,
            direction: TextDirection::Auto,
        },
    }
}

fn plain_inline(text: &str) -> Inline {
    Inline::Text {
        text: text.to_string(),
        marks: InlineMarks::default(),
        link: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::publishing::model::{BookContributor, BookMetadata, ContributorRole};

    fn document() -> BookDocument {
        BookDocument {
            metadata: BookMetadata {
                title: "Stable Book".to_string(),
                subtitle: Some("A Fixture".to_string()),
                contributors: vec![BookContributor {
                    name: "A. Writer".to_string(),
                    role: ContributorRole::Author,
                }],
                ..BookMetadata::default()
            },
            sections: vec![BookSection {
                source_node_id: Some(1),
                role: SectionRole::Chapter,
                title: Some("Chapter One".to_string()),
                inclusion: SectionInclusion::AllFormats,
                blocks: vec![paragraph("Body", ParagraphAlignment::Start)],
                children: vec![],
            }],
            assets: vec![],
        }
    }

    #[test]
    fn resolves_defaults_and_rejects_unknown_or_missing_template_inputs() {
        let metadata = PublishMetadataOverrides {
            author: "A. Writer".to_string(),
            ..PublishMetadataOverrides::default()
        };
        let implicit = resolve_matter_templates(&[], &metadata).unwrap();
        assert_eq!(implicit.len(), 1);
        assert_eq!(implicit[0].template_id, TITLE_PAGE_TEMPLATE_ID);
        let resolved = resolve_matter_templates(
            &[MatterTemplateSelection {
                template_id: "copyright".to_string(),
                template_version: 1,
                variables: BTreeMap::from([("year".to_string(), "2026".to_string())]),
            }],
            &metadata,
        )
        .unwrap();
        let copyright = resolved
            .iter()
            .find(|selection| selection.template_id == "copyright")
            .unwrap();
        assert_eq!(copyright.variables["holder"], "A. Writer");
        assert_eq!(
            copyright.variables["rights_statement"],
            "All rights reserved."
        );

        let missing = resolve_matter_templates(
            &[MatterTemplateSelection {
                template_id: "dedication".to_string(),
                template_version: 1,
                variables: BTreeMap::new(),
            }],
            &metadata,
        )
        .unwrap_err();
        assert!(missing.contains("requires variable"));

        let unknown = resolve_master_page(
            &MasterPageSelection {
                template_id: "future_layout".to_string(),
                template_version: 9,
            },
            &PrintInteriorPdfSettings::default(),
        )
        .unwrap_err();
        assert!(unknown.contains("Unknown master-page template"));

        let mut geometry = PrintInteriorPdfSettings::default();
        geometry.gutter_inches = 0.375;
        let classic = resolve_master_page(
            &MasterPageSelection {
                template_id: "classic_book".to_string(),
                template_version: 1,
            },
            &geometry,
        )
        .unwrap();
        assert_eq!(classic.gutter_inches, 0.375);
        assert_eq!(classic.chapter_start, ChapterStartSide::Recto);
    }

    #[test]
    fn compiles_templates_into_deterministic_order_without_replacing_free_text_matter() {
        let mut book = document();
        book.sections.insert(
            0,
            BookSection {
                source_node_id: None,
                role: SectionRole::FrontMatter,
                title: None,
                inclusion: SectionInclusion::AllFormats,
                blocks: vec![paragraph("Legacy preface", ParagraphAlignment::Start)],
                children: vec![],
            },
        );
        let selections = vec![
            MatterTemplateSelection {
                template_id: "dedication".to_string(),
                template_version: 1,
                variables: BTreeMap::from([("text".to_string(), "For the reader".to_string())]),
            },
            MatterTemplateSelection {
                template_id: "contents".to_string(),
                template_version: 1,
                variables: BTreeMap::new(),
            },
            MatterTemplateSelection {
                template_id: "author_biography".to_string(),
                template_version: 1,
                variables: BTreeMap::from([("text".to_string(), "Biography".to_string())]),
            },
        ];
        apply_matter_templates(&mut book, &selections).unwrap();
        assert_eq!(
            book.sections
                .iter()
                .map(|section| section.title.as_deref())
                .collect::<Vec<_>>(),
            vec![
                Some("Dedication"),
                Some("Contents"),
                None,
                Some("Chapter One"),
                Some("About the Author")
            ]
        );
        let repeated = serde_json::to_string_pretty(&book).unwrap();
        let mut second = document();
        second.sections.insert(
            0,
            BookSection {
                source_node_id: None,
                role: SectionRole::FrontMatter,
                title: None,
                inclusion: SectionInclusion::AllFormats,
                blocks: vec![paragraph("Legacy preface", ParagraphAlignment::Start)],
                children: vec![],
            },
        );
        apply_matter_templates(&mut second, &selections).unwrap();
        assert_eq!(serde_json::to_string_pretty(&second).unwrap(), repeated);
    }
}
