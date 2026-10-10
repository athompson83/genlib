// SPDX-License-Identifier: Apache-2.0

//! Safe arithmetic expression evaluation (a small recursive-descent parser;
//! no eval, reflection or code execution) and loan / compound-interest
//! helpers rounded to cents.

use std::collections::HashMap;
use std::fmt;

/// Longest accepted expression, in characters.
pub const MAX_EXPRESSION_LENGTH: usize = 1000;
/// Deepest accepted nesting of parentheses and unary operators.
pub const MAX_DEPTH: usize = 200;

/// Evaluation and input errors.
#[derive(Clone, Debug, PartialEq)]
pub enum CalcError {
    Empty,
    TooLong,
    TooDeep,
    UnexpectedChar(usize),
    InvalidNumber(usize),
    UnexpectedToken(String, usize),
    UnexpectedEnd,
    MismatchedParentheses(usize),
    UnknownIdentifier(String),
    DivisionByZero,
    RemainderByZero,
    NonFinite,
    InvalidInput(&'static str),
}

impl fmt::Display for CalcError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CalcError::Empty => f.write_str("empty expression"),
            CalcError::TooLong => write!(
                f,
                "expression longer than {MAX_EXPRESSION_LENGTH} characters"
            ),
            CalcError::TooDeep => f.write_str("expression nested too deeply"),
            CalcError::UnexpectedChar(p) => write!(f, "unexpected character at position {p}"),
            CalcError::InvalidNumber(p) => write!(f, "invalid number at position {p}"),
            CalcError::UnexpectedToken(t, p) => write!(f, "unexpected token {t:?} at position {p}"),
            CalcError::UnexpectedEnd => f.write_str("unexpected end of expression"),
            CalcError::MismatchedParentheses(p) => {
                write!(f, "mismatched parentheses at position {p}")
            }
            CalcError::UnknownIdentifier(name) => write!(f, "unknown identifier {name:?}"),
            CalcError::DivisionByZero => f.write_str("division by zero"),
            CalcError::RemainderByZero => f.write_str("remainder by zero"),
            CalcError::NonFinite => f.write_str("result is not finite"),
            CalcError::InvalidInput(msg) => f.write_str(msg),
        }
    }
}

impl std::error::Error for CalcError {}

#[derive(Clone, Debug, PartialEq)]
enum Tok {
    Num(f64),
    Ident(String),
    Op(u8),
    End,
}

fn tokenize(s: &str) -> Result<Vec<(Tok, usize)>, CalcError> {
    let b = s.as_bytes();
    let mut toks = Vec::new();
    let mut i = 0;
    while i < b.len() {
        let c = b[i];
        if matches!(c, b' ' | b'\t' | b'\n' | b'\r') {
            i += 1;
        } else if c.is_ascii_digit() || (c == b'.' && b.get(i + 1).is_some_and(u8::is_ascii_digit))
        {
            let start = i;
            while i < b.len() && b[i].is_ascii_digit() {
                i += 1;
            }
            if i < b.len() && b[i] == b'.' {
                i += 1;
                while i < b.len() && b[i].is_ascii_digit() {
                    i += 1;
                }
            }
            if i < b.len() && (b[i] == b'e' || b[i] == b'E') {
                let mut j = i + 1;
                if j < b.len() && (b[j] == b'+' || b[j] == b'-') {
                    j += 1;
                }
                if j >= b.len() || !b[j].is_ascii_digit() {
                    return Err(CalcError::InvalidNumber(start));
                }
                while j < b.len() && b[j].is_ascii_digit() {
                    j += 1;
                }
                i = j;
            }
            let v: f64 = s[start..i]
                .parse()
                .map_err(|_| CalcError::InvalidNumber(start))?;
            if !v.is_finite() {
                return Err(CalcError::InvalidNumber(start));
            }
            toks.push((Tok::Num(v), start));
        } else if c == b'_' || c.is_ascii_alphabetic() {
            let start = i;
            while i < b.len() && (b[i] == b'_' || b[i].is_ascii_alphanumeric()) {
                i += 1;
            }
            toks.push((Tok::Ident(s[start..i].to_string()), start));
        } else if b"+-*/%^()".contains(&c) {
            toks.push((Tok::Op(c), i));
            i += 1;
        } else {
            return Err(CalcError::UnexpectedChar(i));
        }
    }
    toks.push((Tok::End, b.len()));
    Ok(toks)
}

struct Parser<'a> {
    toks: Vec<(Tok, usize)>,
    pos: usize,
    depth: usize,
    vars: &'a HashMap<String, f64>,
}

fn checked(v: f64) -> Result<f64, CalcError> {
    if v.is_finite() {
        Ok(v)
    } else {
        Err(CalcError::NonFinite)
    }
}

impl Parser<'_> {
    fn peek_op(&self) -> Option<u8> {
        match self.toks[self.pos].0 {
            Tok::Op(c) => Some(c),
            _ => None,
        }
    }

    fn unexpected(&self) -> CalcError {
        let (tok, pos) = &self.toks[self.pos];
        match tok {
            Tok::End => CalcError::UnexpectedEnd,
            Tok::Op(b')') => CalcError::MismatchedParentheses(*pos),
            Tok::Op(c) => CalcError::UnexpectedToken((*c as char).to_string(), *pos),
            Tok::Num(n) => CalcError::UnexpectedToken(n.to_string(), *pos),
            Tok::Ident(name) => CalcError::UnexpectedToken(name.clone(), *pos),
        }
    }

    fn enter(&mut self) -> Result<(), CalcError> {
        self.depth += 1;
        if self.depth > MAX_DEPTH {
            Err(CalcError::TooDeep)
        } else {
            Ok(())
        }
    }

    // expr := term (('+' | '-') term)*
    fn expr(&mut self) -> Result<f64, CalcError> {
        let mut left = self.term()?;
        while let Some(op @ (b'+' | b'-')) = self.peek_op() {
            self.pos += 1;
            let right = self.term()?;
            left = checked(if op == b'+' {
                left + right
            } else {
                left - right
            })?;
        }
        Ok(left)
    }

    // term := unary (('*' | '/' | '%') unary)*
    fn term(&mut self) -> Result<f64, CalcError> {
        let mut left = self.unary()?;
        while let Some(op @ (b'*' | b'/' | b'%')) = self.peek_op() {
            self.pos += 1;
            let right = self.unary()?;
            left = checked(match op {
                b'*' => left * right,
                b'/' if right == 0.0 => return Err(CalcError::DivisionByZero),
                b'/' => left / right,
                _ if right == 0.0 => return Err(CalcError::RemainderByZero),
                _ => left % right, // Rust's f64 remainder takes the sign of the dividend
            })?;
        }
        Ok(left)
    }

    // unary := ('+' | '-') unary | power   (binds looser than '^')
    fn unary(&mut self) -> Result<f64, CalcError> {
        if let Some(op @ (b'+' | b'-')) = self.peek_op() {
            self.pos += 1;
            self.enter()?;
            let v = self.unary()?;
            self.depth -= 1;
            return Ok(if op == b'-' { -v } else { v });
        }
        self.power()
    }

    // power := primary ('^' unary)?   (right-associative)
    fn power(&mut self) -> Result<f64, CalcError> {
        let base = self.primary()?;
        if self.peek_op() != Some(b'^') {
            return Ok(base);
        }
        self.pos += 1;
        self.enter()?;
        let exp = self.unary()?;
        self.depth -= 1;
        checked(base.powf(exp))
    }

    // primary := number | identifier | '(' expr ')'
    fn primary(&mut self) -> Result<f64, CalcError> {
        let (tok, _) = self.toks[self.pos].clone();
        match tok {
            Tok::Num(v) => {
                self.pos += 1;
                Ok(v)
            }
            Tok::Ident(name) => {
                self.pos += 1;
                match self.vars.get(&name) {
                    Some(v) => checked(*v),
                    None => Err(CalcError::UnknownIdentifier(name)),
                }
            }
            Tok::Op(b'(') => {
                self.pos += 1;
                self.enter()?;
                let v = self.expr()?;
                self.depth -= 1;
                if self.peek_op() != Some(b')') {
                    return Err(match self.toks[self.pos] {
                        (Tok::End, p) => CalcError::MismatchedParentheses(p),
                        _ => self.unexpected(),
                    });
                }
                self.pos += 1;
                Ok(v)
            }
            _ => Err(self.unexpected()),
        }
    }
}

/// Evaluates `expression` with double precision using `variables`.
pub fn evaluate(expression: &str, variables: &HashMap<String, f64>) -> Result<f64, CalcError> {
    if expression.chars().count() > MAX_EXPRESSION_LENGTH {
        return Err(CalcError::TooLong);
    }
    let toks = tokenize(expression)?;
    if toks.len() == 1 {
        return Err(CalcError::Empty);
    }
    let mut p = Parser {
        toks,
        pos: 0,
        depth: 0,
        vars: variables,
    };
    let v = p.expr()?;
    if p.toks[p.pos].0 != Tok::End {
        return Err(p.unexpected());
    }
    checked(v)
}

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0 // f64::round rounds half away from zero
}

fn validate_loan(principal: f64, rate: f64, months: u32) -> Result<(), CalcError> {
    if !(principal.is_finite() && principal >= 0.0 && rate.is_finite() && rate >= 0.0)
        || months == 0
        || months > 1200
    {
        return Err(CalcError::InvalidInput(
            "principal and rate must be finite and non-negative; months must be 1..=1200",
        ));
    }
    Ok(())
}

/// Fixed monthly payment rounded half away from zero to cents; a zero rate
/// gives principal / months.
pub fn loan_payment(
    principal: f64,
    annual_rate_percent: f64,
    months: u32,
) -> Result<f64, CalcError> {
    validate_loan(principal, annual_rate_percent, months)?;
    if annual_rate_percent == 0.0 {
        return Ok(round2(principal / months as f64));
    }
    let r = annual_rate_percent / 100.0 / 12.0;
    Ok(round2(
        principal * r / (1.0 - (1.0 + r).powi(-(months as i32))),
    ))
}

/// One amortization period; money values are rounded to cents.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Row {
    pub period: u32,
    pub payment: f64,
    pub interest: f64,
    pub principal: f64,
    pub balance: f64,
}

/// Monthly schedule computed in integer cents. The final payment absorbs
/// rounding so the balance ends at exactly 0.00 and the principal column
/// sums to the original principal.
pub fn amortization_schedule(
    principal: f64,
    annual_rate_percent: f64,
    months: u32,
) -> Result<Vec<Row>, CalcError> {
    let payment = loan_payment(principal, annual_rate_percent, months)?;
    let payment_cents = (payment * 100.0).round() as i64;
    let mut balance = (principal * 100.0).round() as i64;
    let r = annual_rate_percent / 100.0 / 12.0;
    let mut rows = Vec::with_capacity(months as usize);
    for period in 1..=months {
        let interest = (balance as f64 * r).round() as i64;
        let mut principal_part = payment_cents - interest;
        if period == months || principal_part > balance {
            principal_part = balance;
        }
        balance -= principal_part;
        rows.push(Row {
            period,
            payment: (principal_part + interest) as f64 / 100.0,
            interest: interest as f64 / 100.0,
            principal: principal_part as f64 / 100.0,
            balance: balance as f64 / 100.0,
        });
    }
    Ok(rows)
}

/// Future value principal·(1 + r/n)^(n·years), rounded to cents.
pub fn compound_interest(
    principal: f64,
    annual_rate_percent: f64,
    compounds_per_year: u32,
    years: f64,
) -> Result<f64, CalcError> {
    if !(principal.is_finite()
        && principal >= 0.0
        && annual_rate_percent.is_finite()
        && annual_rate_percent >= 0.0
        && years.is_finite()
        && years >= 0.0)
        || compounds_per_year == 0
    {
        return Err(CalcError::InvalidInput("invalid compound interest input"));
    }
    let n = compounds_per_year as f64;
    checked(round2(
        principal * (1.0 + annual_rate_percent / 100.0 / n).powf(n * years),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn eval(s: &str) -> Result<f64, CalcError> {
        evaluate(s, &HashMap::new())
    }

    #[test]
    fn expressions() {
        for (s, want) in [
            ("2 + 3 * 4", 14.0),
            ("(2+3)*4", 20.0),
            ("2^3^2", 512.0),
            ("-2^2", -4.0),
            ("10 % 4", 2.0),
            ("-7 % 3", -1.0),
            ("1.5e2 / 3", 50.0),
            ("2^-1", 0.5),
        ] {
            assert_eq!(eval(s), Ok(want), "{s}");
        }
        let vars = HashMap::from([("a".to_string(), 3.0), ("b".to_string(), 0.5)]);
        assert_eq!(evaluate("a*2+b", &vars), Ok(6.5));
    }

    #[test]
    fn expression_errors() {
        assert_eq!(eval("1/0"), Err(CalcError::DivisionByZero));
        assert_eq!(eval("2 % 0"), Err(CalcError::RemainderByZero));
        assert_eq!(eval("(1+2"), Err(CalcError::MismatchedParentheses(4)));
        assert_eq!(eval("1+"), Err(CalcError::UnexpectedEnd));
        assert_eq!(eval("x+1"), Err(CalcError::UnknownIdentifier("x".into())));
        assert_eq!(eval(""), Err(CalcError::Empty));
        assert_eq!(eval("1 + 2)"), Err(CalcError::MismatchedParentheses(5)));
        assert_eq!(eval("10^400"), Err(CalcError::NonFinite));
        assert_eq!(eval(&"1".repeat(1001)), Err(CalcError::TooLong));
        assert_eq!(
            eval(&format!("{}1{}", "(".repeat(300), ")".repeat(300))),
            Err(CalcError::TooDeep)
        );
        assert!(eval("1e").is_err() && eval("2 $ 3").is_err());
    }

    #[test]
    fn loans() {
        assert_eq!(loan_payment(200000.0, 6.0, 360), Ok(1199.10));
        assert_eq!(loan_payment(10000.0, 0.0, 10), Ok(1000.00));
        assert_eq!(loan_payment(1000.0, 12.0, 12), Ok(88.85));
        assert!(loan_payment(1000.0, 5.0, 0).is_err());
    }

    #[test]
    fn schedule() {
        let rows = amortization_schedule(1000.0, 12.0, 12).unwrap();
        assert_eq!(rows.len(), 12);
        assert_eq!(
            rows[0],
            Row {
                period: 1,
                payment: 88.85,
                interest: 10.00,
                principal: 78.85,
                balance: 921.15
            }
        );
        assert_eq!(rows[11].balance, 0.0);
        let cents: i64 = rows
            .iter()
            .map(|r| (r.principal * 100.0).round() as i64)
            .sum();
        assert_eq!(cents, 100000);
    }

    #[test]
    fn compound() {
        assert_eq!(compound_interest(1000.0, 5.0, 12, 10.0), Ok(1647.01));
    }
}
