// SPDX-License-Identifier: Apache-2.0
//! Object-level AcroForm helpers over `lopdf`: list fields and fill them by name.
//!
//! lopdf is a PDF object library, not a form engine: it does not generate
//! appearance streams or flatten. `fill` therefore sets `/NeedAppearances true`
//! so conforming viewers regenerate text appearances, and toggles existing
//! checkbox appearance states (`/AS`). Flattening is not offered here.

use lopdf::{decode_text_string, text_string, Dictionary, Document, Object, ObjectId};
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FieldKind {
    Text,
    Checkbox,
    Radio,
    Choice,
    Signature,
    Other,
}

#[derive(Debug, Clone, PartialEq)]
pub struct FormField {
    pub id: ObjectId,
    /// Fully qualified name (partial names joined with '.').
    pub name: String,
    pub kind: FieldKind,
    pub value: Option<String>,
    /// Choice options, or checkbox/radio "on" state names.
    pub options: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum FieldValue {
    Text(String),
    Bool(bool),
}

#[derive(Debug)]
pub enum FormError {
    Pdf(lopdf::Error),
    NoForm,
    UnknownField(String),
    InvalidValue(String),
}

impl fmt::Display for FormError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            FormError::Pdf(e) => write!(f, "pdf error: {e}"),
            FormError::NoForm => write!(f, "document has no AcroForm"),
            FormError::UnknownField(n) => write!(f, "unknown form field: {n}"),
            FormError::InvalidValue(m) => write!(f, "invalid value: {m}"),
        }
    }
}
impl std::error::Error for FormError {}
impl From<lopdf::Error> for FormError {
    fn from(e: lopdf::Error) -> Self {
        FormError::Pdf(e)
    }
}

fn acroform(doc: &Document) -> Result<&Dictionary, FormError> {
    let obj = doc
        .catalog()?
        .get(b"AcroForm")
        .map_err(|_| FormError::NoForm)?;
    Ok(doc.dereference(obj)?.1.as_dict()?)
}

fn name_of(o: &Object) -> Option<String> {
    o.as_name()
        .ok()
        .map(|n| String::from_utf8_lossy(n).into_owned())
}

/// Widget annotations of a terminal field: itself, or its kids without /T.
fn widgets(doc: &Document, id: ObjectId) -> Vec<ObjectId> {
    let Ok(dict) = doc.get_dictionary(id) else {
        return vec![];
    };
    match dict.get(b"Kids").and_then(Object::as_array) {
        Ok(kids) => kids.iter().filter_map(|k| k.as_reference().ok()).collect(),
        Err(_) => vec![id],
    }
}

fn on_states(doc: &Document, id: ObjectId) -> Vec<String> {
    let mut out = Vec::new();
    for w in widgets(doc, id) {
        let Ok(wd) = doc.get_dictionary(w) else {
            continue;
        };
        let normal = wd
            .get_deref(b"AP", doc)
            .and_then(Object::as_dict)
            .and_then(|ap| ap.get_deref(b"N", doc))
            .and_then(Object::as_dict);
        if let Ok(n) = normal {
            for (k, _) in n.iter() {
                let s = String::from_utf8_lossy(k).into_owned();
                if s != "Off" && !out.contains(&s) {
                    out.push(s);
                }
            }
        }
    }
    out
}

fn collect(
    doc: &Document,
    id: ObjectId,
    prefix: &str,
    ft: Option<Vec<u8>>,
    ff: i64,
    out: &mut Vec<FormField>,
) -> Result<(), FormError> {
    let dict = doc.get_dictionary(id)?;
    let partial = dict.get(b"T").ok().and_then(|t| decode_text_string(t).ok());
    let name = match (&partial, prefix.is_empty()) {
        (Some(p), true) => p.clone(),
        (Some(p), false) => format!("{prefix}.{p}"),
        (None, _) => prefix.to_string(),
    };
    let ft = dict
        .get(b"FT")
        .ok()
        .and_then(|o| o.as_name().ok())
        .map(<[u8]>::to_vec)
        .or(ft);
    let ff = dict.get(b"Ff").and_then(Object::as_i64).unwrap_or(ff);

    let child_fields: Vec<ObjectId> = dict
        .get(b"Kids")
        .and_then(Object::as_array)
        .map(|kids| {
            kids.iter()
                .filter_map(|k| k.as_reference().ok())
                .filter(|k| doc.get_dictionary(*k).map(|d| d.has(b"T")).unwrap_or(false))
                .collect()
        })
        .unwrap_or_default();
    if !child_fields.is_empty() {
        for kid in child_fields {
            collect(doc, kid, &name, ft.clone(), ff, out)?;
        }
        return Ok(());
    }

    let kind = match ft.as_deref() {
        Some(b"Tx") => FieldKind::Text,
        Some(b"Ch") => FieldKind::Choice,
        Some(b"Sig") => FieldKind::Signature,
        Some(b"Btn") if ff & (1 << 16) != 0 => FieldKind::Other, // push button
        Some(b"Btn") if ff & (1 << 15) != 0 => FieldKind::Radio,
        Some(b"Btn") => FieldKind::Checkbox,
        _ => FieldKind::Other,
    };
    let value = dict
        .get_deref(b"V", doc)
        .ok()
        .and_then(|v| name_of(v).or_else(|| decode_text_string(v).ok()));
    let options = match kind {
        FieldKind::Choice => dict
            .get_deref(b"Opt", doc)
            .and_then(Object::as_array)
            .map(|opts| {
                opts.iter()
                    .filter_map(|o| match o {
                        Object::Array(pair) => {
                            pair.first().and_then(|e| decode_text_string(e).ok())
                        }
                        other => decode_text_string(other).ok(),
                    })
                    .collect()
            })
            .unwrap_or_default(),
        FieldKind::Checkbox | FieldKind::Radio => on_states(doc, id),
        _ => vec![],
    };
    out.push(FormField {
        id,
        name,
        kind,
        value,
        options,
    });
    Ok(())
}

/// List terminal AcroForm fields.
pub fn list_fields(doc: &Document) -> Result<Vec<FormField>, FormError> {
    let form = acroform(doc)?;
    let roots: Vec<ObjectId> = form
        .get_deref(b"Fields", doc)
        .and_then(Object::as_array)
        .map(|a| a.iter().filter_map(|o| o.as_reference().ok()).collect())
        .unwrap_or_default();
    let mut out = Vec::new();
    for id in roots {
        collect(doc, id, "", None, 0, &mut out)?;
    }
    Ok(out)
}

/// Fill fields by fully qualified name. Unknown names and invalid options fail
/// before anything is modified.
pub fn fill(doc: &mut Document, values: &[(&str, FieldValue)]) -> Result<(), FormError> {
    let fields = list_fields(doc)?;
    let mut plan: Vec<(FormField, Object)> = Vec::new();
    for (name, value) in values {
        let field = fields
            .iter()
            .find(|f| f.name == *name)
            .ok_or_else(|| FormError::UnknownField(name.to_string()))?;
        let v = match (field.kind, value) {
            (FieldKind::Text, FieldValue::Text(s)) => text_string(s),
            (FieldKind::Choice, FieldValue::Text(s)) => {
                if !field.options.is_empty() && !field.options.contains(s) {
                    return Err(FormError::InvalidValue(format!(
                        "{s} is not an option of {name}"
                    )));
                }
                text_string(s)
            }
            (FieldKind::Checkbox, FieldValue::Bool(on)) => {
                let state = if *on {
                    field
                        .options
                        .first()
                        .cloned()
                        .unwrap_or_else(|| "Yes".into())
                } else {
                    "Off".into()
                };
                Object::Name(state.into_bytes())
            }
            (FieldKind::Radio, FieldValue::Text(s)) if field.options.contains(s) => {
                Object::Name(s.clone().into_bytes())
            }
            _ => {
                return Err(FormError::InvalidValue(format!(
                    "{value:?} for {:?} field {name}",
                    field.kind
                )))
            }
        };
        plan.push((field.clone(), v));
    }

    for (field, v) in plan {
        if let Object::Name(state) = &v {
            for w in widgets(doc, field.id) {
                let has_state = on_states(doc, w)
                    .iter()
                    .any(|s| s.as_bytes() == state.as_slice());
                let wd = doc.get_dictionary_mut(w)?;
                let as_state = if has_state {
                    state.clone()
                } else {
                    b"Off".to_vec()
                };
                wd.set("AS", Object::Name(as_state));
            }
        }
        doc.get_dictionary_mut(field.id)?.set("V", v);
    }

    // Ask viewers to regenerate appearances (lopdf does not draw them).
    let form_obj = doc.catalog()?.get(b"AcroForm")?.clone();
    match form_obj {
        Object::Reference(id) => doc.get_dictionary_mut(id)?.set("NeedAppearances", true),
        _ => {
            let catalog = doc.catalog_mut()?;
            if let Ok(Object::Dictionary(d)) = catalog.get_mut(b"AcroForm") {
                d.set("NeedAppearances", true);
            }
        }
    }
    Ok(())
}

/// Convenience: load bytes, fill, save to bytes.
pub fn fill_bytes(src: &[u8], values: &[(&str, FieldValue)]) -> Result<Vec<u8>, FormError> {
    let mut doc = Document::load_mem(src)?;
    fill(&mut doc, values)?;
    let mut out = Vec::new();
    doc.save_to(&mut out)
        .map_err(|e| FormError::Pdf(e.into()))?;
    Ok(out)
}
