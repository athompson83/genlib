// SPDX-License-Identifier: Apache-2.0

//! JSON-LD `<script>` blocks and HTML meta / Open Graph / Twitter tags.
//! Standard library only. JSON output escapes `<`, `>`, `&`, U+2028 and
//! U+2029 so a value cannot close the script element.

use std::fmt;

const TWITTER_CARDS: [&str; 4] = ["summary", "summary_large_image", "app", "player"];
const MAX_DEPTH: usize = 64;

/// Validation error with a human-readable message.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StructuredDataError(pub String);

impl fmt::Display for StructuredDataError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for StructuredDataError {}

fn err<T>(message: impl Into<String>) -> Result<T, StructuredDataError> {
    Err(StructuredDataError(message.into()))
}

/// A JSON value. `Object` keeps keys in insertion order.
#[derive(Clone, Debug, PartialEq)]
pub enum Json {
    Null,
    Bool(bool),
    Int(i64),
    Num(f64),
    Str(String),
    Array(Vec<Json>),
    Object(Vec<(String, Json)>),
}

impl Json {
    /// Builds an object from `(key, value)` pairs, preserving their order.
    pub fn object<K: Into<String>>(pairs: Vec<(K, Json)>) -> Json {
        Json::Object(pairs.into_iter().map(|(k, v)| (k.into(), v)).collect())
    }

    /// Builds a string value.
    pub fn str(value: &str) -> Json {
        Json::Str(value.to_string())
    }
}

fn write_string(out: &mut String, value: &str) {
    out.push('"');
    for c in value.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            '<' | '>' | '&' | '\u{2028}' | '\u{2029}' => out.push_str(&format!("\\u{:04x}", c as u32)),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
}

fn write_number(out: &mut String, n: f64) -> Result<(), StructuredDataError> {
    if !n.is_finite() {
        return err("JSON numbers must be finite (NaN and Infinity are not allowed)");
    }
    if n.fract() == 0.0 && n.abs() < 9_007_199_254_740_992.0 {
        out.push_str(&(n as i64).to_string());
    } else {
        out.push_str(&n.to_string());
    }
    Ok(())
}

fn write_json(out: &mut String, value: &Json, depth: usize) -> Result<(), StructuredDataError> {
    if depth > MAX_DEPTH {
        return err(format!("JSON nesting exceeds {MAX_DEPTH} levels"));
    }
    match value {
        Json::Null => out.push_str("null"),
        Json::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Json::Int(i) => out.push_str(&i.to_string()),
        Json::Num(n) => write_number(out, *n)?,
        Json::Str(s) => write_string(out, s),
        Json::Array(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_json(out, item, depth + 1)?;
            }
            out.push(']');
        }
        Json::Object(pairs) => {
            out.push('{');
            for (i, (k, v)) in pairs.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_string(out, k);
                out.push(':');
                write_json(out, v, depth + 1)?;
            }
            out.push('}');
        }
    }
    Ok(())
}

/// Serializes `value` to compact, script-safe JSON (no wrapper).
pub fn to_safe_json(value: &Json) -> Result<String, StructuredDataError> {
    let mut out = String::new();
    write_json(&mut out, value, 0)?;
    Ok(out)
}

/// Returns `<script type="application/ld+json">…</script>` for an object or array.
pub fn json_ld_script(value: &Json) -> Result<String, StructuredDataError> {
    if !matches!(value, Json::Object(_) | Json::Array(_)) {
        return err("JSON-LD must be an object or an array");
    }
    Ok(format!("<script type=\"application/ld+json\">{}</script>", to_safe_json(value)?))
}

/// Page metadata. Empty `og_type` / `twitter_card` use their defaults.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Meta<'a> {
    pub title: &'a str,
    pub description: Option<&'a str>,
    pub canonical: Option<&'a str>,
    pub image: Option<&'a str>,
    pub site_name: Option<&'a str>,
    /// Defaults to `website`.
    pub og_type: Option<&'a str>,
    /// Defaults to `summary_large_image`.
    pub twitter_card: Option<&'a str>,
    pub locale: Option<&'a str>,
}

/// Escapes `& < > "` for HTML text and attribute values.
pub fn html_escape(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for c in value.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            _ => out.push(c),
        }
    }
    out
}

fn require_https(field: &str, value: &str) -> Result<(), StructuredDataError> {
    let ok = value.len() > 8
        && value[..8].eq_ignore_ascii_case("https://")
        && !matches!(value.as_bytes()[8], b'/' | b'?' | b'#')
        && !value.chars().any(|c| c.is_whitespace() || c.is_control());
    if ok {
        Ok(())
    } else {
        err(format!("{field} must be an absolute https URL: {value:?}"))
    }
}

/// Renders title, description, canonical, Open Graph and Twitter tags,
/// joined by `\n` without a trailing newline. Absent values are omitted.
pub fn meta_tags(meta: &Meta) -> Result<String, StructuredDataError> {
    if meta.title.trim().is_empty() {
        return err("title must not be empty");
    }
    if let Some(c) = meta.canonical {
        require_https("canonical", c)?;
    }
    if let Some(i) = meta.image {
        require_https("image", i)?;
    }
    let og_type = meta.og_type.unwrap_or("website");
    if og_type.trim().is_empty() {
        return err("type must not be empty");
    }
    let card = meta.twitter_card.unwrap_or("summary_large_image");
    if !TWITTER_CARDS.contains(&card) {
        return err(format!("twitterCard must be one of {}: {card:?}", TWITTER_CARDS.join(", ")));
    }
    let t = html_escape(meta.title);
    let mut lines = vec![format!("<title>{t}</title>")];
    let name = |n: &str, v: &str| format!("<meta name=\"{n}\" content=\"{}\">", html_escape(v));
    let prop = |p: &str, v: &str| format!("<meta property=\"{p}\" content=\"{}\">", html_escape(v));
    if let Some(d) = meta.description {
        lines.push(name("description", d));
    }
    if let Some(c) = meta.canonical {
        lines.push(format!("<link rel=\"canonical\" href=\"{}\">", html_escape(c)));
    }
    lines.push(prop("og:title", meta.title));
    let optional_props = [
        ("og:description", meta.description),
        ("og:url", meta.canonical),
        ("og:image", meta.image),
        ("og:site_name", meta.site_name),
        ("og:type", Some(og_type)),
        ("og:locale", meta.locale),
    ];
    for (p, v) in optional_props {
        if let Some(v) = v {
            lines.push(prop(p, v));
        }
    }
    lines.push(name("twitter:card", card));
    lines.push(name("twitter:title", meta.title));
    if let Some(d) = meta.description {
        lines.push(name("twitter:description", d));
    }
    if let Some(i) = meta.image {
        lines.push(name("twitter:image", i));
    }
    Ok(lines.join("\n"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn json_ld_vector() {
        let org = Json::object(vec![
            ("@context", Json::str("https://schema.org")),
            ("@type", Json::str("Organization")),
            ("name", Json::str("A&B </script>")),
            ("url", Json::str("https://ab.example")),
            ("sameAs", Json::Array(vec![Json::str("https://x.com/ab")])),
        ]);
        let want = "<script type=\"application/ld+json\">{\"@context\":\"https://schema.org\",\"@type\":\"Organization\",\"name\":\"A\\u0026B \\u003c/script\\u003e\",\"url\":\"https://ab.example\",\"sameAs\":[\"https://x.com/ab\"]}</script>";
        assert_eq!(json_ld_script(&org).unwrap(), want);
    }

    #[test]
    fn json_types_and_rejections() {
        let v = Json::object(vec![
            ("n", Json::Null),
            ("t", Json::Bool(true)),
            ("i", Json::Int(-3)),
            ("f", Json::Num(2.0)),
            ("g", Json::Num(4.5)),
            ("s", Json::str("q\"\\\n\u{1}\u{2028}\u{2029}é")),
            ("o", Json::object(vec![("a", Json::Array(vec![]))])),
        ]);
        assert_eq!(
            to_safe_json(&v).unwrap(),
            "{\"n\":null,\"t\":true,\"i\":-3,\"f\":2,\"g\":4.5,\"s\":\"q\\\"\\\\\\n\\u0001\\u2028\\u2029é\",\"o\":{\"a\":[]}}"
        );
        assert!(json_ld_script(&Json::object(vec![("x", Json::Num(f64::NAN))])).is_err());
        assert!(json_ld_script(&Json::object(vec![("x", Json::Num(f64::INFINITY))])).is_err());
        assert!(json_ld_script(&Json::str("x")).is_err());
        let mut deep = Json::Null;
        for _ in 0..100 {
            deep = Json::Array(vec![deep]);
        }
        assert!(json_ld_script(&deep).is_err());
    }

    #[test]
    fn meta_vector() {
        let meta = Meta {
            title: "Tom & \"Jerry\"",
            description: Some("Cat <3 mouse"),
            canonical: Some("https://ex.com/tj"),
            image: Some("https://ex.com/tj.png"),
            site_name: Some("Ex"),
            ..Default::default()
        };
        let want = "<title>Tom &amp; &quot;Jerry&quot;</title>\n<meta name=\"description\" content=\"Cat &lt;3 mouse\">\n<link rel=\"canonical\" href=\"https://ex.com/tj\">\n<meta property=\"og:title\" content=\"Tom &amp; &quot;Jerry&quot;\">\n<meta property=\"og:description\" content=\"Cat &lt;3 mouse\">\n<meta property=\"og:url\" content=\"https://ex.com/tj\">\n<meta property=\"og:image\" content=\"https://ex.com/tj.png\">\n<meta property=\"og:site_name\" content=\"Ex\">\n<meta property=\"og:type\" content=\"website\">\n<meta name=\"twitter:card\" content=\"summary_large_image\">\n<meta name=\"twitter:title\" content=\"Tom &amp; &quot;Jerry&quot;\">\n<meta name=\"twitter:description\" content=\"Cat &lt;3 mouse\">\n<meta name=\"twitter:image\" content=\"https://ex.com/tj.png\">";
        assert_eq!(meta_tags(&meta).unwrap(), want);
    }

    #[test]
    fn meta_title_only_and_rejections() {
        let only = meta_tags(&Meta { title: "T", ..Default::default() }).unwrap();
        assert_eq!(
            only,
            "<title>T</title>\n<meta property=\"og:title\" content=\"T\">\n<meta property=\"og:type\" content=\"website\">\n<meta name=\"twitter:card\" content=\"summary_large_image\">\n<meta name=\"twitter:title\" content=\"T\">"
        );
        assert_eq!(only.lines().count(), 5);
        let locale = meta_tags(&Meta { title: "T", locale: Some("en_US"), ..Default::default() }).unwrap();
        assert!(locale.contains("<meta property=\"og:type\" content=\"website\">\n<meta property=\"og:locale\" content=\"en_US\">"));
        assert!(meta_tags(&Meta { title: "T", canonical: Some("http://ex.com"), ..Default::default() }).is_err());
        assert!(meta_tags(&Meta { title: "T", image: Some("/x.png"), ..Default::default() }).is_err());
        assert!(meta_tags(&Meta { title: "T", twitter_card: Some("big"), ..Default::default() }).is_err());
        assert!(meta_tags(&Meta { title: " ", ..Default::default() }).is_err());
    }
}
