// SPDX-License-Identifier: Apache-2.0
// Builds a two-page PDF with lopdf (re-exported by pdf-extract) and checks extraction.

use genlib_cookbook_pdf_text::extract;
use pdf_extract::content::{Content, Operation};
use pdf_extract::{dictionary, text_string, Document, Object, Stream};

fn make_pdf() -> Vec<u8> {
    let mut doc = Document::with_version("1.5");
    let pages_id = doc.new_object_id();
    let font = doc.add_object(
        dictionary! {"Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Helvetica"},
    );
    let resources = doc.add_object(dictionary! {"Font" => dictionary! {"F1" => font}});
    let mut kids = Vec::new();
    for text in ["Hello from page one", "Second page text"] {
        let content = Content {
            operations: vec![
                Operation::new("BT", vec![]),
                Operation::new("Tf", vec!["F1".into(), 14.into()]),
                Operation::new("Td", vec![72.into(), 700.into()]),
                Operation::new("Tj", vec![Object::string_literal(text)]),
                Operation::new("ET", vec![]),
            ],
        };
        let stream = doc.add_object(Stream::new(dictionary! {}, content.encode().unwrap()));
        let page = doc.add_object(dictionary! {
            "Type" => "Page", "Parent" => pages_id, "Contents" => stream, "Resources" => resources,
            "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()],
        });
        kids.push(Object::from(page));
    }
    doc.objects.insert(
        pages_id,
        Object::Dictionary(
            dictionary! {"Type" => "Pages", "Count" => kids.len() as i64, "Kids" => kids},
        ),
    );
    let catalog = doc.add_object(dictionary! {"Type" => "Catalog", "Pages" => pages_id});
    let info = doc.add_object(
        dictionary! {"Title" => text_string("Cookbook Fixture"), "Author" => text_string("Genlib")},
    );
    doc.trailer.set("Root", catalog);
    doc.trailer.set("Info", info);
    let mut out = Vec::new();
    doc.save_to(&mut out).unwrap();
    out
}

#[test]
fn extracts_pages_and_metadata() {
    let res = extract(&make_pdf()).unwrap();
    assert_eq!(res.pages.len(), 2);
    assert!(
        res.pages[0].contains("Hello from page one"),
        "{:?}",
        res.pages[0]
    );
    assert!(!res.pages[0].contains("Second"));
    assert!(
        res.pages[1].contains("Second page text"),
        "{:?}",
        res.pages[1]
    );
    assert_eq!(res.metadata["Title"], "Cookbook Fixture");
    assert_eq!(res.metadata["Author"], "Genlib");
}

#[test]
fn rejects_garbage() {
    assert!(extract(b"not a pdf").is_err());
}
