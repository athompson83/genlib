// SPDX-License-Identifier: Apache-2.0
// Builds an AcroForm with lopdf objects at test time, fills it, reads it back.

use genlib_cookbook_pdf_forms::{fill_bytes, list_fields, FieldKind, FieldValue, FormError};
use lopdf::{dictionary, text_string, Document, Object, Stream};

fn make_form() -> Vec<u8> {
    let mut doc = Document::with_version("1.7");
    let pages_id = doc.new_object_id();
    let page_id = doc.new_object_id();
    let on = doc.add_object(Stream::new(dictionary! {"Type" => "XObject", "Subtype" => "Form", "BBox" => vec![0.into(), 0.into(), 12.into(), 12.into()]}, b"0 0 12 12 re f".to_vec()));
    let off = doc.add_object(Stream::new(dictionary! {"Type" => "XObject", "Subtype" => "Form", "BBox" => vec![0.into(), 0.into(), 12.into(), 12.into()]}, Vec::new()));
    let rect = |x: i64, y: i64, w: i64, h: i64| -> Object {
        vec![x.into(), y.into(), (x + w).into(), (y + h).into()].into()
    };
    let name = doc.add_object(dictionary! {
        "Type" => "Annot", "Subtype" => "Widget", "FT" => "Tx", "T" => text_string("name"),
        "Rect" => rect(50, 220, 200, 20), "P" => page_id, "DA" => Object::string_literal("/Helv 12 Tf 0 g"),
    });
    let subscribe = doc.add_object(dictionary! {
        "Type" => "Annot", "Subtype" => "Widget", "FT" => "Btn", "T" => text_string("subscribe"),
        "Rect" => rect(50, 180, 12, 12), "P" => page_id, "V" => "Off", "AS" => "Off",
        "AP" => dictionary! {"N" => dictionary! {"Yes" => on, "Off" => off}},
    });
    let plan = doc.add_object(dictionary! {
        "Type" => "Annot", "Subtype" => "Widget", "FT" => "Ch", "Ff" => 1i64 << 17, "T" => text_string("plan"),
        "Rect" => rect(50, 140, 120, 20), "P" => page_id, "V" => text_string("free"),
        "Opt" => vec![text_string("free"), text_string("pro"), text_string("team")],
        "DA" => Object::string_literal("/Helv 12 Tf 0 g"),
    });
    doc.objects.insert(
        page_id,
        Object::Dictionary(dictionary! {
            "Type" => "Page", "Parent" => pages_id, "MediaBox" => rect(0, 0, 400, 300),
            "Annots" => vec![name.into(), subscribe.into(), plan.into()],
        }),
    );
    doc.objects.insert(
        pages_id,
        Object::Dictionary(
            dictionary! {"Type" => "Pages", "Kids" => vec![page_id.into()], "Count" => 1},
        ),
    );
    let helv = doc.add_object(
        dictionary! {"Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Helvetica"},
    );
    let form = doc.add_object(dictionary! {
        "Fields" => vec![name.into(), subscribe.into(), plan.into()],
        "DA" => Object::string_literal("/Helv 12 Tf 0 g"),
        "DR" => dictionary! {"Font" => dictionary! {"Helv" => helv}},
    });
    let catalog =
        doc.add_object(dictionary! {"Type" => "Catalog", "Pages" => pages_id, "AcroForm" => form});
    doc.trailer.set("Root", catalog);
    let mut out = Vec::new();
    doc.save_to(&mut out).unwrap();
    out
}

fn get(bytes: &[u8], name: &str) -> genlib_cookbook_pdf_forms::FormField {
    let doc = Document::load_mem(bytes).unwrap();
    list_fields(&doc)
        .unwrap()
        .into_iter()
        .find(|f| f.name == name)
        .unwrap()
}

#[test]
fn lists_fields() {
    let src = make_form();
    assert_eq!(get(&src, "name").kind, FieldKind::Text);
    let cb = get(&src, "subscribe");
    assert_eq!(cb.kind, FieldKind::Checkbox);
    assert_eq!(cb.options, vec!["Yes".to_string()]);
    assert_eq!(get(&src, "plan").options, vec!["free", "pro", "team"]);
}

#[test]
fn fills_and_reads_back() {
    let out = fill_bytes(
        &make_form(),
        &[
            ("name", FieldValue::Text("Ada Lovelace".into())),
            ("subscribe", FieldValue::Bool(true)),
            ("plan", FieldValue::Text("pro".into())),
        ],
    )
    .unwrap();
    assert_eq!(get(&out, "name").value.as_deref(), Some("Ada Lovelace"));
    assert_eq!(get(&out, "subscribe").value.as_deref(), Some("Yes"));
    assert_eq!(get(&out, "plan").value.as_deref(), Some("pro"));
    let doc = Document::load_mem(&out).unwrap();
    let w = doc.get_dictionary(get(&out, "subscribe").id).unwrap();
    assert_eq!(w.get(b"AS").unwrap().as_name().unwrap(), b"Yes");
}

#[test]
fn rejects_unknown_and_invalid() {
    let src = make_form();
    assert!(matches!(
        fill_bytes(&src, &[("nmae", FieldValue::Text("x".into()))]),
        Err(FormError::UnknownField(_))
    ));
    assert!(matches!(
        fill_bytes(&src, &[("plan", FieldValue::Text("enterprise".into()))]),
        Err(FormError::InvalidValue(_))
    ));
}
