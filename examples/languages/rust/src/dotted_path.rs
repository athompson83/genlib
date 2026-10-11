// SPDX-License-Identifier: Apache-2.0

//! Dotted paths into JSON-like data (`user.addresses[0].city`, `a["x.y"]`) on
//! the [`Json`] value type of the `json_patch` module.
//!
//! Grammar: names are separated by '.', run until '.' or '[' and may not be
//! empty; `[n]` (no leading zeros except 0) is a list index; `["..."]` is a
//! key with `\"` and `\\` escapes. The empty path is the root. [`set_path`]
//! and [`delete_path`] return new values and never mutate their inputs.

use crate::json_patch::Json;
use std::fmt;

/// Bad path syntax or an impossible [`set_path`].
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PathError(pub String);

impl fmt::Display for PathError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "dotted path: {}", self.0)
    }
}

impl std::error::Error for PathError {}

fn err<T>(m: &str) -> Result<T, PathError> {
    Err(PathError(m.to_string()))
}

/// One path step: an object key or a list index.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Segment {
    Key(String),
    Index(usize),
}

/// Splits a path into keys and indexes; "" yields no segments (the root).
pub fn parse_path(p: &str) -> Result<Vec<Segment>, PathError> {
    let r: Vec<char> = p.chars().collect();
    let n = r.len();
    let mut out = Vec::new();
    let mut i = 0;
    while i < n {
        let c = r[i];
        if c == '[' {
            if i + 1 < n && r[i + 1] == '"' {
                let mut j = i + 2;
                let mut buf = String::new();
                loop {
                    if j >= n {
                        return err("unterminated quoted key");
                    }
                    if r[j] == '\\' && j + 1 < n {
                        buf.push(r[j + 1]);
                        j += 2;
                        continue;
                    }
                    if r[j] == '"' {
                        break;
                    }
                    buf.push(r[j]);
                    j += 1;
                }
                if j + 1 >= n || r[j + 1] != ']' {
                    return err("expected ]");
                }
                out.push(Segment::Key(buf));
                i = j + 2;
            } else {
                let mut j = i + 1;
                while j < n && r[j].is_ascii_digit() {
                    j += 1;
                }
                let digits: String = r[i + 1..j].iter().collect();
                if digits.is_empty()
                    || (digits.len() > 1 && digits.starts_with('0'))
                    || j >= n
                    || r[j] != ']'
                {
                    return err("bad index");
                }
                out.push(Segment::Index(digits.parse().unwrap_or(usize::MAX)));
                i = j + 1;
            }
            if i < n && r[i] == '.' {
                i += 1;
                if i >= n {
                    return err("trailing dot");
                }
            }
            continue;
        }
        if c == '.' {
            return err("empty segment");
        }
        let mut j = i;
        while j < n && r[j] != '.' && r[j] != '[' {
            j += 1;
        }
        out.push(Segment::Key(r[i..j].iter().collect()));
        i = j;
        if i < n && r[i] == '.' {
            i += 1;
            if i >= n {
                return err("trailing dot");
            }
        }
    }
    Ok(out)
}

fn step<'a>(cur: &'a Json, k: &Segment) -> Option<&'a Json> {
    match (cur, k) {
        (Json::Array(l), Segment::Index(i)) => l.get(*i),
        (Json::Object(m), Segment::Key(key)) => {
            m.iter().find(|(name, _)| name == key).map(|(_, v)| v)
        }
        _ => None,
    }
}

fn resolve<'a>(data: &'a Json, keys: &[Segment]) -> Option<&'a Json> {
    keys.iter().try_fold(data, step)
}

/// Returns the value at `path`, or `default` when a key or index is missing or a step meets the wrong type.
pub fn get_path(data: &Json, path: &str, default: &Json) -> Result<Json, PathError> {
    let keys = parse_path(path)?;
    Ok(resolve(data, &keys).unwrap_or(default).clone())
}

/// Reports whether `path` resolves to a value (which may be null).
pub fn has_path(data: &Json, path: &str) -> Result<bool, PathError> {
    let keys = parse_path(path)?;
    Ok(resolve(data, &keys).is_some())
}

fn set_rec(cur: Option<&Json>, keys: &[Segment], value: &Json) -> Result<Json, PathError> {
    let Some((k, rest)) = keys.split_first() else {
        return Ok(value.clone());
    };
    let empty_list = Json::Array(Vec::new());
    let empty_object = Json::Object(Vec::new());
    let cur = match cur {
        None | Some(Json::Null) => match k {
            Segment::Index(_) => &empty_list,
            Segment::Key(_) => &empty_object,
        },
        Some(v) => v,
    };
    match k {
        Segment::Index(i) => {
            let Json::Array(l) = cur else {
                return err("index on a non-list");
            };
            if *i > l.len() {
                return err("index out of range");
            }
            let mut new = l.clone();
            let v = set_rec(new.get(*i), rest, value)?;
            if *i == new.len() {
                new.push(v);
            } else {
                new[*i] = v;
            }
            Ok(Json::Array(new))
        }
        Segment::Key(key) => {
            let Json::Object(m) = cur else {
                return err("key on a non-object");
            };
            let mut new = m.clone();
            let pos = new.iter().position(|(name, _)| name == key);
            let v = set_rec(pos.map(|p| &new[p].1), rest, value)?;
            match pos {
                Some(p) => new[p].1 = v,
                None => new.push((key.clone(), v)),
            }
            Ok(Json::Object(new))
        }
    }
}

/// Returns a copy of `data` with `value` at `path`, creating objects or lists as needed; index == len appends.
pub fn set_path(data: &Json, path: &str, value: &Json) -> Result<Json, PathError> {
    let keys = parse_path(path)?;
    set_rec(Some(data), &keys, value)
}

fn delete_rec(cur: &Json, keys: &[Segment]) -> Json {
    let (k, rest) = keys.split_first().expect("non-empty path");
    let Some(child) = step(cur, k) else {
        return cur.clone();
    };
    match (cur, k) {
        (Json::Array(l), Segment::Index(i)) => {
            let mut new = l.clone();
            if rest.is_empty() {
                new.remove(*i);
            } else {
                new[*i] = delete_rec(child, rest);
            }
            Json::Array(new)
        }
        (Json::Object(m), Segment::Key(key)) => {
            let mut new = m.clone();
            let p = new
                .iter()
                .position(|(name, _)| name == key)
                .expect("present");
            if rest.is_empty() {
                new.remove(p);
            } else {
                new[p].1 = delete_rec(child, rest);
            }
            Json::Object(new)
        }
        _ => cur.clone(),
    }
}

/// Returns a copy of `data` without the key or index at `path` (lists shift); a missing path returns an unchanged copy and "" returns null.
pub fn delete_path(data: &Json, path: &str) -> Result<Json, PathError> {
    let keys = parse_path(path)?;
    if keys.is_empty() {
        return Ok(Json::Null);
    }
    Ok(delete_rec(data, &keys))
}

#[cfg(test)]
#[allow(clippy::type_complexity, clippy::single_element_loop)] // generated vector tables
mod tests {
    // Generated from the wave 11 capability vectors; do not edit by hand.
    use super::*;

    use crate::json_patch::{equal, parse};

    const DATA: &str = "{\"user\":{\"name\":\"Ada\",\"tags\":[\"a\",\"b\"],\"addr\":[{\"city\":\"Paris\"},{\"city\":\"Rome\"}],\"x.y\":{\"z\":1}},\"n\":0,\"nil\":null}";

    fn j(s: &str) -> Json {
        parse(s).unwrap()
    }

    #[test]
    fn parse_vectors() {
        let cases: Vec<(&str, Vec<Segment>)> = vec![
            ("", vec![]),
            ("a", vec![Segment::Key("a".into())]),
            (
                "a.b.c",
                vec![
                    Segment::Key("a".into()),
                    Segment::Key("b".into()),
                    Segment::Key("c".into()),
                ],
            ),
            ("a[0]", vec![Segment::Key("a".into()), Segment::Index(0)]),
            (
                "a[0][1].b",
                vec![
                    Segment::Key("a".into()),
                    Segment::Index(0),
                    Segment::Index(1),
                    Segment::Key("b".into()),
                ],
            ),
            (
                "[\"x.y\"].z",
                vec![Segment::Key("x.y".into()), Segment::Key("z".into())],
            ),
            (
                "user[\"x.y\"].z",
                vec![
                    Segment::Key("user".into()),
                    Segment::Key("x.y".into()),
                    Segment::Key("z".into()),
                ],
            ),
            (
                "a[\"q\\\"t\"]",
                vec![Segment::Key("a".into()), Segment::Key("q\"t".into())],
            ),
        ];
        for (p, want) in cases {
            assert_eq!(parse_path(p), Ok(want), "{p:?}");
        }
    }

    #[test]
    fn get_has_vectors() {
        let doc = j(DATA);
        let def = Json::String("DEF".into());
        let cases: &[(&str, &str)] = &[
            ("user.name", "\"Ada\""),
            ("user.tags[1]", "\"b\""),
            ("user.addr[1].city", "\"Rome\""),
            ("user[\"x.y\"].z", "1"),
            ("user.missing", "\"DEF\""),
            ("user.tags[5]", "\"DEF\""),
            ("user.name.first", "\"DEF\""),
            ("n", "0"),
            ("nil", "null"),
            ("", "{\"user\":{\"name\":\"Ada\",\"tags\":[\"a\",\"b\"],\"addr\":[{\"city\":\"Paris\"},{\"city\":\"Rome\"}],\"x.y\":{\"z\":1}},\"n\":0,\"nil\":null}"),
            ("user.tags.0", "\"DEF\""),
        ];
        for &(p, want) in cases {
            let got = get_path(&doc, p, &def).unwrap();
            assert!(equal(&got, &j(want)), "{p:?}: {got:?}");
        }
        let has: &[(&str, bool)] = &[
            ("user.name", true),
            ("nil", true),
            ("user.nope", false),
            ("user.tags[2]", false),
        ];
        for &(p, want) in has {
            assert_eq!(has_path(&doc, p), Ok(want), "{p:?}");
        }
    }

    #[test]
    fn set_vectors() {
        let cases: &[(&str, &str, &str, &str)] = &[
            ("{}", "a.b", "1", "{\"a\":{\"b\":1}}"),
            ("{}", "a[0].b", "1", "{\"a\":[{\"b\":1}]}"),
            ("{\"a\":[1]}", "a[1]", "2", "{\"a\":[1,2]}"),
            (
                "{\"a\":{\"b\":1}}",
                "a.c",
                "[1,2]",
                "{\"a\":{\"b\":1,\"c\":[1,2]}}",
            ),
            ("null", "x", "true", "{\"x\":true}"),
            ("{\"a\":1}", "", "{\"z\":2}", "{\"z\":2}"),
            ("{}", "[\"k.v\"]", "3", "{\"k.v\":3}"),
        ];
        for &(d, p, v, want) in cases {
            let input = j(d);
            let got = set_path(&input, p, &j(v)).unwrap();
            assert!(equal(&got, &j(want)), "{d} {p:?}: {got:?}");
            assert_eq!(input, j(d), "input unchanged");
        }
        let invalid: &[(&str, &str, &str)] = &[
            ("{\"a\":[1]}", "a[3]", "0"),
            ("{\"a\":1}", "a.b", "0"),
            ("{\"a\":{}}", "a[0]", "0"),
        ];
        for &(d, p, v) in invalid {
            assert!(set_path(&j(d), p, &j(v)).is_err(), "{d} {p:?}");
        }
    }

    #[test]
    fn delete_vectors() {
        let cases: &[(&str, &str, &str)] = &[
            ("{\"a\":{\"b\":1,\"c\":2}}", "a.b", "{\"a\":{\"c\":2}}"),
            ("{\"a\":[1,2,3]}", "a[0]", "{\"a\":[2,3]}"),
            ("{\"a\":1}", "b", "{\"a\":1}"),
            ("{\"a\":[1]}", "a[4]", "{\"a\":[1]}"),
        ];
        for &(d, p, want) in cases {
            let input = j(d);
            let got = delete_path(&input, p).unwrap();
            assert!(equal(&got, &j(want)), "{d} {p:?}: {got:?}");
            assert_eq!(input, j(d), "input unchanged");
        }
    }

    #[test]
    fn invalid_parse_vectors() {
        for p in ["a.", ".a", "a..b", "a[01]", "a[x]", "a[\"x", "a[1", "a[-1]"] {
            assert!(parse_path(p).is_err(), "{p:?}");
        }
    }
}
