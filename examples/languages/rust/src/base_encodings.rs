// SPDX-License-Identifier: Apache-2.0

//! Strict Base32 (RFC 4648 sections 6 and 7), Base58 (Bitcoin alphabet) and
//! unpadded Base64url (RFC 4648 section 5). Decoders reject unknown
//! characters, bad padding or length and non-canonical trailing bits, so every
//! accepted text has exactly one byte value. Standard library only.

use std::fmt;

/// Invalid encoded text.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DecodeError(pub String);

impl fmt::Display for DecodeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for DecodeError {}

fn err<T>(m: &str) -> Result<T, DecodeError> {
    Err(DecodeError(m.into()))
}

/// Base32 alphabet.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Base32Alphabet {
    /// A-Z 2-7 (section 6).
    Rfc4648,
    /// 0-9 A-V (section 7).
    Hex,
}

impl Base32Alphabet {
    fn chars(self) -> &'static [u8; 32] {
        match self {
            Base32Alphabet::Rfc4648 => b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567",
            Base32Alphabet::Hex => b"0123456789ABCDEFGHIJKLMNOPQRSTUV",
        }
    }
}

const B58: &[u8; 58] = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const B64URL: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

fn encode_bits(data: &[u8], chars: &[u8], width: u32) -> String {
    let mask = (1u32 << width) - 1;
    let (mut bits, mut n, mut out) = (0u32, 0u32, String::new());
    for &c in data {
        bits = (bits << 8) | u32::from(c);
        n += 8;
        while n >= width {
            n -= width;
            out.push(char::from(chars[((bits >> n) & mask) as usize]));
        }
        bits &= (1 << n) - 1;
    }
    if n > 0 {
        out.push(char::from(chars[((bits << (width - n)) & mask) as usize]));
    }
    out
}

fn decode_bits(text: &[u8], chars: &[u8], width: u32, upper: bool) -> Result<Vec<u8>, DecodeError> {
    let (mut bits, mut n, mut out) = (0u32, 0u32, Vec::with_capacity(text.len()));
    for &c in text {
        let c = if upper { c.to_ascii_uppercase() } else { c };
        let Some(v) = chars.iter().position(|&x| x == c) else {
            return err("invalid character");
        };
        bits = (bits << width) | v as u32;
        n += width;
        if n >= 8 {
            n -= 8;
            out.push((bits >> n) as u8);
        }
        bits &= (1 << n) - 1;
    }
    if bits != 0 {
        return err("non-canonical trailing bits");
    }
    Ok(out)
}

/// Uppercase Base32, padded with `=` to a multiple of 8 when `padding`.
pub fn base32_encode(data: &[u8], alphabet: Base32Alphabet, padding: bool) -> String {
    let mut s = encode_bits(data, alphabet.chars(), 5);
    while padding && s.len() % 8 != 0 {
        s.push('=');
    }
    s
}

/// Case-insensitive Base32. With padding the length must be a multiple of 8
/// with 0, 1, 3, 4 or 6 `=`; without padding no `=` is allowed. Unpadded
/// lengths of 1, 3 or 6 (mod 8) and non-zero leftover bits are rejected.
pub fn base32_decode(text: &str, alphabet: Base32Alphabet, padding: bool) -> Result<Vec<u8>, DecodeError> {
    let mut t = text;
    if padding {
        if t.len() % 8 != 0 {
            return err("padded base32 length must be a multiple of 8");
        }
        let stripped = t.trim_end_matches('=');
        if ![0, 1, 3, 4, 6].contains(&(t.len() - stripped.len())) {
            return err("invalid base32 padding");
        }
        t = stripped;
    } else if t.contains('=') {
        return err("unexpected base32 padding");
    }
    if [1, 3, 6].contains(&(t.len() % 8)) {
        return err("invalid base32 length");
    }
    decode_bits(t.as_bytes(), alphabet.chars(), 5, true)
}

/// Bitcoin-alphabet Base58; each leading zero byte becomes one leading `1`.
pub fn base58_encode(data: &[u8]) -> String {
    let zeros = data.iter().take_while(|&&b| b == 0).count();
    let mut digits: Vec<u8> = Vec::new(); // least significant first
    for &c in &data[zeros..] {
        let mut carry = u32::from(c);
        for d in digits.iter_mut() {
            carry += u32::from(*d) << 8;
            *d = (carry % 58) as u8;
            carry /= 58;
        }
        while carry > 0 {
            digits.push((carry % 58) as u8);
            carry /= 58;
        }
    }
    let mut s = "1".repeat(zeros);
    s.extend(digits.iter().rev().map(|&d| char::from(B58[usize::from(d)])));
    s
}

/// Bitcoin-alphabet Base58; each leading `1` becomes one leading zero byte.
/// Characters outside the alphabet (`0`, `O`, `I`, `l`, ...) fail.
pub fn base58_decode(text: &str) -> Result<Vec<u8>, DecodeError> {
    let zeros = text.bytes().take_while(|&b| b == b'1').count();
    let mut body: Vec<u8> = Vec::new(); // least significant first
    for c in text.bytes() {
        let Some(v) = B58.iter().position(|&x| x == c) else {
            return err("invalid base58 character");
        };
        let mut carry = v as u32;
        for b in body.iter_mut() {
            carry += u32::from(*b) * 58;
            *b = carry as u8;
            carry >>= 8;
        }
        while carry > 0 {
            body.push(carry as u8);
            carry >>= 8;
        }
    }
    let mut out = vec![0u8; zeros];
    out.extend(body.iter().rev());
    Ok(out)
}

/// URL-safe Base64 without padding.
pub fn base64url_encode(data: &[u8]) -> String {
    encode_bits(data, B64URL, 6)
}

/// Unpadded Base64url; rejects `=`, `+`, `/` and other characters, a length
/// of 1 (mod 4) and non-zero trailing bits.
pub fn base64url_decode(text: &str) -> Result<Vec<u8>, DecodeError> {
    if text.len() % 4 == 1 {
        return err("invalid base64url length");
    }
    decode_bits(text.as_bytes(), B64URL, 6, false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use Base32Alphabet::{Hex, Rfc4648};

    fn h(s: &str) -> Vec<u8> {
        (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap()).collect()
    }

    #[test]
    fn base32() {
        for (hex, std, hexa, unpadded) in [
            ("", "", "", ""),
            ("66", "MY======", "CO======", "MY"),
            ("666f", "MZXQ====", "CPNG====", "MZXQ"),
            ("666f6f", "MZXW6===", "CPNMU===", "MZXW6"),
            ("666f6f62", "MZXW6YQ=", "CPNMUOG=", "MZXW6YQ"),
            ("666f6f6261", "MZXW6YTB", "CPNMUOJ1", "MZXW6YTB"),
            ("666f6f626172", "MZXW6YTBOI======", "CPNMUOJ1E8======", "MZXW6YTBOI"),
        ] {
            let data = h(hex);
            for (a, pad, want) in [(Rfc4648, true, std), (Hex, true, hexa), (Rfc4648, false, unpadded)] {
                assert_eq!(base32_encode(&data, a, pad), want, "{hex} {a:?} {pad}");
                assert_eq!(base32_decode(want, a, pad), Ok(data.clone()), "{want}");
            }
        }
        assert_eq!(base32_decode("mzxw6ytboi======", Rfc4648, true), Ok(h("666f6f626172")));
        for (text, pad) in [("MZXW6YT", true), ("MZXW6YR=", true), ("MZ======", true), ("MZXW6YTB1=======", true), ("MZXR====", true), ("MZXW6===", false)] {
            assert!(base32_decode(text, Rfc4648, pad).is_err(), "{text} {pad}");
        }
    }

    #[test]
    fn base58() {
        for (hex, want) in [
            ("", ""),
            ("48656c6c6f20576f726c6421", "2NEpo7TZRRrLZSi2U"),
            ("0000287fb4cd", "11233QC4"),
            ("00", "1"),
            ("0000", "11"),
            ("ff", "5Q"),
            ("00eb15231dfceb60925886b67d065299925915aeb172c06647", "1NS17iag9jJgTHD1VXjvLCEnZuQ3rJDE9L"),
        ] {
            assert_eq!(base58_encode(&h(hex)), want, "{hex}");
            assert_eq!(base58_decode(want), Ok(h(hex)), "{want}");
        }
        for s in ["0OIl", "abc0", "I"] {
            assert!(base58_decode(s).is_err(), "{s}");
        }
    }

    #[test]
    fn base64url() {
        for (hex, want) in [
            ("", ""),
            ("66", "Zg"),
            ("666f", "Zm8"),
            ("666f6f", "Zm9v"),
            ("666f6f62", "Zm9vYg"),
            ("666f6f6261", "Zm9vYmE"),
            ("666f6f626172", "Zm9vYmFy"),
            ("fbff", "-_8"),
            ("000102030405", "AAECAwQF"),
        ] {
            assert_eq!(base64url_encode(&h(hex)), want, "{hex}");
            assert_eq!(base64url_decode(want), Ok(h(hex)), "{want}");
        }
        for s in ["Zg==", "Zh", "a", "+/", "Zm9v!"] {
            assert!(base64url_decode(s).is_err(), "{s}");
        }
    }
}
