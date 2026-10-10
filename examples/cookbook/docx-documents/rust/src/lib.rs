// SPDX-License-Identifier: Apache-2.0
//! Genlib cookbook: create, patch and read DOCX files with `docx-rs` (MIT).
//! Thin wrapper only: docx-rs owns OOXML reading and writing.
//!
//! Note: `read_docx` maps the package into docx-rs's typed model. Re-packing a document
//! produced elsewhere keeps what that model supports (text, tables, styles, numbering,
//! images, headers/footers) but can drop features it does not model. Test with your real
//! templates, or keep templates simple.
//!
//! docx-rs 0.4.22 caveat (observed here): `read_docx` stores text XML-decoded while the
//! writer expects text already escaped (as `Text::new` produces), so re-packing a read
//! document with `&`, `<` or `>` in its text yields invalid XML. `replace_placeholders`
//! re-escapes every text node it visits (body paragraphs and tables); text in headers,
//! footers, hyperlinks or text boxes is not visited.

use std::collections::HashMap;
use std::io::Cursor;

use docx_rs::{
    read_docx, DocumentChild, Docx, Paragraph, ParagraphChild, Run, RunChild, Style, StyleType,
    Table, TableCell, TableCellContent, TableChild, TableRow, TableRowChild, Text,
};

pub type Error = Box<dyn std::error::Error + Send + Sync>;

/// Create a DOCX with a heading, a paragraph and a table (first row = header).
pub fn create_report(title: &str, body: &str, rows: &[Vec<&str>]) -> Result<Vec<u8>, Error> {
    let heading_style = Style::new("Heading1", StyleType::Paragraph)
        .name("Heading 1")
        .size(32)
        .bold();
    let table_rows = rows
        .iter()
        .enumerate()
        .map(|(r, cells)| {
            TableRow::new(
                cells
                    .iter()
                    .map(|text| {
                        let run = Run::new().add_text(*text);
                        let run = if r == 0 { run.bold() } else { run };
                        TableCell::new().add_paragraph(Paragraph::new().add_run(run))
                    })
                    .collect(),
            )
        })
        .collect();
    let mut out = Cursor::new(Vec::new());
    Docx::new()
        .add_style(heading_style)
        .add_paragraph(Paragraph::new().style("Heading1").add_run(Run::new().add_text(title)))
        .add_paragraph(Paragraph::new().add_run(Run::new().add_text(body)))
        .add_table(Table::new(table_rows))
        .build()
        .pack(&mut out)?;
    Ok(out.into_inner())
}

fn run_texts(p: &mut Paragraph) -> Vec<&mut String> {
    let mut texts = Vec::new();
    for child in p.children.iter_mut() {
        if let ParagraphChild::Run(run) = child {
            for rc in run.children.iter_mut() {
                if let RunChild::Text(t) = rc {
                    texts.push(&mut t.text);
                }
            }
        }
    }
    texts
}

fn patch_paragraph(p: &mut Paragraph, tokens: &[(String, &str)]) {
    let mut texts = run_texts(p);
    for text in texts.iter_mut() {
        for (token, value) in tokens {
            if text.contains(token.as_str()) {
                **text = text.replace(token.as_str(), value);
            }
        }
    }
    // Placeholder split across runs: merge text into the first run (its formatting wins).
    let joined: String = texts.iter().map(|t| t.as_str()).collect();
    if tokens.iter().any(|(token, _)| joined.contains(token.as_str())) {
        let mut merged = joined;
        for (token, value) in tokens {
            merged = merged.replace(token.as_str(), value);
        }
        for (i, text) in texts.iter_mut().enumerate() {
            **text = if i == 0 { std::mem::take(&mut merged) } else { String::new() };
        }
    }
    // Writer expects escaped text; the reader produced decoded text (see module docs).
    for text in texts {
        *text = Text::new(std::mem::take(text)).text;
    }
}

fn patch_table(t: &mut Table, tokens: &[(String, &str)]) {
    for TableChild::TableRow(row) in t.rows.iter_mut() {
        for TableRowChild::TableCell(cell) in row.cells.iter_mut() {
            for content in cell.children.iter_mut() {
                match content {
                    TableCellContent::Paragraph(p) => patch_paragraph(p, tokens),
                    TableCellContent::Table(inner) => patch_table(inner, tokens),
                    _ => {}
                }
            }
        }
    }
}

/// Replace `{{key}}` placeholders in body paragraphs and (nested) table cells.
/// Values are XML-escaped with docx-rs's own `Text::new` before writing.
pub fn replace_placeholders(data: &[u8], values: &HashMap<&str, &str>) -> Result<Vec<u8>, Error> {
    let mut doc = read_docx(data)?;
    let tokens: Vec<(String, &str)> = values.iter().map(|(k, v)| (format!("{{{{{k}}}}}"), *v)).collect();
    for child in doc.document.children.iter_mut() {
        match child {
            DocumentChild::Paragraph(p) => patch_paragraph(p, &tokens),
            DocumentChild::Table(t) => patch_table(t, &tokens),
            _ => {}
        }
    }
    let mut out = Cursor::new(Vec::new());
    doc.build().pack(&mut out)?;
    Ok(out.into_inner())
}

fn paragraph_text(p: &Paragraph) -> String {
    let mut s = String::new();
    for child in &p.children {
        if let ParagraphChild::Run(run) = child {
            for rc in &run.children {
                match rc {
                    RunChild::Text(t) => s.push_str(&t.text),
                    RunChild::Tab(_) => s.push('\t'),
                    RunChild::Break(_) => s.push('\n'),
                    _ => {}
                }
            }
        }
    }
    s
}

fn table_lines(t: &Table, lines: &mut Vec<String>) {
    for TableChild::TableRow(row) in &t.rows {
        let cells: Vec<String> = row
            .cells
            .iter()
            .map(|TableRowChild::TableCell(cell)| {
                cell.children
                    .iter()
                    .filter_map(|c| match c {
                        TableCellContent::Paragraph(p) => Some(paragraph_text(p)),
                        _ => None,
                    })
                    .collect::<Vec<_>>()
                    .join(" ")
            })
            .collect();
        lines.push(cells.join("\t"));
    }
}

/// Plain text of body paragraphs and table rows (cells tab-separated), one per line.
pub fn extract_text(data: &[u8]) -> Result<String, Error> {
    let doc = read_docx(data)?;
    let mut lines = Vec::new();
    for child in &doc.document.children {
        match child {
            DocumentChild::Paragraph(p) => lines.push(paragraph_text(p)),
            DocumentChild::Table(t) => table_lines(t, &mut lines),
            _ => {}
        }
    }
    Ok(lines.join("\n"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_replace_extract() {
        let created = create_report(
            "Quarterly report",
            "Prepared for {{customer}}.",
            &[vec!["Item", "Qty"], vec!["Widgets", "3"]],
        )
        .unwrap();
        assert_eq!(&created[..2], b"PK");
        assert!(extract_text(&created).unwrap().contains("{{customer}}"));

        let values = HashMap::from([("customer", "Ada <Lovelace> & Co")]);
        let patched = replace_placeholders(&created, &values).unwrap();
        let text = extract_text(&patched).unwrap();
        assert!(text.contains("Quarterly report"), "{text}");
        assert!(text.contains("Prepared for Ada <Lovelace> & Co."), "{text}");
        assert!(!text.contains("{{customer}}"), "{text}");
        assert!(text.contains("Widgets\t3"), "{text}");
    }

    #[test]
    fn placeholder_split_across_runs() {
        let mut out = Cursor::new(Vec::new());
        Docx::new()
            .add_paragraph(
                Paragraph::new()
                    .add_run(Run::new().add_text("Dear {{cus"))
                    .add_run(Run::new().add_text("tomer"))
                    .add_run(Run::new().add_text("}},")),
            )
            .build()
            .pack(&mut out)
            .unwrap();
        let values = HashMap::from([("customer", "Grace")]);
        let patched = replace_placeholders(&out.into_inner(), &values).unwrap();
        assert!(extract_text(&patched).unwrap().contains("Dear Grace,"));
    }
}
