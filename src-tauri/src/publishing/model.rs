use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct BookDocument {
    pub metadata: BookMetadata,
    pub sections: Vec<BookSection>,
    pub assets: Vec<BookAsset>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct BookMetadata {
    pub title: String,
    pub subtitle: Option<String>,
    pub contributors: Vec<BookContributor>,
    pub language: Option<String>,
    pub series: Option<SeriesMembership>,
    #[serde(default)]
    pub identifier: Option<String>,
    #[serde(default)]
    pub publisher: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub rights: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct BookContributor {
    pub name: String,
    pub role: ContributorRole,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ContributorRole {
    Author,
    Editor,
    Translator,
    Illustrator,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct SeriesMembership {
    pub title: String,
    pub position: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct BookSection {
    pub source_node_id: Option<i64>,
    pub role: SectionRole,
    pub title: Option<String>,
    pub inclusion: SectionInclusion,
    pub blocks: Vec<Block>,
    pub children: Vec<BookSection>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum SectionRole {
    FrontMatter,
    Part,
    Chapter,
    Scene,
    Work,
    Installment,
    Volume,
    BackMatter,
    Unassigned,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub(crate) enum SectionInclusion {
    AllFormats,
    SelectedFormats { formats: Vec<OutputFormat> },
    Excluded,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum OutputFormat {
    Pdf,
    Docx,
    Epub,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub(crate) enum Block {
    Paragraph {
        inlines: Vec<Inline>,
        style: ParagraphStyle,
    },
    Heading {
        level: HeadingLevel,
        inlines: Vec<Inline>,
    },
    OrderedList {
        items: Vec<ListItem>,
    },
    BulletList {
        items: Vec<ListItem>,
    },
    BlockQuote {
        blocks: Vec<Block>,
    },
    SceneBreak {
        style: SceneBreakStyle,
    },
    PageBreak,
    Image {
        asset_id: AssetId,
        alt: Option<String>,
        caption: Option<Vec<Inline>>,
    },
    FootnoteDefinition {
        id: FootnoteId,
        blocks: Vec<Block>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct ListItem {
    pub blocks: Vec<Block>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct ParagraphStyle {
    pub alignment: ParagraphAlignment,
    pub indent_level: u8,
    pub direction: TextDirection,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ParagraphAlignment {
    Start,
    Center,
    End,
    Justify,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum TextDirection {
    Auto,
    LeftToRight,
    RightToLeft,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum HeadingLevel {
    H1,
    H2,
    H3,
    H4,
    H5,
    H6,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub(crate) enum SceneBreakStyle {
    Whitespace,
    Asterisks,
    Custom { marker: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub(crate) enum Inline {
    Text {
        text: String,
        marks: InlineMarks,
        link: Option<LinkTarget>,
    },
    FootnoteReference {
        id: FootnoteId,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct InlineMarks {
    pub bold: bool,
    pub italic: bool,
    pub underline: bool,
    pub strike: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub(crate) struct AssetId(pub String);

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub(crate) struct FootnoteId(pub String);

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub(crate) struct LinkTarget(pub String);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct BookAsset {
    pub id: AssetId,
    pub kind: AssetKind,
    pub media_type: String,
    pub source: AssetSource,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum AssetKind {
    Image,
    CoverImage,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub(crate) enum AssetSource {
    ProjectRelativePath { path: String },
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    fn marks(bold: bool, italic: bool, underline: bool, strike: bool) -> InlineMarks {
        InlineMarks {
            bold,
            italic,
            underline,
            strike,
        }
    }

    fn text(text: &str) -> Inline {
        Inline::Text {
            text: text.to_string(),
            marks: marks(false, false, false, false),
            link: None,
        }
    }

    fn paragraph(text: &str) -> Block {
        Block::Paragraph {
            inlines: vec![self::text(text)],
            style: ParagraphStyle {
                alignment: ParagraphAlignment::Start,
                indent_level: 0,
                direction: TextDirection::Auto,
            },
        }
    }

    fn sample_document() -> BookDocument {
        BookDocument {
            metadata: BookMetadata {
                title: "The Example Book".to_string(),
                subtitle: Some("A Semantic Fixture".to_string()),
                contributors: vec![
                    BookContributor {
                        name: "A. Writer".to_string(),
                        role: ContributorRole::Author,
                    },
                    BookContributor {
                        name: "E. Editor".to_string(),
                        role: ContributorRole::Editor,
                    },
                ],
                language: Some("en-US".to_string()),
                series: Some(SeriesMembership {
                    title: "Example Series".to_string(),
                    position: Some(2),
                }),
                identifier: Some("urn:isbn:9780000000000".to_string()),
                publisher: Some("Example Press".to_string()),
                description: Some("A fixture covering the complete semantic model.".to_string()),
                rights: Some("Copyright A. Writer".to_string()),
            },
            sections: vec![
                BookSection {
                    source_node_id: None,
                    role: SectionRole::FrontMatter,
                    title: Some("Dedication".to_string()),
                    inclusion: SectionInclusion::SelectedFormats {
                        formats: vec![OutputFormat::Pdf, OutputFormat::Epub],
                    },
                    blocks: vec![Block::Paragraph {
                        inlines: vec![text("For everyone who reads fixtures.")],
                        style: ParagraphStyle {
                            alignment: ParagraphAlignment::Center,
                            indent_level: 0,
                            direction: TextDirection::Auto,
                        },
                    }],
                    children: vec![],
                },
                BookSection {
                    source_node_id: Some(1),
                    role: SectionRole::Part,
                    title: Some("Part One".to_string()),
                    inclusion: SectionInclusion::AllFormats,
                    blocks: vec![Block::Heading {
                        level: HeadingLevel::H1,
                        inlines: vec![Inline::Text {
                            text: "Beginnings".to_string(),
                            marks: marks(true, false, false, false),
                            link: None,
                        }],
                    }],
                    children: vec![BookSection {
                        source_node_id: Some(2),
                        role: SectionRole::Chapter,
                        title: Some("Chapter One".to_string()),
                        inclusion: SectionInclusion::AllFormats,
                        blocks: vec![
                            Block::Paragraph {
                                inlines: vec![
                                    Inline::Text {
                                        text: "Linked and marked".to_string(),
                                        marks: marks(true, false, true, false),
                                        link: Some(LinkTarget("https://example.com".to_string())),
                                    },
                                    Inline::Text {
                                        text: " then emphasized".to_string(),
                                        marks: marks(false, true, false, true),
                                        link: None,
                                    },
                                    Inline::FootnoteReference {
                                        id: FootnoteId("note-1".to_string()),
                                    },
                                ],
                                style: ParagraphStyle {
                                    alignment: ParagraphAlignment::Justify,
                                    indent_level: 1,
                                    direction: TextDirection::RightToLeft,
                                },
                            },
                            Block::OrderedList {
                                items: vec![ListItem {
                                    blocks: vec![paragraph("First ordered item")],
                                }],
                            },
                            Block::BulletList {
                                items: vec![ListItem {
                                    blocks: vec![paragraph("First bullet item")],
                                }],
                            },
                            Block::BlockQuote {
                                blocks: vec![paragraph("A quoted paragraph.")],
                            },
                            Block::SceneBreak {
                                style: SceneBreakStyle::Custom {
                                    marker: "§".to_string(),
                                },
                            },
                            Block::PageBreak,
                            Block::Image {
                                asset_id: AssetId("image-1".to_string()),
                                alt: Some("A sample illustration".to_string()),
                                caption: Some(vec![text("Figure one")]),
                            },
                            Block::FootnoteDefinition {
                                id: FootnoteId("note-1".to_string()),
                                blocks: vec![paragraph("The footnote body.")],
                            },
                        ],
                        children: vec![BookSection {
                            source_node_id: Some(3),
                            role: SectionRole::Scene,
                            title: None,
                            inclusion: SectionInclusion::Excluded,
                            blocks: vec![],
                            children: vec![],
                        }],
                    }],
                },
                BookSection {
                    source_node_id: Some(4),
                    role: SectionRole::BackMatter,
                    title: Some("Acknowledgments".to_string()),
                    inclusion: SectionInclusion::SelectedFormats {
                        formats: vec![OutputFormat::Docx],
                    },
                    blocks: vec![],
                    children: vec![],
                },
            ],
            assets: vec![
                BookAsset {
                    id: AssetId("image-1".to_string()),
                    kind: AssetKind::Image,
                    media_type: "image/png".to_string(),
                    source: AssetSource::ProjectRelativePath {
                        path: "assets/illustration.png".to_string(),
                    },
                },
                BookAsset {
                    id: AssetId("cover-1".to_string()),
                    kind: AssetKind::CoverImage,
                    media_type: "image/jpeg".to_string(),
                    source: AssetSource::ProjectRelativePath {
                        path: "assets/cover.jpg".to_string(),
                    },
                },
            ],
        }
    }

    fn minimal_document_value() -> Value {
        json!({
            "metadata": {
                "title": "Untitled",
                "subtitle": null,
                "contributors": [],
                "language": null,
                "series": null,
                "identifier": null,
                "publisher": null,
                "description": null,
                "rights": null
            },
            "sections": [],
            "assets": []
        })
    }

    fn section_value(role: &str, inclusion: Value, blocks: Vec<Value>) -> Value {
        json!({
            "source_node_id": 1,
            "role": role,
            "title": null,
            "inclusion": inclusion,
            "blocks": blocks,
            "children": []
        })
    }

    fn assert_unknown_variant(value: Value, variant: &str) {
        let error = serde_json::from_value::<BookDocument>(value).unwrap_err();
        assert!(
            error.to_string().contains(variant),
            "expected error to name {variant:?}, got {error}"
        );
    }

    #[test]
    fn full_document_matches_golden_snapshot_and_round_trips() {
        let document = sample_document();
        let serialized = serde_json::to_string_pretty(&document).unwrap();
        let golden = include_str!("fixtures/book_document_full.json").trim_end();

        assert_eq!(serialized, golden);

        let deserialized: BookDocument = serde_json::from_str(golden).unwrap();
        assert_eq!(deserialized, document);
    }

    #[test]
    fn minimal_document_has_an_explicit_stable_shape() {
        let document = BookDocument {
            metadata: BookMetadata {
                title: "Untitled".to_string(),
                subtitle: None,
                contributors: vec![],
                language: None,
                series: None,
                ..BookMetadata::default()
            },
            sections: vec![],
            assets: vec![],
        };

        assert_eq!(
            serde_json::to_value(document).unwrap(),
            minimal_document_value()
        );
    }

    #[test]
    fn unknown_enum_variants_are_rejected() {
        let mut unknown_role = minimal_document_value();
        unknown_role["sections"] = json!([section_value(
            "appendix",
            json!({"type": "all_formats"}),
            vec![]
        )]);
        assert_unknown_variant(unknown_role, "appendix");

        let mut unknown_block = minimal_document_value();
        unknown_block["sections"] = json!([section_value(
            "chapter",
            json!({"type": "all_formats"}),
            vec![json!({"type": "table"})]
        )]);
        assert_unknown_variant(unknown_block, "table");

        let mut unknown_format = minimal_document_value();
        unknown_format["sections"] = json!([section_value(
            "chapter",
            json!({"type": "selected_formats", "formats": ["mobi"]}),
            vec![]
        )]);
        assert_unknown_variant(unknown_format, "mobi");

        let mut unknown_asset = minimal_document_value();
        unknown_asset["assets"] = json!([{
            "id": "video-1",
            "kind": "video",
            "media_type": "video/mp4",
            "source": {
                "type": "project_relative_path",
                "path": "assets/video.mp4"
            }
        }]);
        assert_unknown_variant(unknown_asset, "video");
    }
}
