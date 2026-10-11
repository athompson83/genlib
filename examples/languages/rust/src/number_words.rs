// SPDX-License-Identifier: Apache-2.0

//! US English number words without "and" ("one hundred five", "forty-two"),
//! ordinal words, ordinal suffixes and currency amounts. Magnitudes must be
//! below 10^15 (up to trillions).

use std::fmt;

/// A number out of range or bad money parameters.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WordsError(pub String);

impl fmt::Display for WordsError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "number words: {}", self.0)
    }
}

impl std::error::Error for WordsError {}

fn err<T>(m: &str) -> Result<T, WordsError> {
    Err(WordsError(m.to_string()))
}

const ONES: [&str; 20] = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
];
const TENS: [&str; 10] = [
    "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
];
const SCALES: [&str; 5] = ["", "thousand", "million", "billion", "trillion"];
const LIMIT: i64 = 1_000_000_000_000_000;

fn under_1000(mut n: i64) -> String {
    let mut parts = Vec::new();
    if n >= 100 {
        parts.push(format!("{} hundred", ONES[(n / 100) as usize]));
        n %= 100;
    }
    if n >= 20 {
        let mut w = TENS[(n / 10) as usize].to_string();
        if n % 10 != 0 {
            w.push('-');
            w.push_str(ONES[(n % 10) as usize]);
        }
        parts.push(w);
    } else if n > 0 {
        parts.push(ONES[n as usize].to_string());
    }
    parts.join(" ")
}

/// Spells `n` (|n| < 10^15) in words.
pub fn number_to_words(n: i64) -> Result<String, WordsError> {
    if n >= LIMIT || n <= -LIMIT {
        return err("magnitude must be below 10^15");
    }
    if n == 0 {
        return Ok("zero".into());
    }
    if n < 0 {
        return Ok(format!("negative {}", number_to_words(-n)?));
    }
    let (mut n, mut i, mut groups) = (n, 0, Vec::new());
    while n > 0 {
        let g = n % 1000;
        if g != 0 {
            let mut w = under_1000(g);
            if !SCALES[i].is_empty() {
                w.push(' ');
                w.push_str(SCALES[i]);
            }
            groups.push(w);
        }
        n /= 1000;
        i += 1;
    }
    groups.reverse();
    Ok(groups.join(" "))
}

fn ordinal(w: &str) -> String {
    match w {
        "one" => "first".into(),
        "two" => "second".into(),
        "three" => "third".into(),
        "five" => "fifth".into(),
        "eight" => "eighth".into(),
        "nine" => "ninth".into(),
        "twelve" => "twelfth".into(),
        _ if w.ends_with('y') => format!("{}ieth", &w[..w.len() - 1]),
        _ => format!("{w}th"),
    }
}

/// Spells `n >= 0` as an ordinal ("twenty-first", "one hundredth").
pub fn ordinal_words(n: i64) -> Result<String, WordsError> {
    if n < 0 {
        return err("ordinal words need n >= 0");
    }
    let words = number_to_words(n)?;
    let (head, last) = match words.rfind(' ') {
        Some(i) => (&words[..=i], &words[i + 1..]),
        None => ("", words.as_str()),
    };
    let last = match last.split_once('-') {
        Some((a, b)) => format!("{a}-{}", ordinal(b)),
        None => ordinal(last),
    };
    Ok(format!("{head}{last}"))
}

/// `n` with its English suffix ("1st", "12th", "-22nd").
pub fn ordinal_suffix(n: i64) -> String {
    let a = n.unsigned_abs();
    let s = if (11..=13).contains(&(a % 100)) {
        "th"
    } else {
        match a % 10 {
            1 => "st",
            2 => "nd",
            3 => "rd",
            _ => "th",
        }
    };
    format!("{n}{s}")
}

/// Spells an amount given in minor units ("one dollar and one cent");
/// `exponent` is the number of minor digits (0 to 3) and names get an "s"
/// when the count is not 1.
pub fn money_words(
    minor: i64,
    major: &str,
    minor_name: &str,
    exponent: u32,
) -> Result<String, WordsError> {
    if minor < 0 || exponent > 3 {
        return err("minor must be >= 0 and exponent 0..=3");
    }
    let unit = 10i64.pow(exponent);
    let (whole, frac) = (minor / unit, minor % unit);
    let mut out = format!(
        "{} {major}{}",
        number_to_words(whole)?,
        if whole == 1 { "" } else { "s" }
    );
    if exponent > 0 && frac != 0 {
        out.push_str(&format!(
            " and {} {minor_name}{}",
            number_to_words(frac)?,
            if frac == 1 { "" } else { "s" }
        ));
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    // Generated from the wave 12 capability vectors; do not edit by hand.
    use super::*;

    #[test]
    fn words_vectors() {
        for (n, want) in [
            (0, "zero"),
            (1, "one"),
            (7, "seven"),
            (10, "ten"),
            (11, "eleven"),
            (13, "thirteen"),
            (19, "nineteen"),
            (20, "twenty"),
            (21, "twenty-one"),
            (42, "forty-two"),
            (99, "ninety-nine"),
            (100, "one hundred"),
            (101, "one hundred one"),
            (110, "one hundred ten"),
            (115, "one hundred fifteen"),
            (999, "nine hundred ninety-nine"),
            (1000, "one thousand"),
            (1001, "one thousand one"),
            (1010, "one thousand ten"),
            (1100, "one thousand one hundred"),
            (2024, "two thousand twenty-four"),
            (12345, "twelve thousand three hundred forty-five"),
            (100000, "one hundred thousand"),
            (999999, "nine hundred ninety-nine thousand nine hundred ninety-nine"),
            (1000000, "one million"),
            (1000001, "one million one"),
            (1234567, "one million two hundred thirty-four thousand five hundred sixty-seven"),
            (1000000000, "one billion"),
            (1002003004, "one billion two million three thousand four"),
            (999999999999999, "nine hundred ninety-nine trillion nine hundred ninety-nine billion nine hundred ninety-nine million nine hundred ninety-nine thousand nine hundred ninety-nine"),
            (-1, "negative one"),
            (-42, "negative forty-two"),
            (-1000000, "negative one million"),
        ] {
            assert_eq!(number_to_words(n).as_deref(), Ok(want), "{n}");
        }
        for n in [1000000000000000_i64, -1000000000000000_i64] {
            assert!(number_to_words(n).is_err(), "{n}");
        }
    }

    #[test]
    fn ordinal_vectors() {
        for (n, want) in [
            (0, "zeroth"),
            (1, "first"),
            (2, "second"),
            (3, "third"),
            (4, "fourth"),
            (5, "fifth"),
            (8, "eighth"),
            (9, "ninth"),
            (11, "eleventh"),
            (12, "twelfth"),
            (20, "twentieth"),
            (21, "twenty-first"),
            (22, "twenty-second"),
            (23, "twenty-third"),
            (30, "thirtieth"),
            (40, "fortieth"),
            (99, "ninety-ninth"),
            (100, "one hundredth"),
            (101, "one hundred first"),
            (102, "one hundred second"),
            (111, "one hundred eleventh"),
            (112, "one hundred twelfth"),
            (1000, "one thousandth"),
            (1001, "one thousand first"),
            (1000000, "one millionth"),
            (2023, "two thousand twenty-third"),
        ] {
            assert_eq!(ordinal_words(n).as_deref(), Ok(want), "{n}");
        }
        for n in [-1_i64] {
            assert!(ordinal_words(n).is_err(), "{n}");
        }
        for (n, want) in [
            (0, "0th"),
            (1, "1st"),
            (2, "2nd"),
            (3, "3rd"),
            (4, "4th"),
            (11, "11th"),
            (12, "12th"),
            (13, "13th"),
            (14, "14th"),
            (21, "21st"),
            (22, "22nd"),
            (23, "23rd"),
            (101, "101st"),
            (111, "111th"),
            (112, "112th"),
            (113, "113th"),
            (1001, "1001st"),
            (-1, "-1st"),
            (-11, "-11th"),
            (-22, "-22nd"),
        ] {
            assert_eq!(ordinal_suffix(n), want, "{n}");
        }
    }

    #[test]
    fn money_vectors() {
        for (minor, major, minor_name, exp, want) in [
            (
                12345,
                "dollar",
                "cent",
                2,
                "one hundred twenty-three dollars and forty-five cents",
            ),
            (100, "dollar", "cent", 2, "one dollar"),
            (1, "dollar", "cent", 2, "zero dollars and one cent"),
            (101, "euro", "cent", 2, "one euro and one cent"),
            (0, "dollar", "cent", 2, "zero dollars"),
            (500, "yen", "sen", 0, "five hundred yens"),
            (1001, "dinar", "fils", 3, "one dinar and one fils"),
            (199, "pound", "penny", 2, "one pound and ninety-nine pennys"),
        ] {
            assert_eq!(
                money_words(minor, major, minor_name, exp).as_deref(),
                Ok(want),
                "{minor}"
            );
        }
        assert!(money_words(-1, "dollar", "cent", 2).is_err());
        assert!(money_words(1, "dollar", "cent", 4).is_err());
    }
}
