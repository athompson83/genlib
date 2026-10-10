// SPDX-License-Identifier: Apache-2.0

//! RFC 6901 JSON Pointer, RFC 6902 JSON Patch, RFC 7396 JSON Merge Patch, a
//! deterministic patch generator, and (because the standard library has no
//! JSON) a strict RFC 8259 parser and canonical serializer.
//!
//! Values are [`Json`]; objects keep their members in insertion order (a
//! repeated key keeps its first position and its last value). Numbers are
//! f64: they compare numerically, whole numbers print without a decimal point
//! and other numbers print in Rust's shortest round-trip form (`{}`, which
//! never uses an exponent). Booleans are never numbers and object key order
//! is ignored by [`equal`]. No function mutates its inputs.

use std::fmt;

/// A JSON value.
#[derive(Clone, Debug, PartialEq)]
pub enum Json {
    Null,
    Bool(bool),
    Number(f64),
    String(String),
    Array(Vec<Json>),
    Object(Vec<(String, Json)>),
}

/// Parse error, bad pointer or failed patch operation.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PatchError(pub String);

impl fmt::Display for PatchError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for PatchError {}

fn err<T>(m: impl Into<String>) -> Result<T, PatchError> {
    Err(PatchError(m.into()))
}

/// Maximum nesting of arrays and objects accepted by [`parse`].
pub const MAX_DEPTH: usize = 512;

impl Json {
    fn member(&self, key: &str) -> Option<&Json> {
        match self {
            Json::Object(m) => m.iter().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }
}

fn set_member(m: &mut Vec<(String, Json)>, key: &str, value: Json) {
    match m.iter_mut().find(|(k, _)| k == key) {
        Some(slot) => slot.1 = value,
        None => m.push((key.to_string(), value)),
    }
}

// ---------------------------------------------------------------- parser

struct Parser<'a> {
    s: &'a [u8],
    i: usize,
}

impl Parser<'_> {
    fn ws(&mut self) {
        while self.i < self.s.len() && matches!(self.s[self.i], b' ' | b'\t' | b'\n' | b'\r') {
            self.i += 1;
        }
    }

    fn peek(&self) -> Option<u8> {
        self.s.get(self.i).copied()
    }

    fn literal(&mut self, word: &str, v: Json) -> Result<Json, PatchError> {
        if self.s[self.i..].starts_with(word.as_bytes()) {
            self.i += word.len();
            Ok(v)
        } else {
            err(format!("invalid literal at byte {}", self.i))
        }
    }

    fn value(&mut self, depth: usize) -> Result<Json, PatchError> {
        if depth > MAX_DEPTH {
            return err("JSON nested too deeply");
        }
        self.ws();
        match self.peek() {
            None => err("unexpected end of JSON"),
            Some(b'n') => self.literal("null", Json::Null),
            Some(b't') => self.literal("true", Json::Bool(true)),
            Some(b'f') => self.literal("false", Json::Bool(false)),
            Some(b'"') => Ok(Json::String(self.string()?)),
            Some(b'[') => {
                self.i += 1;
                let mut out = vec![];
                self.ws();
                if self.peek() == Some(b']') {
                    self.i += 1;
                    return Ok(Json::Array(out));
                }
                loop {
                    out.push(self.value(depth + 1)?);
                    self.ws();
                    match self.peek() {
                        Some(b',') => self.i += 1,
                        Some(b']') => {
                            self.i += 1;
                            return Ok(Json::Array(out));
                        }
                        _ => return err(format!("expected ',' or ']' at byte {}", self.i)),
                    }
                }
            }
            Some(b'{') => {
                self.i += 1;
                let mut out = vec![];
                self.ws();
                if self.peek() == Some(b'}') {
                    self.i += 1;
                    return Ok(Json::Object(out));
                }
                loop {
                    self.ws();
                    if self.peek() != Some(b'"') {
                        return err(format!("expected a member name at byte {}", self.i));
                    }
                    let key = self.string()?;
                    self.ws();
                    if self.peek() != Some(b':') {
                        return err(format!("expected ':' at byte {}", self.i));
                    }
                    self.i += 1;
                    let v = self.value(depth + 1)?;
                    set_member(&mut out, &key, v);
                    self.ws();
                    match self.peek() {
                        Some(b',') => self.i += 1,
                        Some(b'}') => {
                            self.i += 1;
                            return Ok(Json::Object(out));
                        }
                        _ => return err(format!("expected ',' or '}}' at byte {}", self.i)),
                    }
                }
            }
            Some(_) => self.number(),
        }
    }

    fn digits(&mut self) -> usize {
        let start = self.i;
        while self.peek().is_some_and(|c| c.is_ascii_digit()) {
            self.i += 1;
        }
        self.i - start
    }

    fn number(&mut self) -> Result<Json, PatchError> {
        let start = self.i;
        if self.peek() == Some(b'-') {
            self.i += 1;
        }
        let int_start = self.i;
        let n = self.digits();
        if n == 0 || (n > 1 && self.s[int_start] == b'0') {
            return err(format!("invalid number at byte {start}"));
        }
        if self.peek() == Some(b'.') {
            self.i += 1;
            if self.digits() == 0 {
                return err(format!("invalid number at byte {start}"));
            }
        }
        if matches!(self.peek(), Some(b'e' | b'E')) {
            self.i += 1;
            if matches!(self.peek(), Some(b'+' | b'-')) {
                self.i += 1;
            }
            if self.digits() == 0 {
                return err(format!("invalid number at byte {start}"));
            }
        }
        let text = std::str::from_utf8(&self.s[start..self.i]).expect("ASCII number");
        match text.parse::<f64>() {
            Ok(v) if v.is_finite() => Ok(Json::Number(v)),
            _ => err(format!("number out of range at byte {start}")),
        }
    }

    fn hex4(&mut self) -> Result<u32, PatchError> {
        let h = self.s.get(self.i..self.i + 4).and_then(|h| std::str::from_utf8(h).ok());
        match h.filter(|h| h.bytes().all(|c| c.is_ascii_hexdigit())).map(|h| u32::from_str_radix(h, 16)) {
            Some(Ok(v)) => {
                self.i += 4;
                Ok(v)
            }
            _ => err(format!("invalid \\u escape at byte {}", self.i)),
        }
    }

    fn string(&mut self) -> Result<String, PatchError> {
        self.i += 1; // opening quote
        let mut out = String::new();
        loop {
            let start = self.i;
            while self.peek().is_some_and(|c| c != b'"' && c != b'\\' && c >= 0x20) {
                self.i += 1;
            }
            // The input is a &str, so any run between ASCII delimiters is valid UTF-8.
            out.push_str(std::str::from_utf8(&self.s[start..self.i]).expect("UTF-8"));
            match self.peek() {
                None => return err("unterminated string"),
                Some(b'"') => {
                    self.i += 1;
                    return Ok(out);
                }
                Some(b'\\') => {
                    self.i += 1;
                    let c = self.peek().ok_or_else(|| PatchError("unterminated string".into()))?;
                    self.i += 1;
                    match c {
                        b'"' => out.push('"'),
                        b'\\' => out.push('\\'),
                        b'/' => out.push('/'),
                        b'b' => out.push('\u{8}'),
                        b'f' => out.push('\u{c}'),
                        b'n' => out.push('\n'),
                        b'r' => out.push('\r'),
                        b't' => out.push('\t'),
                        b'u' => {
                            let hi = self.hex4()?;
                            let cp = if (0xD800..0xDC00).contains(&hi) {
                                if !self.s[self.i..].starts_with(b"\\u") {
                                    return err("lone surrogate escape");
                                }
                                self.i += 2;
                                let lo = self.hex4()?;
                                if !(0xDC00..0xE000).contains(&lo) {
                                    return err("lone surrogate escape");
                                }
                                0x10000 + ((hi - 0xD800) << 10) + (lo - 0xDC00)
                            } else if (0xDC00..0xE000).contains(&hi) {
                                return err("lone surrogate escape");
                            } else {
                                hi
                            };
                            out.push(char::from_u32(cp).expect("valid scalar"));
                        }
                        _ => return err(format!("invalid escape at byte {}", self.i - 1)),
                    }
                }
                Some(_) => return err(format!("unescaped control character at byte {}", self.i)),
            }
        }
    }
}

/// Parses one strict RFC 8259 JSON text: no trailing commas, leading zeros,
/// bare words, NaN, invalid escapes, unescaped control characters, lone
/// surrogate escapes or trailing garbage; numbers must fit an f64 and nesting
/// is limited to [`MAX_DEPTH`].
pub fn parse(text: &str) -> Result<Json, PatchError> {
    let mut p = Parser { s: text.as_bytes(), i: 0 };
    let v = p.value(0)?;
    p.ws();
    if p.i != p.s.len() {
        return err(format!("unexpected data after JSON at byte {}", p.i));
    }
    Ok(v)
}

// ---------------------------------------------------------------- serializer

fn write_string(out: &mut String, s: &str) {
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
}

fn write(out: &mut String, v: &Json) {
    match v {
        Json::Null => out.push_str("null"),
        Json::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Json::Number(n) if *n == 0.0 => out.push('0'),
        Json::Number(n) => out.push_str(&format!("{n}")),
        Json::String(s) => write_string(out, s),
        Json::Array(items) => {
            out.push('[');
            for (i, x) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write(out, x);
            }
            out.push(']');
        }
        Json::Object(m) => {
            let mut members: Vec<&(String, Json)> = m.iter().collect();
            members.sort_by(|a, b| a.0.cmp(&b.0)); // UTF-8 byte order equals code point order
            out.push('{');
            for (i, (k, x)) in members.into_iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_string(out, k);
                out.push(':');
                write(out, x);
            }
            out.push('}');
        }
    }
}

/// Compact JSON with object keys in code point order, whole numbers without a
/// decimal point and strings escaped only where JSON requires (`"`, `\` and
/// characters below U+0020, as `\u00xx` unless a short escape exists).
/// [`parse`] never produces NaN or infinities; do not construct them.
pub fn canonical(v: &Json) -> String {
    let mut out = String::new();
    write(&mut out, v);
    out
}

/// Deep JSON equality: numbers numerically, object key order ignored.
pub fn equal(a: &Json, b: &Json) -> bool {
    match (a, b) {
        (Json::Number(x), Json::Number(y)) => x == y,
        (Json::Array(x), Json::Array(y)) => x.len() == y.len() && x.iter().zip(y).all(|(p, q)| equal(p, q)),
        (Json::Object(x), Json::Object(y)) => {
            x.len() == y.len() && x.iter().all(|(k, v)| b.member(k).is_some_and(|w| equal(v, w)))
        }
        _ => a == b,
    }
}

// ---------------------------------------------------------------- pointer

fn parse_pointer(p: &str) -> Result<Vec<String>, PatchError> {
    if p.is_empty() {
        return Ok(vec![]);
    }
    let Some(rest) = p.strip_prefix('/') else { return err(r#"pointer must be empty or start with "/""#) };
    rest.split('/')
        .map(|t| {
            let b = t.as_bytes();
            if b.iter().enumerate().any(|(k, &c)| c == b'~' && !matches!(b.get(k + 1), Some(b'0' | b'1'))) {
                return err(format!("bad escape in pointer token {t:?}"));
            }
            Ok(t.replace("~1", "/").replace("~0", "~"))
        })
        .collect()
}

fn escape_token(t: &str) -> String {
    t.replace('~', "~0").replace('/', "~1")
}

fn index(token: &str, n: usize, allow_end: bool) -> Result<usize, PatchError> {
    if allow_end && token == "-" {
        return Ok(n);
    }
    let digits = !token.is_empty() && token.bytes().all(|c| c.is_ascii_digit());
    if !digits || (token.len() > 1 && token.starts_with('0')) {
        return err(format!("bad array index {token:?}"));
    }
    match token.parse::<usize>() {
        Ok(i) if i < n || (i == n && allow_end) => Ok(i),
        _ => err(format!("array index out of range: {token}")),
    }
}

fn child<'a>(cur: &'a Json, t: &str) -> Result<&'a Json, PatchError> {
    match cur {
        Json::Object(_) => cur.member(t).ok_or_else(|| PatchError(format!("no member {t:?}"))),
        Json::Array(items) => Ok(&items[index(t, items.len(), false)?]),
        _ => err("cannot index a scalar"),
    }
}

fn child_mut<'a>(cur: &'a mut Json, t: &str) -> Result<&'a mut Json, PatchError> {
    match cur {
        Json::Object(m) => m.iter_mut().find(|(k, _)| k == t).map(|(_, v)| v).ok_or_else(|| PatchError(format!("no member {t:?}"))),
        Json::Array(items) => {
            let i = index(t, items.len(), false)?;
            Ok(&mut items[i])
        }
        _ => err("cannot index a scalar"),
    }
}

fn get<'a>(doc: &'a Json, tokens: &[String]) -> Result<&'a Json, PatchError> {
    tokens.iter().try_fold(doc, |cur, t| child(cur, t))
}

fn parent_mut<'a>(doc: &'a mut Json, tokens: &[String]) -> Result<&'a mut Json, PatchError> {
    tokens[..tokens.len() - 1].iter().try_fold(doc, |cur, t| child_mut(cur, t))
}

/// Resolves an RFC 6901 pointer ("" is the whole document); `-` and indexes
/// past the end of an array are errors.
pub fn get_pointer<'a>(doc: &'a Json, pointer: &str) -> Result<&'a Json, PatchError> {
    get(doc, &parse_pointer(pointer)?)
}

// ---------------------------------------------------------------- patch

fn add(doc: &mut Json, tokens: &[String], value: Json) -> Result<(), PatchError> {
    let Some(last) = tokens.last() else {
        *doc = value;
        return Ok(());
    };
    match parent_mut(doc, tokens)? {
        Json::Object(m) => set_member(m, last, value),
        Json::Array(items) => {
            let i = index(last, items.len(), true)?;
            items.insert(i, value);
        }
        _ => return err("cannot add to a scalar"),
    }
    Ok(())
}

fn remove(doc: &mut Json, tokens: &[String]) -> Result<Json, PatchError> {
    let Some(last) = tokens.last() else { return err("cannot remove the root") };
    match parent_mut(doc, tokens)? {
        Json::Object(m) => match m.iter().position(|(k, _)| k == last) {
            Some(i) => Ok(m.remove(i).1),
            None => err(format!("no member {last:?}")),
        },
        Json::Array(items) => {
            let i = index(last, items.len(), false)?;
            Ok(items.remove(i))
        }
        _ => err("cannot remove from a scalar"),
    }
}

fn pointer_field<'a>(op: &'a Json, name: &str) -> Result<&'a str, PatchError> {
    match op.member(name) {
        Some(Json::String(s)) => Ok(s),
        Some(_) => err(format!("{name:?} must be a string")),
        None => err(format!("operation needs {name:?}")),
    }
}

/// Applies an RFC 6902 patch (an array of operation objects) atomically and
/// returns a new document; `doc` is never changed. Members other than op,
/// path, value and from are ignored.
pub fn apply_patch(doc: &Json, patch: &Json) -> Result<Json, PatchError> {
    let Json::Array(ops) = patch else { return err("patch must be an array") };
    let mut doc = doc.clone();
    for op in ops {
        let Some(Json::String(kind)) = op.member("op") else { return err(r#"operation needs "op""#) };
        let raw_path = pointer_field(op, "path")?;
        let path = parse_pointer(raw_path)?;
        let value = op.member("value");
        let need_value = || value.cloned().ok_or_else(|| PatchError(format!("{kind} needs \"value\"")));
        match kind.as_str() {
            "add" => add(&mut doc, &path, need_value()?)?,
            "remove" => {
                remove(&mut doc, &path)?;
            }
            "replace" => {
                let v = need_value()?;
                get(&doc, &path)?;
                if path.is_empty() {
                    doc = v;
                } else {
                    remove(&mut doc, &path)?;
                    add(&mut doc, &path, v)?;
                }
            }
            "move" => {
                let from = parse_pointer(pointer_field(op, "from")?)?;
                if from == path {
                    get(&doc, &from)?;
                    continue;
                }
                if path.starts_with(&from) {
                    return err("cannot move a value into itself");
                }
                let v = remove(&mut doc, &from)?;
                add(&mut doc, &path, v)?;
            }
            "copy" => {
                let from = parse_pointer(pointer_field(op, "from")?)?;
                let v = get(&doc, &from)?.clone();
                add(&mut doc, &path, v)?;
            }
            "test" => {
                let v = need_value()?;
                if !equal(get(&doc, &path)?, &v) {
                    return err(format!("test failed at {raw_path}"));
                }
            }
            other => return err(format!("unknown op {other:?}")),
        }
    }
    Ok(doc)
}

/// Applies an RFC 7396 merge patch and returns a new value.
pub fn merge_patch(target: &Json, patch: &Json) -> Json {
    let Json::Object(p) = patch else { return patch.clone() };
    let mut out = match target {
        Json::Object(m) => m.clone(),
        _ => vec![],
    };
    for (k, v) in p {
        if *v == Json::Null {
            out.retain(|(key, _)| key != k);
        } else {
            let current = out.iter().find(|(key, _)| key == k).map(|(_, x)| x.clone()).unwrap_or(Json::Null);
            set_member(&mut out, k, merge_patch(&current, v));
        }
    }
    Json::Object(out)
}

fn op(kind: &str, path: &str, value: Option<&Json>) -> Json {
    let mut m = vec![("op".to_string(), Json::String(kind.into())), ("path".to_string(), Json::String(path.into()))];
    if let Some(v) = value {
        m.push(("value".to_string(), v.clone()));
    }
    Json::Object(m)
}

fn create(a: &Json, b: &Json, path: &str, ops: &mut Vec<Json>) {
    if equal(a, b) {
        return;
    }
    match (a, b) {
        (Json::Object(x), Json::Object(_)) => {
            let mut keys: Vec<&String> = x.iter().map(|(k, _)| k).collect();
            if let Json::Object(y) = b {
                keys.extend(y.iter().map(|(k, _)| k));
            }
            keys.sort();
            keys.dedup();
            for k in keys {
                let p = format!("{path}/{}", escape_token(k));
                match (a.member(k), b.member(k)) {
                    (_, None) => ops.push(op("remove", &p, None)),
                    (None, Some(v)) => ops.push(op("add", &p, Some(v))),
                    (Some(u), Some(v)) => create(u, v, &p, ops),
                }
            }
        }
        (Json::Array(x), Json::Array(y)) => {
            for (i, (u, v)) in x.iter().zip(y).enumerate() {
                create(u, v, &format!("{path}/{i}"), ops);
            }
            for i in (y.len()..x.len()).rev() {
                ops.push(op("remove", &format!("{path}/{i}"), None));
            }
            for (i, v) in y.iter().enumerate().skip(x.len()) {
                ops.push(op("add", &format!("{path}/{i}"), Some(v)));
            }
        }
        _ => ops.push(op("replace", path, Some(b))),
    }
}

/// A deterministic RFC 6902 patch turning `a` into `b`: object keys in code
/// point order (remove, add or recurse), array indexes compared pairwise,
/// then surplus indexes removed from the end and missing ones added; any
/// other difference is a replace. `apply_patch(a, &create_patch(a, b))`
/// equals `b`.
pub fn create_patch(a: &Json, b: &Json) -> Json {
    let mut ops = vec![];
    create(a, b, "", &mut ops);
    Json::Array(ops)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p(s: &str) -> Json {
        parse(s).unwrap_or_else(|e| panic!("parse {s:?}: {e}"))
    }

    #[test]
    fn parse_valid() {
        for (text, want) in PARSE_VALID {
            assert_eq!(canonical(&p(text)), want, "{text:?}");
        }
        assert_eq!(p(r#"{"a":1,"b":2,"a":3}"#), Json::Object(vec![("a".into(), Json::Number(3.0)), ("b".into(), Json::Number(2.0))]));
    }

    #[test]
    fn parse_invalid() {
        for text in PARSE_INVALID {
            assert!(parse(text).is_err(), "{text:?}");
        }
        for text in ["1e400", "[\"\\udc00\"]", "\u{feff}1", "{\"a\":1 , }", "-", "00"] {
            assert!(parse(text).is_err(), "{text:?}");
        }
        assert!(parse(&"[".repeat(MAX_DEPTH + 2)).is_err());
    }

    #[test]
    fn canonical_form() {
        let v = Json::Array(vec![Json::Number(1.5), Json::Number(-0.25), Json::Number(-0.0), Json::String("\u{1f}é/".into())]);
        assert_eq!(canonical(&v), "[1.5,-0.25,0,\"\\u001fé/\"]");
    }

    #[test]
    fn apply() {
        for (doc, patch, want) in APPLY {
            let d = p(doc);
            let got = apply_patch(&d, &p(patch)).unwrap_or_else(|e| panic!("{doc} {patch}: {e}"));
            assert_eq!(canonical(&got), want, "{doc} {patch}");
            assert_eq!(canonical(&d), canonical(&p(doc)), "input changed");
        }
    }

    #[test]
    fn apply_invalid() {
        for (doc, patch) in APPLY_INVALID {
            let d = p(doc);
            assert!(apply_patch(&d, &p(patch)).is_err(), "{doc} {patch}");
            assert_eq!(canonical(&d), doc, "input changed");
        }
    }

    #[test]
    fn pointer() {
        for (doc, pointer, want) in POINTER {
            assert_eq!(get_pointer(&p(doc), pointer).map(canonical).as_deref(), Ok(want), "{pointer:?}");
        }
        let doc = p(r#"{"foo":["bar","baz"],"m~n":8}"#);
        for pointer in POINTER_INVALID {
            assert!(get_pointer(&doc, pointer).is_err(), "{pointer:?}");
        }
    }

    #[test]
    fn merge() {
        for (target, patch, want) in MERGE {
            let t = p(target);
            assert_eq!(canonical(&merge_patch(&t, &p(patch))), want, "{target} {patch}");
            assert_eq!(canonical(&t), target, "input changed");
        }
    }

    #[test]
    fn create() {
        for (a, b, want) in CREATE {
            let (a, b) = (p(a), p(b));
            let patch = create_patch(&a, &b);
            assert_eq!(canonical(&patch), want);
            assert!(equal(&apply_patch(&a, &patch).expect("apply"), &b));
        }
    }

    #[test]
    fn equality() {
        assert!(equal(&p(r#"{"a":[1,{"b":null}],"c":"x"}"#), &p(r#"{"c":"x","a":[1.0,{"b":null}]}"#)));
        for (x, y) in [("true", "1"), ("false", "0"), ("\"1\"", "1"), ("null", "false"), ("[]", "{}"), (r#"{"a":1}"#, r#"{"b":1}"#)] {
            assert!(!equal(&p(x), &p(y)), "{x} {y}");
        }
    }

    // Test vectors copied verbatim from the shared Genlib capability vectors.
    const APPLY: [(&str, &str, &str); 18] = [
        ("{\"foo\":\"bar\"}", "[{\"op\":\"add\",\"path\":\"/baz\",\"value\":\"qux\"}]", "{\"baz\":\"qux\",\"foo\":\"bar\"}"),
        ("{\"foo\":[\"bar\",\"baz\"]}", "[{\"op\":\"add\",\"path\":\"/foo/1\",\"value\":\"qux\"}]", "{\"foo\":[\"bar\",\"qux\",\"baz\"]}"),
        ("{\"baz\":\"qux\",\"foo\":\"bar\"}", "[{\"op\":\"remove\",\"path\":\"/baz\"}]", "{\"foo\":\"bar\"}"),
        ("{\"foo\":[\"bar\",\"qux\",\"baz\"]}", "[{\"op\":\"remove\",\"path\":\"/foo/1\"}]", "{\"foo\":[\"bar\",\"baz\"]}"),
        ("{\"baz\":\"qux\",\"foo\":\"bar\"}", "[{\"op\":\"replace\",\"path\":\"/baz\",\"value\":\"boo\"}]", "{\"baz\":\"boo\",\"foo\":\"bar\"}"),
        ("{\"foo\":{\"bar\":\"baz\",\"waldo\":\"fred\"},\"qux\":{\"corge\":\"grault\"}}", "[{\"from\":\"/foo/waldo\",\"op\":\"move\",\"path\":\"/qux/thud\"}]", "{\"foo\":{\"bar\":\"baz\"},\"qux\":{\"corge\":\"grault\",\"thud\":\"fred\"}}"),
        ("{\"foo\":[\"all\",\"grass\",\"cows\",\"eat\"]}", "[{\"from\":\"/foo/1\",\"op\":\"move\",\"path\":\"/foo/3\"}]", "{\"foo\":[\"all\",\"cows\",\"eat\",\"grass\"]}"),
        ("{\"baz\":\"qux\",\"foo\":[\"a\",2,\"c\"]}", "[{\"op\":\"test\",\"path\":\"/baz\",\"value\":\"qux\"},{\"op\":\"test\",\"path\":\"/foo/1\",\"value\":2}]", "{\"baz\":\"qux\",\"foo\":[\"a\",2,\"c\"]}"),
        ("{\"foo\":\"bar\"}", "[{\"op\":\"add\",\"path\":\"/child\",\"value\":{\"grandchild\":{}}}]", "{\"child\":{\"grandchild\":{}},\"foo\":\"bar\"}"),
        ("{\"foo\":\"bar\"}", "[{\"op\":\"add\",\"path\":\"/baz\",\"value\":\"qux\",\"xyz\":123}]", "{\"baz\":\"qux\",\"foo\":\"bar\"}"),
        ("{\"foo\":[\"bar\"]}", "[{\"op\":\"add\",\"path\":\"/foo/-\",\"value\":[\"abc\",\"def\"]}]", "{\"foo\":[\"bar\",[\"abc\",\"def\"]]}"),
        ("{\"/\":9,\"~1\":10}", "[{\"op\":\"test\",\"path\":\"/~01\",\"value\":10},{\"op\":\"replace\",\"path\":\"/~1\",\"value\":1}]", "{\"/\":1,\"~1\":10}"),
        ("{\"a\":1}", "[{\"op\":\"replace\",\"path\":\"\",\"value\":[1,2]}]", "[1,2]"),
        ("{\"a\":1}", "[{\"op\":\"add\",\"path\":\"\",\"value\":\"root\"}]", "\"root\""),
        ("{\"a\":{\"b\":1}}", "[{\"from\":\"/a\",\"op\":\"copy\",\"path\":\"/c\"},{\"op\":\"replace\",\"path\":\"/c/b\",\"value\":2}]", "{\"a\":{\"b\":1},\"c\":{\"b\":2}}"),
        ("{\"a\":[1,2]}", "[{\"from\":\"/a/0\",\"op\":\"move\",\"path\":\"/a/0\"}]", "{\"a\":[1,2]}"),
        ("{\"n\":1}", "[{\"op\":\"test\",\"path\":\"/n\",\"value\":1}]", "{\"n\":1}"),
        ("{\"a\":{\"b\":[1,{\"c\":null}]}}", "[{\"op\":\"test\",\"path\":\"/a/b/1/c\",\"value\":null},{\"op\":\"remove\",\"path\":\"/a/b/0\"}]", "{\"a\":{\"b\":[{\"c\":null}]}}"),
    ];

    const APPLY_INVALID: [(&str, &str); 18] = [
        ("{\"baz\":\"qux\"}", "[{\"op\":\"add\",\"path\":\"/baz/bat\",\"value\":\"qux\"}]"),
        ("{\"foo\":\"bar\"}", "[{\"op\":\"test\",\"path\":\"/baz\",\"value\":\"qux\"}]"),
        ("{\"foo\":[\"bar\"]}", "[{\"op\":\"add\",\"path\":\"/foo/2\",\"value\":1}]"),
        ("{\"foo\":[\"bar\"]}", "[{\"op\":\"add\",\"path\":\"/foo/01\",\"value\":1}]"),
        ("{\"foo\":[\"bar\"]}", "[{\"op\":\"remove\",\"path\":\"/foo/-\"}]"),
        ("{\"a\":1}", "[{\"op\":\"remove\",\"path\":\"/b\"}]"),
        ("{\"a\":1}", "[{\"op\":\"replace\",\"path\":\"/b\",\"value\":1}]"),
        ("{\"a\":{\"b\":1}}", "[{\"from\":\"/a\",\"op\":\"move\",\"path\":\"/a/b/c\"}]"),
        ("{\"a\":1}", "[{\"op\":\"frobnicate\",\"path\":\"/a\"}]"),
        ("{\"a\":1}", "[{\"op\":\"add\",\"path\":\"/b\"}]"),
        ("{\"a\":1}", "[{\"op\":\"add\",\"value\":1}]"),
        ("{\"a\":1}", "[{\"op\":\"add\",\"path\":\"a\",\"value\":1}]"),
        ("{\"a~b\":1}", "[{\"op\":\"remove\",\"path\":\"/a~b\"}]"),
        ("{\"a\":1}", "[{\"op\":\"remove\",\"path\":\"\"}]"),
        ("{\"a\":true}", "[{\"op\":\"test\",\"path\":\"/a\",\"value\":1}]"),
        ("{\"a\":1}", "[{\"op\":\"test\",\"path\":\"/a\",\"value\":\"1\"}]"),
        ("{\"a\":1}", "[{\"op\":\"add\",\"path\":\"/b\",\"value\":2},{\"op\":\"test\",\"path\":\"/b\",\"value\":3}]"),
        ("{\"a\":1}", "{\"op\":\"add\",\"path\":\"/b\",\"value\":2}"),
    ];

    const POINTER: [(&str, &str, &str); 12] = [
        ("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "", "{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}"),
        ("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/foo", "[\"bar\",\"baz\"]"),
        ("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/foo/0", "\"bar\""),
        ("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/", "0"),
        ("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/a~1b", "1"),
        ("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/c%d", "2"),
        ("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/e^f", "3"),
        ("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/g|h", "4"),
        ("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/i\\j", "5"),
        ("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/k\"l", "6"),
        ("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/ ", "7"),
        ("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/m~0n", "8"),
    ];

    const POINTER_INVALID: [&str; 7] = [
        "/foo/2",
        "/foo/-",
        "/foo/01",
        "foo",
        "/nope",
        "/m~2n",
        "/foo/0/x",
    ];

    const MERGE: [(&str, &str, &str); 15] = [
        ("{\"a\":\"b\"}", "{\"a\":\"c\"}", "{\"a\":\"c\"}"),
        ("{\"a\":\"b\"}", "{\"b\":\"c\"}", "{\"a\":\"b\",\"b\":\"c\"}"),
        ("{\"a\":\"b\"}", "{\"a\":null}", "{}"),
        ("{\"a\":\"b\",\"b\":\"c\"}", "{\"a\":null}", "{\"b\":\"c\"}"),
        ("{\"a\":[\"b\"]}", "{\"a\":\"c\"}", "{\"a\":\"c\"}"),
        ("{\"a\":\"c\"}", "{\"a\":[\"b\"]}", "{\"a\":[\"b\"]}"),
        ("{\"a\":{\"b\":\"c\"}}", "{\"a\":{\"b\":\"d\",\"c\":null}}", "{\"a\":{\"b\":\"d\"}}"),
        ("{\"a\":[{\"b\":\"c\"}]}", "{\"a\":[1]}", "{\"a\":[1]}"),
        ("[\"a\",\"b\"]", "[\"c\",\"d\"]", "[\"c\",\"d\"]"),
        ("{\"a\":\"b\"}", "[\"c\"]", "[\"c\"]"),
        ("{\"a\":\"foo\"}", "null", "null"),
        ("{\"a\":\"foo\"}", "\"bar\"", "\"bar\""),
        ("{\"e\":null}", "{\"a\":1}", "{\"a\":1,\"e\":null}"),
        ("[1,2]", "{\"a\":\"b\",\"c\":null}", "{\"a\":\"b\"}"),
        ("{}", "{\"a\":{\"bb\":{\"ccc\":null}}}", "{\"a\":{\"bb\":{}}}"),
    ];

    const CREATE: [(&str, &str, &str); 11] = [
        ("{\"a\":1,\"b\":[1,2,3]}", "{\"a\":2,\"b\":[1],\"c\":true}", "[{\"op\":\"replace\",\"path\":\"/a\",\"value\":2},{\"op\":\"remove\",\"path\":\"/b/2\"},{\"op\":\"remove\",\"path\":\"/b/1\"},{\"op\":\"add\",\"path\":\"/c\",\"value\":true}]"),
        ("{\"x\":{\"y\":{\"z\":1}}}", "{\"x\":{\"y\":{\"w\":[null],\"z\":1}}}", "[{\"op\":\"add\",\"path\":\"/x/y/w\",\"value\":[null]}]"),
        ("[1,2]", "[1,2,3,4]", "[{\"op\":\"add\",\"path\":\"/2\",\"value\":3},{\"op\":\"add\",\"path\":\"/3\",\"value\":4}]"),
        ("{\"a/b\":1,\"m~n\":2}", "{\"a/b\":3}", "[{\"op\":\"replace\",\"path\":\"/a~1b\",\"value\":3},{\"op\":\"remove\",\"path\":\"/m~0n\"}]"),
        ("\"s\"", "{\"k\":\"s\"}", "[{\"op\":\"replace\",\"path\":\"\",\"value\":{\"k\":\"s\"}}]"),
        ("{\"k\":[1,{\"q\":1}]}", "{\"k\":[2,{\"q\":2}]}", "[{\"op\":\"replace\",\"path\":\"/k/0\",\"value\":2},{\"op\":\"replace\",\"path\":\"/k/1/q\",\"value\":2}]"),
        ("{\"same\":1}", "{\"same\":1}", "[]"),
        ("null", "false", "[{\"op\":\"replace\",\"path\":\"\",\"value\":false}]"),
        ("{\"Z\":3,\"a\":2,\"b\":1,\"é\":4}", "{}", "[{\"op\":\"remove\",\"path\":\"/Z\"},{\"op\":\"remove\",\"path\":\"/a\"},{\"op\":\"remove\",\"path\":\"/b\"},{\"op\":\"remove\",\"path\":\"/é\"}]"),
        ("[]", "[[]]", "[{\"op\":\"add\",\"path\":\"/0\",\"value\":[]}]"),
        ("{\"n\":[1,2,3]}", "{\"n\":[3,2,1]}", "[{\"op\":\"replace\",\"path\":\"/n/0\",\"value\":3},{\"op\":\"replace\",\"path\":\"/n/2\",\"value\":1}]"),
    ];

    const PARSE_INVALID: [&str; 20] = [
        "",
        "{",
        "{\"a\":1,}",
        "[1,]",
        "01",
        "1.",
        ".5",
        "+1",
        "{'a':1}",
        "{\"a\" 1}",
        "\"\\x\"",
        "\"a",
        "tru",
        "nul",
        "[1 2]",
        "\"\t\"",
        "{\"a\":1}x",
        "NaN",
        "1e",
        "\"\\ud800\"",
    ];

    const PARSE_VALID: [(&str, &str); 6] = [
        (" {\"a\" : [1, -2, 3.5e2, true, false, null, \"x\\n\\u00e9\\ud83d\\ude00\"]} ", "{\"a\":[1,-2,350,true,false,null,\"x\\né😀\"]}"),
        ("\"\\u0001\\\"\\\\/\"", "\"\\u0001\\\"\\\\/\""),
        ("[]", "[]"),
        ("{}", "{}"),
        ("-0", "0"),
        ("1E+2", "100"),
    ];
}
