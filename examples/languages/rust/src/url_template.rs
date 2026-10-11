// SPDX-License-Identifier: Apache-2.0

//! RFC 6570 URI Template expansion, levels 1 to 4.
//!
//! Variables map a name to a [`Value`]: a string, a list of strings or an
//! ordered map of string pairs. A missing variable, an empty list and an empty
//! map are undefined and skipped. Unreserved characters are kept; the `+` and
//! `#` operators also keep reserved characters and existing `%XX` triplets;
//! everything else is percent-encoded as UTF-8 with uppercase hex. A `:n`
//! prefix counts code points and is an error on lists and maps. Literal text
//! keeps unreserved and reserved characters and `%XX` triplets (RFC 6570
//! section 3.1) and encodes the rest, including a bare `%`.

use std::collections::HashMap;
use std::fmt;

/// A template variable value.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Value {
    Str(String),
    List(Vec<String>),
    Map(Vec<(String, String)>),
}

/// An invalid template or a prefix applied to a composite value.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TemplateError(pub String);

impl fmt::Display for TemplateError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "uri template: {}", self.0)
    }
}

impl std::error::Error for TemplateError {}

fn err<T>(m: String) -> Result<T, TemplateError> {
    Err(TemplateError(m))
}

struct Op {
    first: &'static str,
    sep: &'static str,
    named: bool,
    ifemp: &'static str,
    allow: bool,
}

fn op_for(c: Option<char>) -> Op {
    let (first, sep, named, ifemp, allow) = match c {
        Some('+') => ("", ",", false, "", true),
        Some('#') => ("#", ",", false, "", true),
        Some('.') => (".", ".", false, "", false),
        Some('/') => ("/", "/", false, "", false),
        Some(';') => (";", ";", true, "", false),
        Some('?') => ("?", "&", true, "=", false),
        Some('&') => ("&", "&", true, "=", false),
        _ => ("", ",", false, "", false),
    };
    Op {
        first,
        sep,
        named,
        ifemp,
        allow,
    }
}

fn unreserved(c: char) -> bool {
    c.is_ascii_alphanumeric() || "-._~".contains(c)
}

fn reserved(c: char) -> bool {
    ":/?#[]@!$&'()*+,;=".contains(c)
}

fn triplet(r: &[char], i: usize) -> bool {
    r[i] == '%' && i + 2 < r.len() && r[i + 1].is_ascii_hexdigit() && r[i + 2].is_ascii_hexdigit()
}

fn enc(s: &str, allow: bool) -> String {
    let r: Vec<char> = s.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < r.len() {
        let c = r[i];
        if allow && triplet(&r, i) {
            out.extend(&r[i..i + 3]);
            i += 3;
            continue;
        }
        if unreserved(c) || (allow && reserved(c)) {
            out.push(c);
        } else {
            let mut buf = [0u8; 4];
            for b in c.encode_utf8(&mut buf).bytes() {
                out.push_str(&format!("%{b:02X}"));
            }
        }
        i += 1;
    }
    out
}

fn var_unit(r: &[char], i: usize) -> usize {
    if i >= r.len() {
        0
    } else if r[i].is_ascii_alphanumeric() || r[i] == '_' {
        1
    } else if triplet(r, i) {
        3
    } else {
        0
    }
}

fn valid_name(name: &str) -> bool {
    let r: Vec<char> = name.chars().collect();
    let mut n = var_unit(&r, 0);
    if n == 0 {
        return false;
    }
    let mut i = n;
    while i < r.len() {
        if r[i] == '.' {
            i += 1;
        }
        n = var_unit(&r, i);
        if n == 0 {
            return false;
        }
        i += n;
    }
    true
}

fn parse_varspec(spec: &str) -> Result<(&str, usize, bool), TemplateError> {
    let (name, rest) = match spec.find([':', '*']) {
        Some(i) => (&spec[..i], &spec[i..]),
        None => (spec, ""),
    };
    if !valid_name(name) {
        return err(format!("bad varspec: {spec}"));
    }
    if rest.is_empty() {
        return Ok((name, 0, false));
    }
    if rest == "*" {
        return Ok((name, 0, true));
    }
    let digits = &rest[1..];
    if !rest.starts_with(':') || digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return err(format!("bad varspec: {spec}"));
    }
    if digits.starts_with('0') || digits.len() > 4 {
        return err(format!("bad prefix: {spec}"));
    }
    Ok((name, digits.parse().unwrap_or(0), false))
}

fn expand_expr(expr: &str, vars: &HashMap<String, Value>) -> Result<String, TemplateError> {
    let first = match expr.chars().next() {
        Some(c) => c,
        None => return err("empty expression".into()),
    };
    if "=,!@|".contains(first) {
        return err(format!("reserved operator: {first}"));
    }
    let has_op = "+#./;?&".contains(first);
    let o = op_for(if has_op { Some(first) } else { None });
    let body = if has_op { &expr[1..] } else { expr };
    let named = |name: &str, v: &str| {
        if v.is_empty() {
            format!("{}{}", enc(name, o.allow), o.ifemp)
        } else {
            format!("{}={}", enc(name, o.allow), enc(v, o.allow))
        }
    };
    let mut parts: Vec<String> = Vec::new();
    for spec in body.split(',') {
        let (name, prefix, explode) = parse_varspec(spec)?;
        let value = match vars.get(name) {
            None => continue,
            Some(Value::List(l)) if l.is_empty() => continue,
            Some(Value::Map(m)) if m.is_empty() => continue,
            Some(v) => v,
        };
        if let Value::Str(s) = value {
            let v: String = if prefix > 0 {
                s.chars().take(prefix).collect()
            } else {
                s.clone()
            };
            parts.push(if o.named {
                named(name, &v)
            } else {
                enc(&v, o.allow)
            });
            continue;
        }
        if prefix > 0 {
            return err(format!("prefix on composite value: {name}"));
        }
        let items: Vec<String> = match value {
            Value::List(l) => l
                .iter()
                .map(|x| {
                    if explode && o.named {
                        named(name, x)
                    } else {
                        enc(x, o.allow)
                    }
                })
                .collect(),
            Value::Map(m) => m
                .iter()
                .map(|(k, v)| match (explode, o.named) {
                    (false, _) => format!("{},{}", enc(k, o.allow), enc(v, o.allow)),
                    (true, true) => named(k, v),
                    (true, false) => format!("{}={}", enc(k, o.allow), enc(v, o.allow)),
                })
                .collect(),
            Value::Str(_) => unreachable!(),
        };
        if explode {
            parts.push(items.join(o.sep));
        } else if o.named {
            parts.push(format!("{}={}", enc(name, o.allow), items.join(",")));
        } else {
            parts.push(items.join(","));
        }
    }
    if parts.is_empty() {
        Ok(String::new())
    } else {
        Ok(format!("{}{}", o.first, parts.join(o.sep)))
    }
}

/// Expands an RFC 6570 template with the given variables.
pub fn expand_template(
    template: &str,
    vars: &HashMap<String, Value>,
) -> Result<String, TemplateError> {
    let r: Vec<char> = template.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < r.len() {
        match r[i] {
            '{' => {
                let mut j = i + 1;
                while j < r.len() && r[j] != '}' {
                    j += 1;
                }
                if j >= r.len() {
                    return err("unclosed expression".into());
                }
                let expr: String = r[i + 1..j].iter().collect();
                out.push_str(&expand_expr(&expr, vars)?);
                i = j + 1;
            }
            '}' => return err("stray }".into()),
            '%' if triplet(&r, i) => {
                // RFC 6570 section 3.1: a pct-encoded triplet in a literal is copied as-is.
                out.extend(&r[i..i + 3]);
                i += 3;
            }
            c => {
                out.push_str(&enc(&c.to_string(), true));
                i += 1;
            }
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    // Generated from the wave 12 capability vectors; do not edit by hand.
    use super::*;
    use std::collections::HashMap;

    fn vars() -> HashMap<String, Value> {
        let mut m = HashMap::new();
        m.insert(
            "count".to_string(),
            Value::List(vec!["one".into(), "two".into(), "three".into()]),
        );
        m.insert(
            "dom".to_string(),
            Value::List(vec!["example".into(), "com".into()]),
        );
        m.insert("dub".to_string(), Value::Str("me/too".into()));
        m.insert("hello".to_string(), Value::Str("Hello World!".into()));
        m.insert("half".to_string(), Value::Str("50%".into()));
        m.insert("var".to_string(), Value::Str("value".into()));
        m.insert("who".to_string(), Value::Str("fred".into()));
        m.insert(
            "base".to_string(),
            Value::Str("http://example.com/home/".into()),
        );
        m.insert("path".to_string(), Value::Str("/foo/bar".into()));
        m.insert(
            "list".to_string(),
            Value::List(vec!["red".into(), "green".into(), "blue".into()]),
        );
        m.insert(
            "keys".to_string(),
            Value::Map(vec![
                ("semi".into(), ";".into()),
                ("dot".into(), ".".into()),
                ("comma".into(), ",".into()),
            ]),
        );
        m.insert("v".to_string(), Value::Str("6".into()));
        m.insert("x".to_string(), Value::Str("1024".into()));
        m.insert("y".to_string(), Value::Str("768".into()));
        m.insert("empty".to_string(), Value::Str("".into()));
        m.insert("empty_keys".to_string(), Value::Map(vec![]));
        m.insert("empty_list".to_string(), Value::List(vec![]));
        m.insert("utf".to_string(), Value::Str("caf\u{e9} \u{2603}".into()));
        m.insert("emoji".to_string(), Value::Str("\u{1f600}x".into()));
        m
    }

    #[test]
    fn expands_vectors() {
        let v = vars();
        for (t, want) in [
            ("{var}", "value"),
            ("{hello}", "Hello%20World%21"),
            ("{half}", "50%25"),
            ("O{empty}X", "OX"),
            ("O{undef}X", "OX"),
            ("{x,y}", "1024,768"),
            ("{x,hello,y}", "1024,Hello%20World%21,768"),
            ("?{x,empty}", "?1024,"),
            ("?{x,undef}", "?1024"),
            ("?{undef,y}", "?768"),
            ("{var:3}", "val"),
            ("{var:30}", "value"),
            ("{list}", "red,green,blue"),
            ("{list*}", "red,green,blue"),
            ("{keys}", "semi,%3B,dot,.,comma,%2C"),
            ("{keys*}", "semi=%3B,dot=.,comma=%2C"),
            ("{+var}", "value"),
            ("{+hello}", "Hello%20World!"),
            ("{+half}", "50%25"),
            ("{base}index", "http%3A%2F%2Fexample.com%2Fhome%2Findex"),
            ("{+base}index", "http://example.com/home/index"),
            ("{+path:6}/here", "/foo/b/here"),
            ("{+list}", "red,green,blue"),
            ("{+keys*}", "semi=;,dot=.,comma=,"),
            ("{#var}", "#value"),
            ("{#hello}", "#Hello%20World!"),
            ("{#path:6}/here", "#/foo/b/here"),
            ("{#keys*}", "#semi=;,dot=.,comma=,"),
            ("X{.var}", "X.value"),
            ("X{.var:3}", "X.val"),
            ("X{.list*}", "X.red.green.blue"),
            ("{.dom*}", ".example.com"),
            ("{/var}", "/value"),
            ("{/var:1,var}", "/v/value"),
            ("{/list*,path:4}", "/red/green/blue/%2Ffoo"),
            ("{/keys*}", "/semi=%3B/dot=./comma=%2C"),
            ("{;hello:5}", ";hello=Hello"),
            ("{;list*}", ";list=red;list=green;list=blue"),
            ("{;keys*}", ";semi=%3B;dot=.;comma=%2C"),
            ("{;x,y,empty}", ";x=1024;y=768;empty"),
            ("{?x,y,empty}", "?x=1024&y=768&empty="),
            ("{?var:3}", "?var=val"),
            ("{?list}", "?list=red,green,blue"),
            ("{?list*}", "?list=red&list=green&list=blue"),
            ("{?keys}", "?keys=semi,%3B,dot,.,comma,%2C"),
            ("{?keys*}", "?semi=%3B&dot=.&comma=%2C"),
            ("{&var:3}", "&var=val"),
            ("{&keys*}", "&semi=%3B&dot=.&comma=%2C"),
            ("{?empty_keys*}", ""),
            ("{?empty_list}", ""),
            ("{/count*}", "/one/two/three"),
            ("{utf}", "caf%C3%A9%20%E2%98%83"),
            ("{+utf}", "caf%C3%A9%20%E2%98%83"),
            ("{emoji:1}", "%F0%9F%98%80"),
            ("{?utf}", "?utf=caf%C3%A9%20%E2%98%83"),
            ("map?{x,y}#{hello}", "map?1024,768#Hello%20World%21"),
            ("literal%20kept/{var}", "literal%20kept/value"),
            ("sp ace{var}", "sp%20acevalue"),
        ] {
            assert_eq!(expand_template(t, &v).as_deref(), Ok(want), "{t}");
        }
        assert_eq!(expand_template("50%x%4", &v).as_deref(), Ok("50%25x%254"));
    }

    #[test]
    fn rejects_invalid() {
        let v = vars();
        for t in [
            "{var",
            "var}",
            "{}",
            "{=var}",
            "{!var}",
            "{@var}",
            "{|var}",
            "{var:0}",
            "{var:10000}",
            "{va r}",
            "{list:3}",
            "{keys:2}",
            "{var:01}",
        ] {
            assert!(expand_template(t, &v).is_err(), "{t}");
        }
    }
}
