// SPDX-License-Identifier: Apache-2.0

//! A logic-less Mustache subset over the [`Json`] value type of the
//! `json_patch` module:
//!
//! - `{{ path }}`: value at a dotted path (names and `[n]`), HTML-escaped
//!   (`& < > " '`) when `escape` is true; `{{{ path }}}` is always raw.
//! - `{{# path }}...{{/ path }}`: once per list item (`.` is the item; lookups
//!   try the item, then outer scopes) or once for another truthy value (an
//!   object value becomes the inner scope).
//! - `{{^ path }}...{{/ path }}`: rendered when the value is missing or falsy.
//! - `{{! comment }}` is dropped.
//!
//! Missing values and null render as "", booleans as true/false, whole
//! numbers without a decimal point and other numbers in shortest round-trip
//! form. Lists and objects cannot be rendered as values. No partials, custom
//! delimiters or lambdas.

use crate::json_patch::Json;
use std::fmt;

/// Malformed template or an unrenderable value.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TemplateError(pub String);

impl fmt::Display for TemplateError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "template: {}", self.0)
    }
}

impl std::error::Error for TemplateError {}

fn err<T>(m: impl Into<String>) -> Result<T, TemplateError> {
    Err(TemplateError(m.into()))
}

/// Python `str.isspace` (Unicode White_Space plus U+001C..U+001F).
fn is_space(c: char) -> bool {
    c.is_whitespace() || ('\u{1c}'..='\u{1f}').contains(&c)
}

enum Node {
    Text(String),
    Var(String),
    Raw(String),
    Section(String, Vec<Node>),
    Inverted(String, Vec<Node>),
}

struct Tag<'a> {
    start: usize,
    end: usize,
    triple: bool,
    close: bool,
    sig: Option<u8>,
    name: &'a str,
}

/// Finds the next tag at or after `pos`, mirroring the reference regex
/// `\{\{(\{)?\s*([#^/!]?)\s*(.*?)\s*(\})?\}\}` (dot matches newlines).
fn next_tag(t: &str, pos: usize) -> Option<Tag<'_>> {
    let start = pos + t[pos..].find("{{")?;
    let b = t.as_bytes();
    let mut i = start + 2;
    let triple = b.get(i) == Some(&b'{');
    if triple {
        i += 1;
    }
    let skip = |i: usize| i + t[i..].find(|c: char| !is_space(c)).unwrap_or(t.len() - i);
    i = skip(i);
    let mut sig = None;
    if let Some(&c) = b.get(i) {
        if b"#^/!".contains(&c) {
            sig = Some(c);
            i += 1;
        }
    }
    i = skip(i);
    let q = i + t[i..].find("}}")?;
    let name = t[i..q].trim_end_matches(is_space);
    let close = b.get(q + 2) == Some(&b'}');
    Some(Tag {
        start,
        end: q + 2 + usize::from(close),
        triple,
        close,
        sig,
        name,
    })
}

fn valid_name(name: &str) -> bool {
    if name == "." {
        return true;
    }
    let b = name.as_bytes();
    let ident = |i: &mut usize| -> bool {
        if *i < b.len() && (b[*i].is_ascii_alphabetic() || b[*i] == b'_') {
            *i += 1;
            while *i < b.len() && (b[*i].is_ascii_alphanumeric() || b[*i] == b'_' || b[*i] == b'-')
            {
                *i += 1;
            }
            true
        } else {
            false
        }
    };
    let mut i = 0;
    if !ident(&mut i) {
        return false;
    }
    while i < b.len() {
        match b[i] {
            b'.' => {
                i += 1;
                if !ident(&mut i) {
                    return false;
                }
            }
            b'[' => {
                let s = i + 1;
                let mut j = s;
                while j < b.len() && b[j].is_ascii_digit() {
                    j += 1;
                }
                if j == s || (j - s > 1 && b[s] == b'0') || j >= b.len() || b[j] != b']' {
                    return false;
                }
                i = j + 1;
            }
            _ => return false,
        }
    }
    true
}

fn parse(t: &str) -> Result<Vec<Node>, TemplateError> {
    let mut stack: Vec<(String, Vec<Node>, bool)> = vec![(String::new(), Vec::new(), false)];
    let mut pos = 0;
    while let Some(tag) = next_tag(t, pos) {
        if tag.start > pos {
            stack
                .last_mut()
                .unwrap()
                .1
                .push(Node::Text(t[pos..tag.start].to_string()));
        }
        if tag.sig == Some(b'!') {
            pos = tag.end;
            continue;
        }
        if tag.triple != tag.close || (tag.triple && tag.sig.is_some()) {
            return err("bad triple-brace tag");
        }
        if !valid_name(tag.name) {
            return err(format!("bad tag name {:?}", tag.name));
        }
        let name = tag.name.to_string();
        match tag.sig {
            Some(b'#') => stack.push((name, Vec::new(), false)),
            Some(b'^') => stack.push((name, Vec::new(), true)),
            Some(_) => {
                if stack.len() == 1 || stack.last().unwrap().0 != name {
                    return err("mismatched close tag");
                }
                let (n, body, inverted) = stack.pop().unwrap();
                let node = if inverted {
                    Node::Inverted(n, body)
                } else {
                    Node::Section(n, body)
                };
                stack.last_mut().unwrap().1.push(node);
            }
            None => {
                let node = if tag.triple {
                    Node::Raw(name)
                } else {
                    Node::Var(name)
                };
                stack.last_mut().unwrap().1.push(node);
            }
        }
        pos = tag.end;
    }
    let rest = &t[pos..];
    if rest.contains("{{") {
        return err("unclosed tag");
    }
    if !rest.is_empty() {
        stack
            .last_mut()
            .unwrap()
            .1
            .push(Node::Text(rest.to_string()));
    }
    if stack.len() > 1 {
        return err("unclosed section");
    }
    Ok(stack.pop().unwrap().1)
}

fn format_number(f: f64) -> String {
    if f == 0.0 {
        "0".to_string()
    } else if f.is_finite() && f == f.trunc() {
        format!("{f:.0}")
    } else if f != 0.0 && f.abs() < 1e-4 {
        // Python repr style: 1e-05
        let s = format!("{f:e}");
        match s.split_once('e') {
            Some((m, e)) => {
                let (sign, digits) = e.strip_prefix('-').map_or(("+", e), |d| ("-", d));
                format!("{m}e{sign}{digits:0>2}")
            }
            None => s,
        }
    } else {
        format!("{f}")
    }
}

fn format_value(v: Option<&Json>) -> Result<String, TemplateError> {
    Ok(match v {
        None | Some(Json::Null) => String::new(),
        Some(Json::Bool(b)) => b.to_string(),
        Some(Json::Number(n)) => format_number(*n),
        Some(Json::String(s)) => s.clone(),
        Some(_) => return err("cannot render a list or object"),
    })
}

fn escape_html(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(c),
        }
    }
    out
}

fn member<'a>(v: &'a Json, key: &str) -> Option<&'a Json> {
    match v {
        Json::Object(m) => m.iter().find(|(k, _)| k == key).map(|(_, x)| x),
        _ => None,
    }
}

fn lookup<'a>(stack: &[&'a Json], path: &str) -> Option<&'a Json> {
    if path == "." {
        return stack.last().copied();
    }
    let mut parts: Vec<&str> = Vec::new();
    for piece in path.split('.') {
        let mut rest = piece;
        while let Some(b) = rest.find('[') {
            if b > 0 {
                parts.push(&rest[..b]);
            }
            let e = rest[b..].find(']').map_or(rest.len(), |e| b + e + 1);
            parts.push(&rest[b..e]);
            rest = &rest[e..];
        }
        if !rest.is_empty() {
            parts.push(rest);
        }
    }
    let first = parts[0];
    for scope in stack.iter().rev() {
        let Some(mut cur) = member(scope, first) else {
            continue;
        };
        for p in &parts[1..] {
            let next = if let Some(idx) = p.strip_prefix('[') {
                match (cur, idx.trim_end_matches(']').parse::<usize>()) {
                    (Json::Array(l), Ok(i)) => l.get(i),
                    _ => None,
                }
            } else {
                member(cur, p)
            };
            match next {
                None | Some(Json::Null) => return None,
                Some(v) => cur = v,
            }
        }
        return Some(cur);
    }
    None
}

fn truthy(v: Option<&Json>) -> bool {
    match v {
        None | Some(Json::Null) => false,
        Some(Json::Bool(b)) => *b,
        Some(Json::Number(n)) => *n != 0.0,
        Some(Json::String(s)) => !s.is_empty(),
        Some(Json::Array(a)) => !a.is_empty(),
        Some(Json::Object(m)) => !m.is_empty(),
    }
}

fn run(
    nodes: &[Node],
    stack: &mut Vec<&Json>,
    escape: bool,
    out: &mut String,
) -> Result<(), TemplateError> {
    for n in nodes {
        match n {
            Node::Text(s) => out.push_str(s),
            Node::Var(p) | Node::Raw(p) => {
                let s = format_value(lookup(stack, p))?;
                if escape && matches!(n, Node::Var(_)) {
                    out.push_str(&escape_html(&s));
                } else {
                    out.push_str(&s);
                }
            }
            Node::Section(p, body) => match lookup(stack, p) {
                Some(Json::Array(items)) => {
                    for item in items {
                        stack.push(item);
                        let r = run(body, stack, escape, out);
                        stack.pop();
                        r?;
                    }
                }
                v if truthy(v) => {
                    let pushed = matches!(v, Some(Json::Object(_)));
                    if let (true, Some(obj)) = (pushed, v) {
                        stack.push(obj);
                    }
                    let r = run(body, stack, escape, out);
                    if pushed {
                        stack.pop();
                    }
                    r?;
                }
                _ => {}
            },
            Node::Inverted(p, body) => {
                if !truthy(lookup(stack, p)) {
                    run(body, stack, escape, out)?;
                }
            }
        }
    }
    Ok(())
}

/// Renders `template` against `data`, HTML-escaping `{{path}}` values when `escape` is true.
pub fn render_template(template: &str, data: &Json, escape: bool) -> Result<String, TemplateError> {
    let nodes = parse(template)?;
    let mut out = String::new();
    run(&nodes, &mut vec![data], escape, &mut out)?;
    Ok(out)
}

#[cfg(test)]
#[allow(clippy::type_complexity, clippy::single_element_loop)] // generated vector tables
mod tests {
    // Generated from the wave 11 capability vectors; do not edit by hand.
    use super::*;

    use crate::json_patch::parse;

    const DATA: &str = "{\"name\":\"Ada <3\",\"html\":\"<b>x</b>\",\"n\":3,\"f\":2.5,\"g\":4.0,\"t\":true,\"z\":0,\"e\":\"\",\"items\":[{\"name\":\"one\"},{\"name\":\"two\",\"extra\":\"!\"}],\"nums\":[1,2],\"user\":{\"first\":\"Grace\",\"tags\":[\"x\"]},\"empty\":[],\"obj\":{\"k\":\"v\"}}";

    #[test]
    fn render_vectors() {
        let data = parse(DATA).unwrap();
        let cases: &[(&str, &str)] = &[
            ("Hello {{name}}!", "Hello Ada &lt;3!"),
            ("{{{html}}} vs {{html}}", "<b>x</b> vs &lt;b&gt;x&lt;/b&gt;"),
            (
                "{{ n }} {{f}} {{g}} {{t}} {{z}} [{{e}}] [{{missing}}]",
                "3 2.5 4 true 0 [] []",
            ),
            ("{{#items}}<{{name}}{{extra}}>{{/items}}", "<one><two!>"),
            ("{{#nums}}{{.}},{{/nums}}", "1,2,"),
            (
                "{{#t}}yes{{/t}}{{#z}}no{{/z}}{{^z}}zero{{/z}}{{^empty}}none{{/empty}}",
                "yeszeronone",
            ),
            ("{{#user}}{{first}} {{name}}{{/user}}", "Grace Ada &lt;3"),
            ("{{user.first}} {{user.tags[0]}}", "Grace x"),
            ("a{{! comment }}b", "ab"),
            ("{{#obj}}{{k}}{{/obj}}", "v"),
            (
                "{{#items}}{{#extra}}[{{name}}]{{/extra}}{{/items}}",
                "[two]",
            ),
            ("no tags", "no tags"),
        ];
        for &(t, want) in cases {
            assert_eq!(
                render_template(t, &data, true).as_deref(),
                Ok(want),
                "{t:?}"
            );
        }
        let raw: &[(&str, &str)] = &[("{{html}}", "<b>x</b>")];
        for &(t, want) in raw {
            assert_eq!(
                render_template(t, &data, false).as_deref(),
                Ok(want),
                "{t:?}"
            );
        }
    }

    #[test]
    fn invalid_vectors() {
        let data = parse(DATA).unwrap();
        for t in [
            "{{",
            "{{#a}}x",
            "{{#a}}x{{/b}}",
            "{{/a}}",
            "{{ bad name }}",
            "{{{x}}",
            "{{obj}}",
            "{{items}}",
        ] {
            assert!(render_template(t, &data, true).is_err(), "{t:?}");
        }
    }
}
