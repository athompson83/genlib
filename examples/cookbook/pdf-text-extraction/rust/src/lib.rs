// SPDX-License-Identifier: Apache-2.0
//! Per-page text and Info metadata over `pdf-extract` (which re-exports lopdf).
//!
//! Image-only pages yield empty strings (OCR is out of scope). Word spacing and
//! reading order follow the content stream, so compare text loosely.

use pdf_extract::{decode_text_string, Document};
use std::collections::BTreeMap;

#[derive(Debug, Default)]
pub struct PdfText {
    pub pages: Vec<String>,
    pub metadata: BTreeMap<String, String>,
}

pub fn extract(bytes: &[u8]) -> Result<PdfText, Box<dyn std::error::Error>> {
    let pages = pdf_extract::extract_text_from_mem_by_pages(bytes)?;
    let doc = Document::load_mem(bytes)?;
    let mut metadata = BTreeMap::new();
    if let Ok(info) = doc
        .trailer
        .get_deref(b"Info", &doc)
        .and_then(|o| o.as_dict())
    {
        for key in ["Title", "Author", "Subject", "Creator", "Producer"] {
            if let Ok(v) = info
                .get_deref(key.as_bytes(), &doc)
                .and_then(decode_text_string)
            {
                if !v.is_empty() {
                    metadata.insert(key.to_string(), v);
                }
            }
        }
    }
    Ok(PdfText { pages, metadata })
}
