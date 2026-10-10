// SPDX-License-Identifier: Apache-2.0

//! Server-side form validation against an ordered schema, returning stable
//! error codes per field. Patterns use the `regex` crate (linear-time
//! matching, no backtracking) and must match the whole value.

use regex::Regex;
use std::collections::HashSet;
use std::fmt;

/// Submitted value (for example decoded from JSON or a form body).
#[derive(Clone, Debug, PartialEq)]
pub enum Value {
    Null,
    Bool(bool),
    Number(f64),
    Text(String),
}

/// Field type.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FieldType {
    String,
    Number,
    Integer,
    Boolean,
    Email,
    Date,
}

/// One schema field; `None` means "no constraint".
#[derive(Clone, Debug)]
pub struct Field {
    pub name: String,
    pub field_type: FieldType,
    pub required: bool,
    pub min_length: Option<usize>,
    pub max_length: Option<usize>,
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub pattern: Option<String>,
    pub allowed: Option<Vec<String>>,
}

impl Field {
    /// A field with no constraints beyond its type.
    pub fn new(name: &str, field_type: FieldType) -> Self {
        Field {
            name: name.to_string(),
            field_type,
            required: false,
            min_length: None,
            max_length: None,
            min: None,
            max: None,
            pattern: None,
            allowed: None,
        }
    }
}

/// A malformed schema (duplicate/empty name or invalid pattern).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SchemaError(pub String);

impl fmt::Display for SchemaError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "invalid schema: {}", self.0)
    }
}

impl std::error::Error for SchemaError {}

/// Field name and its error codes.
pub type FieldErrors = (String, Vec<&'static str>);

/// Validates ordered `values` against `schema`. Returns only fields with
/// errors, in schema order, then unknown keys in input order (code
/// "unknown") unless `allow_unknown`. The first occurrence of a key is used.
pub fn validate(
    schema: &[Field],
    values: &[(&str, Value)],
    allow_unknown: bool,
) -> Result<Vec<FieldErrors>, SchemaError> {
    let mut known = HashSet::new();
    let mut patterns = Vec::with_capacity(schema.len());
    for f in schema {
        if f.name.is_empty() || !known.insert(f.name.as_str()) {
            return Err(SchemaError(format!(
                "empty or duplicate field name {:?}",
                f.name
            )));
        }
        patterns.push(match &f.pattern {
            Some(p) => Some(
                Regex::new(&format!("^(?:{p})$"))
                    .map_err(|e| SchemaError(format!("field {:?}: {e}", f.name)))?,
            ),
            None => None,
        });
    }
    let mut out = Vec::new();
    for (f, pattern) in schema.iter().zip(&patterns) {
        let value = values.iter().find(|(k, _)| *k == f.name).map(|(_, v)| v);
        let codes = check_field(f, pattern.as_ref(), value);
        if !codes.is_empty() {
            out.push((f.name.clone(), codes));
        }
    }
    if !allow_unknown {
        let mut reported = HashSet::new();
        for (k, _) in values {
            if !known.contains(k) && reported.insert(*k) {
                out.push((k.to_string(), vec!["unknown"]));
            }
        }
    }
    Ok(out)
}

fn check_field(f: &Field, pattern: Option<&Regex>, value: Option<&Value>) -> Vec<&'static str> {
    let value = match value {
        None | Some(Value::Null) => None,
        Some(Value::Text(s)) if s.is_empty() => None,
        Some(v) => Some(v),
    };
    let value = match value {
        Some(v) => v,
        None if f.required => return vec!["required"],
        None => return Vec::new(),
    };
    let mut codes = Vec::new();
    match f.field_type {
        FieldType::Boolean => {
            if !matches!(value, Value::Bool(_)) {
                return vec!["type"];
            }
        }
        FieldType::Number | FieldType::Integer => {
            let n = match value {
                Value::Number(n)
                    if n.is_finite() && (f.field_type == FieldType::Number || n.fract() == 0.0) =>
                {
                    *n
                }
                _ => return vec!["type"],
            };
            if f.min.is_some_and(|m| n < m) {
                codes.push("min");
            }
            if f.max.is_some_and(|m| n > m) {
                codes.push("max");
            }
        }
        FieldType::String | FieldType::Email | FieldType::Date => {
            let s = match value {
                Value::Text(s) => s.as_str(),
                _ => return vec!["type"],
            };
            let length = s.chars().count();
            if f.min_length.is_some_and(|m| length < m) {
                codes.push("minLength");
            }
            if f.max_length.is_some_and(|m| length > m) {
                codes.push("maxLength");
            }
            if pattern.is_some_and(|re| !re.is_match(s)) {
                codes.push("pattern");
            }
            if f.allowed
                .as_ref()
                .is_some_and(|list| !list.iter().any(|a| a == s))
            {
                codes.push("enum");
            }
            if f.field_type == FieldType::Email && !valid_email(s) {
                codes.push("email");
            }
            if f.field_type == FieldType::Date && !valid_date(s) {
                codes.push("date");
            }
        }
    }
    codes
}

fn valid_email(s: &str) -> bool {
    if s.chars().count() > 254 || s.matches('@').count() != 1 || s.chars().any(char::is_whitespace)
    {
        return false;
    }
    let (local, domain) = s.split_once('@').unwrap_or(("", ""));
    !local.is_empty() && domain.contains('.')
}

fn valid_date(s: &str) -> bool {
    let b = s.as_bytes();
    if b.len() != 10
        || b[4] != b'-'
        || b[7] != b'-'
        || !b
            .iter()
            .enumerate()
            .all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit())
    {
        return false;
    }
    let num = |r: std::ops::Range<usize>| s[r].parse::<u32>().unwrap_or(0);
    let (year, month, day) = (num(0..4), num(5..7), num(8..10));
    let leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
    let days = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => return false,
    };
    (1..=days).contains(&day)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn schema_s() -> Vec<Field> {
        vec![
            Field {
                required: true,
                min_length: Some(2),
                max_length: Some(5),
                ..Field::new("name", FieldType::String)
            },
            Field {
                min: Some(18.0),
                max: Some(120.0),
                ..Field::new("age", FieldType::Integer)
            },
            Field {
                required: true,
                ..Field::new("email", FieldType::Email)
            },
            Field {
                allowed: Some(vec!["free".into(), "pro".into()]),
                ..Field::new("plan", FieldType::String)
            },
            Field {
                pattern: Some(r"[A-Z]{3}-\d{2}".into()),
                ..Field::new("code", FieldType::String)
            },
            Field::new("start", FieldType::Date),
        ]
    }

    fn t(s: &str) -> Value {
        Value::Text(s.to_string())
    }

    fn errs(list: &[(&str, &[&'static str])]) -> Vec<FieldErrors> {
        list.iter()
            .map(|(k, v)| (k.to_string(), v.to_vec()))
            .collect()
    }

    #[test]
    fn vectors() {
        let s = schema_s();
        let ok = [
            ("name", t("Al")),
            ("age", Value::Number(30.0)),
            ("email", t("a@b.co")),
            ("plan", t("pro")),
            ("code", t("ABC-12")),
            ("start", t("2024-02-29")),
        ];
        assert_eq!(validate(&s, &ok, false).unwrap(), errs(&[]));
        assert_eq!(
            validate(&s, &[("name", t("")), ("email", t("bad"))], false).unwrap(),
            errs(&[("name", &["required"]), ("email", &["email"])])
        );
        let bad = [
            ("name", t("Abcdef")),
            ("age", Value::Number(17.5)),
            ("email", t("a@b.co")),
            ("plan", t("team")),
            ("code", t("abc-12")),
            ("start", t("2023-02-29")),
        ];
        assert_eq!(
            validate(&s, &bad, false).unwrap(),
            errs(&[
                ("name", &["maxLength"]),
                ("age", &["type"]),
                ("plan", &["enum"]),
                ("code", &["pattern"]),
                ("start", &["date"])
            ])
        );
        assert_eq!(
            validate(
                &s,
                &[("name", t("Al")), ("email", t("a@b.co")), ("age", t("30"))],
                false
            )
            .unwrap(),
            errs(&[("age", &["type"])])
        );
        let extra = [
            ("name", t("Al")),
            ("email", t("a@b.co")),
            ("extra", Value::Number(1.0)),
        ];
        assert_eq!(
            validate(&s, &extra, false).unwrap(),
            errs(&[("extra", &["unknown"])])
        );
        assert_eq!(validate(&s, &extra, true).unwrap(), errs(&[]));
        assert_eq!(
            validate(
                &s,
                &[
                    ("name", t("Al")),
                    ("email", t("a@b.co")),
                    ("age", Value::Number(121.0))
                ],
                false
            )
            .unwrap(),
            errs(&[("age", &["max"])])
        );
        assert_eq!(
            validate(&s, &[("name", t("Ā")), ("email", t("a@b.co"))], false).unwrap(),
            errs(&[("name", &["minLength"])])
        );
    }

    #[test]
    fn types_and_schema_errors() {
        let s = vec![
            Field {
                required: true,
                ..Field::new("ok", FieldType::Boolean)
            },
            Field::new("n", FieldType::Number),
        ];
        assert_eq!(
            validate(&s, &[("ok", t("true")), ("n", Value::Bool(true))], false).unwrap(),
            errs(&[("ok", &["type"]), ("n", &["type"])])
        );
        assert_eq!(
            validate(
                &s,
                &[("ok", Value::Bool(false)), ("n", Value::Number(1.5))],
                false
            )
            .unwrap(),
            errs(&[])
        );
        assert_eq!(
            validate(&s, &[("ok", Value::Null)], false).unwrap(),
            errs(&[("ok", &["required"])])
        );
        assert!(validate(
            &[Field {
                pattern: Some("(".into()),
                ..Field::new("p", FieldType::String)
            }],
            &[],
            false
        )
        .is_err());
        assert!(validate(
            &[
                Field::new("a", FieldType::String),
                Field::new("a", FieldType::Date)
            ],
            &[],
            false
        )
        .is_err());
        assert!(
            valid_date("2000-02-29")
                && !valid_date("1900-02-29")
                && !valid_date("2024-13-01")
                && !valid_date("2024-1-01")
        );
    }
}
