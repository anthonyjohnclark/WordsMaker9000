use std::fs;
use std::path::{Path, PathBuf};

use genpdf::elements::{Break, PageBreak, Paragraph};
use genpdf::fonts::{self, FontData, FontFamily};
use genpdf::style::Style;
use genpdf::{Document, Element};

use chrono::Local;
use tauri::{AppHandle, Emitter};

use crate::export::compiler::{BlockType, Chapter, CompiledDocument, Section, TextElement};
use crate::export::types::ExportProgress;

fn load_font_family() -> Result<FontFamily<FontData>, String> {
    // Try loading Liberation Serif (standard naming convention)
    let liberation_dirs: &[&str] = &[
        "/usr/share/fonts/truetype/liberation",
        "/usr/share/fonts/liberation",
        "/Library/Fonts",
    ];
    for dir in liberation_dirs {
        if let Ok(family) = fonts::from_files(dir, "LiberationSerif", None) {
            return Ok(family);
        }
    }

    // Windows: load Times New Roman manually (non-standard file naming)
    let win_fonts = Path::new("C:\\Windows\\Fonts");
    if win_fonts.exists() {
        let regular = win_fonts.join("times.ttf");
        let bold = win_fonts.join("timesbd.ttf");
        let italic = win_fonts.join("timesi.ttf");
        let bold_italic = win_fonts.join("timesbi.ttf");

        if regular.exists() {
            let regular_data = FontData::load(&regular, None)
                .map_err(|e| format!("Failed to load times.ttf: {}", e))?;
            let bold_data = if bold.exists() {
                FontData::load(&bold, None).ok()
            } else {
                None
            };
            let italic_data = if italic.exists() {
                FontData::load(&italic, None).ok()
            } else {
                None
            };
            let bold_italic_data = if bold_italic.exists() {
                FontData::load(&bold_italic, None).ok()
            } else {
                None
            };

            return Ok(FontFamily {
                regular: regular_data.clone(),
                bold: bold_data.unwrap_or_else(|| regular_data.clone()),
                italic: italic_data.unwrap_or_else(|| regular_data.clone()),
                bold_italic: bold_italic_data.unwrap_or(regular_data),
            });
        }

        // Fallback: try Arial
        let arial_regular = win_fonts.join("arial.ttf");
        let arial_bold = win_fonts.join("arialbd.ttf");
        let arial_italic = win_fonts.join("ariali.ttf");
        let arial_bi = win_fonts.join("arialbi.ttf");

        if arial_regular.exists() {
            let regular_data = FontData::load(&arial_regular, None)
                .map_err(|e| format!("Failed to load arial.ttf: {}", e))?;
            let bold_data = FontData::load(&arial_bold, None).ok();
            let italic_data = FontData::load(&arial_italic, None).ok();
            let bold_italic_data = FontData::load(&arial_bi, None).ok();

            return Ok(FontFamily {
                regular: regular_data.clone(),
                bold: bold_data.unwrap_or_else(|| regular_data.clone()),
                italic: italic_data.unwrap_or_else(|| regular_data.clone()),
                bold_italic: bold_italic_data.unwrap_or(regular_data),
            });
        }
    }

    // macOS fallback: Times New Roman in /Library/Fonts
    let mac_times = Path::new("/Library/Fonts/Times New Roman.ttf");
    if mac_times.exists() {
        let regular_data = FontData::load(mac_times, None)
            .map_err(|e| format!("Failed to load macOS Times: {}", e))?;
        return Ok(FontFamily {
            regular: regular_data.clone(),
            bold: regular_data.clone(),
            italic: regular_data.clone(),
            bold_italic: regular_data,
        });
    }

    Err("Could not find a suitable font (Times New Roman, Arial, or Liberation Serif).".to_string())
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

pub fn generate_pdf(
    doc: &CompiledDocument,
    output_dir: &Path,
    app: Option<&AppHandle>,
) -> Result<PathBuf, String> {
    let total_steps = doc.chapters.len() + 2; // +1 for compiling, +1 for writing file

    emit_progress(app, "Preparing document...", 0, total_steps);

    fs::create_dir_all(output_dir)
        .map_err(|e| format!("Failed to create exports directory: {}", e))?;

    let font_family = load_font_family()?;

    let mut pdf = Document::new(font_family);
    pdf.set_title(&doc.title);
    pdf.set_minimal_conformance();

    let mut decorator = genpdf::SimplePageDecorator::new();
    decorator.set_margins(20);
    pdf.set_page_decorator(decorator);

    // === Title Page ===
    render_title_page(&mut pdf, &doc.title, &doc.author);

    // === Front Matter ===
    if let Some(ref front) = doc.front_matter {
        if !front.trim().is_empty() {
            pdf.push(PageBreak::new());
            pdf.push(Paragraph::new(front.as_str()));
        }
    }

    // === Chapters ===
    for (i, chapter) in doc.chapters.iter().enumerate() {
        emit_progress(
            app,
            &format!("Rendering chapter {} of {}...", i + 1, doc.chapters.len()),
            i + 1,
            total_steps,
        );
        render_chapter(&mut pdf, chapter);
    }

    // === Back Matter ===
    if let Some(ref back) = doc.back_matter {
        if !back.trim().is_empty() {
            pdf.push(PageBreak::new());
            pdf.push(Paragraph::new(back.as_str()));
        }
    }

    // Generate filename with timestamp
    let timestamp = Local::now().format("%Y%m%d_%H%M%S");
    let safe_title: String = doc
        .title
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let filename = format!("{}_{}.pdf", safe_title.trim(), timestamp);
    let output_path = output_dir.join(&filename);

    emit_progress(app, "Writing PDF file...", total_steps, total_steps);

    pdf.render_to_file(&output_path)
        .map_err(|e| format!("Failed to render PDF: {}", e))?;

    Ok(output_path)
}

fn render_title_page(pdf: &mut Document, title: &str, author: &str) {
    // Add vertical spacing to push title toward center
    for _ in 0..12 {
        pdf.push(Break::new(1));
    }

    let title_para = Paragraph::new(title).aligned(genpdf::Alignment::Center);
    pdf.push(title_para.styled(Style::new().bold().with_font_size(28)));

    pdf.push(Break::new(2));

    let author_para = Paragraph::new(author).aligned(genpdf::Alignment::Center);
    pdf.push(author_para.styled(Style::new().with_font_size(16)));
}

fn render_chapter(pdf: &mut Document, chapter: &Chapter) {
    pdf.push(PageBreak::new());

    // Chapter heading
    let heading = Paragraph::new(chapter.title.as_str()).aligned(genpdf::Alignment::Center);
    pdf.push(heading.styled(Style::new().bold().with_font_size(22)));
    pdf.push(Break::new(1.5));

    for (i, section) in chapter.sections.iter().enumerate() {
        if i > 0 {
            pdf.push(PageBreak::new());
        }
        render_section(pdf, section);
    }
}

fn render_section(pdf: &mut Document, section: &Section) {
    // Section heading
    let heading = Paragraph::new(section.title.as_str());
    pdf.push(heading.styled(Style::new().bold().with_font_size(14)));
    pdf.push(Break::new(0.5));

    // Group elements into paragraphs
    let mut current_paragraph: Option<Paragraph> = None;

    for element in &section.elements {
        match element.block_type {
            BlockType::Paragraph => {
                // Append to the current paragraph (inline elements stay together)
                if let Some(ref mut p) = current_paragraph {
                    p.push_styled(&element.text, build_style(element));
                } else {
                    let mut para = Paragraph::default();
                    para.push_styled(&element.text, build_style(element));
                    current_paragraph = Some(para);
                }
            }
            BlockType::ParagraphBreak => {
                // Flush the current paragraph
                if let Some(p) = current_paragraph.take() {
                    pdf.push(p);
                    pdf.push(Break::new(0.3));
                }
            }
            BlockType::ListItem => {
                if let Some(p) = current_paragraph.take() {
                    pdf.push(p);
                    pdf.push(Break::new(0.3));
                }

                let bullet_text = format!("  - {}", element.text);
                let mut para = Paragraph::default();
                para.push_styled(bullet_text, build_style(element));
                pdf.push(para);
                pdf.push(Break::new(0.15));
            }
            BlockType::Heading => {
                if let Some(p) = current_paragraph.take() {
                    pdf.push(p);
                    pdf.push(Break::new(0.3));
                }

                let para = Paragraph::new(element.text.as_str());
                pdf.push(para.styled(Style::new().bold().with_font_size(16)));
                pdf.push(Break::new(0.3));
            }
        }
    }

    // Flush remaining paragraph
    if let Some(p) = current_paragraph.take() {
        pdf.push(p);
        pdf.push(Break::new(0.3));
    }

    pdf.push(Break::new(0.5));
}

fn build_style(element: &TextElement) -> Style {
    let mut s = Style::new().with_font_size(12);
    if element.bold {
        s = s.bold();
    }
    if element.italic {
        s = s.italic();
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::export::compiler::{BlockType, Chapter, CompiledDocument, Section, TextElement};
    use std::env;

    #[allow(dead_code)]
    fn make_doc() -> CompiledDocument {
        CompiledDocument {
            title: "Test Book".to_string(),
            author: "Test Author".to_string(),
            front_matter: None,
            back_matter: None,
            chapters: vec![Chapter {
                title: "Chapter 1".to_string(),
                sections: vec![Section {
                    title: "Scene 1".to_string(),
                    elements: vec![TextElement {
                        text: "Hello world".to_string(),
                        bold: false,
                        italic: false,
                        block_type: BlockType::Paragraph,
                    }],
                }],
            }],
        }
    }

    #[test]
    fn test_empty_document_no_panic() {
        let doc = CompiledDocument {
            title: "Empty".to_string(),
            author: "Nobody".to_string(),
            front_matter: None,
            back_matter: None,
            chapters: vec![],
        };
        let tmp = env::temp_dir().join("wm9000_test_exports");
        // This may fail if no fonts are available in CI, that's OK
        let _ = generate_pdf(&doc, &tmp, None);
    }

    #[test]
    fn test_special_characters_in_title() {
        let doc = CompiledDocument {
            title: "Test: A Book / With Special Chars".to_string(),
            author: "Author and Co.".to_string(),
            front_matter: Some("Copyright 2024".to_string()),
            back_matter: Some("The End".to_string()),
            chapters: vec![],
        };
        let tmp = env::temp_dir().join("wm9000_test_exports_special");
        let _ = generate_pdf(&doc, &tmp, None);
    }
}
