// SPDX-License-Identifier: Apache-2.0

//! Color conversions between CSS hex, sRGB, HSL and OKLCH (Björn Ottosson's
//! Oklab, 2020). Channels r, g, b and alpha are 0..1 floats; HSL h is degrees
//! [0, 360) with s and l in 0..1; OKLCH L is 0..1, C >= 0 and h is degrees.

use std::fmt;

/// Malformed hex color.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ColorError(pub String);

impl fmt::Display for ColorError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for ColorError {}

/// Parses "#rgb", "#rgba", "#rrggbb" or "#rrggbbaa" (case-insensitive) into (r, g, b, a) in 0..1.
pub fn parse_hex(text: &str) -> Result<(f64, f64, f64, f64), ColorError> {
    let bad = || ColorError("expected #rgb, #rgba, #rrggbb or #rrggbbaa".into());
    let h = text.strip_prefix('#').ok_or_else(bad)?;
    if !matches!(h.len(), 3 | 4 | 6 | 8) || !h.bytes().all(|c| c.is_ascii_hexdigit()) {
        return Err(bad());
    }
    let full: String = if h.len() <= 4 { h.chars().flat_map(|c| [c, c]).collect() } else { h.to_string() };
    let v: Vec<f64> = (0..full.len())
        .step_by(2)
        .map(|i| f64::from(u8::from_str_radix(&full[i..i + 2], 16).unwrap_or(0)) / 255.0)
        .collect();
    Ok((v[0], v[1], v[2], if v.len() == 4 { v[3] } else { 1.0 }))
}

fn byte_of(v: f64) -> u8 {
    (v * 255.0 + 0.5).floor().clamp(0.0, 255.0) as u8
}

/// Lowercase #rrggbb, or #rrggbbaa when a < 1 (pass 1.0 for opaque); channels are clamped and rounded half up.
pub fn to_hex(r: f64, g: f64, b: f64, a: f64) -> String {
    let c = |v: f64| byte_of(v.clamp(0.0, 1.0));
    let mut out = format!("#{:02x}{:02x}{:02x}", c(r), c(g), c(b));
    if a < 1.0 {
        out.push_str(&format!("{:02x}", byte_of(a.max(0.0))));
    }
    out
}

/// sRGB channels to HSL (h in degrees).
pub fn rgb_to_hsl(r: f64, g: f64, b: f64) -> (f64, f64, f64) {
    let (mx, mn) = (r.max(g).max(b), r.min(g).min(b));
    let l = (mx + mn) / 2.0;
    let d = mx - mn;
    if d == 0.0 {
        return (0.0, 0.0, l);
    }
    let s = d / (1.0 - (2.0 * l - 1.0).abs());
    let h = if mx == r {
        ((g - b) / d).rem_euclid(6.0)
    } else if mx == g {
        (b - r) / d + 2.0
    } else {
        (r - g) / d + 4.0
    };
    ((h * 60.0).rem_euclid(360.0), s, l)
}

/// HSL to sRGB channels; h wraps modulo 360.
pub fn hsl_to_rgb(h: f64, s: f64, l: f64) -> (f64, f64, f64) {
    let h = h.rem_euclid(360.0);
    let c = (1.0 - (2.0 * l - 1.0).abs()) * s;
    let x = c * (1.0 - ((h / 60.0).rem_euclid(2.0) - 1.0).abs());
    let m = l - c / 2.0;
    let (r, g, b) = match ((h / 60.0).floor() as i64).rem_euclid(6) {
        0 => (c, x, 0.0),
        1 => (x, c, 0.0),
        2 => (0.0, c, x),
        3 => (0.0, x, c),
        4 => (x, 0.0, c),
        _ => (c, 0.0, x),
    };
    (r + m, g + m, b + m)
}

fn lin(c: f64) -> f64 {
    if c <= 0.04045 {
        c / 12.92
    } else {
        ((c + 0.055) / 1.055).powf(2.4)
    }
}

fn gam(c: f64) -> f64 {
    if c <= 0.0031308 {
        12.92 * c
    } else {
        1.055 * c.powf(1.0 / 2.4) - 0.055
    }
}

fn cbrt(x: f64) -> f64 {
    x.abs().powf(1.0 / 3.0).copysign(x)
}

/// sRGB channels to OKLCH (L, C, h in degrees; h is 0 when C <= 1e-7).
pub fn rgb_to_oklch(r: f64, g: f64, b: f64) -> (f64, f64, f64) {
    let (r, g, b) = (lin(r), lin(g), lin(b));
    let l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    let m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    let s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    let big_l = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
    let a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    let bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    let c = a.hypot(bb);
    let h = if c > 1e-7 { bb.atan2(a).to_degrees().rem_euclid(360.0) } else { 0.0 };
    (big_l, c, h)
}

/// OKLCH to sRGB channels, unclamped (values outside 0..1 are out of gamut).
pub fn oklch_to_rgb(l: f64, c: f64, h: f64) -> (f64, f64, f64) {
    let (a, b) = (c * h.to_radians().cos(), c * h.to_radians().sin());
    let l_ = (l + 0.3963377774 * a + 0.2158037573 * b).powi(3);
    let m_ = (l - 0.1055613458 * a - 0.0638541728 * b).powi(3);
    let s_ = (l - 0.0894841775 * a - 1.2914855480 * b).powi(3);
    let r = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
    let g = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
    let b = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_;
    (gam(r), gam(g), gam(b))
}

/// True when every channel lies within 0..1 (with 1e-9 tolerance).
pub fn in_gamut(r: f64, g: f64, b: f64) -> bool {
    [r, g, b].iter().all(|v| (-1e-9..=1.0 + 1e-9).contains(v))
}

#[cfg(test)]
#[allow(clippy::type_complexity, clippy::approx_constant)] // generated vector tables
mod tests {
    use super::*;

    fn near3(label: &str, got: (f64, f64, f64), want: [f64; 3]) {
        let g = [got.0, got.1, got.2];
        assert!(g.iter().zip(want).all(|(a, b)| (a - b).abs() <= 1e-6), "{label}: {g:?} vs {want:?}");
    }

    #[test]
    fn hex_vectors() {
        let cases: &[(&str, [f64; 4], &str)] = &[
            ("#000", [0.0, 0.0, 0.0, 1.0], "#000000"),
            ("#fff", [1.0, 1.0, 1.0, 1.0], "#ffffff"),
            ("#f00", [1.0, 0.0, 0.0, 1.0], "#ff0000"),
            ("#0f8", [0.0, 1.0, 0.5333333333333333, 1.0], "#00ff88"),
            ("#336699", [0.2, 0.4, 0.6, 1.0], "#336699"),
            ("#336699cc", [0.2, 0.4, 0.6, 0.8], "#336699cc"),
            ("#ABCDEF", [0.6705882352941176, 0.803921568627451, 0.9372549019607843, 1.0], "#abcdef"),
            ("#12345678", [0.07058823529411765, 0.20392156862745098, 0.33725490196078434, 0.47058823529411764], "#12345678"),
            ("#7f7f7f", [0.4980392156862745, 0.4980392156862745, 0.4980392156862745, 1.0], "#7f7f7f"),
            ("#808080", [0.5019607843137255, 0.5019607843137255, 0.5019607843137255, 1.0], "#808080"),
        ];
        for &(text, want, hex) in cases {
            let (r, g, b, a) = parse_hex(text).unwrap();
            near3(text, (r, g, b), [want[0], want[1], want[2]]);
            assert!((a - want[3]).abs() <= 1e-6, "{text}");
            assert_eq!(to_hex(r, g, b, a), hex);
        }
        for s in &["336699", "#12", "#12345", "#1234567", "#ggg", "#", "rgb(1,2,3)", "#3366999"] {
            assert!(parse_hex(s).is_err(), "{s}");
        }
    }

    #[test]
    fn to_hex_vectors() {
        let cases: &[(&[f64], &str)] = &[
            (&[0.5, 0.5, 0.5], "#808080"),
            (&[1.2, -0.1, 0.5], "#ff0080"),
            (&[0.001, 0.999, 0.5], "#00ff80"),
            (&[0.2, 0.4, 0.6, 0.5], "#33669980"),
            (&[0.2, 0.4, 0.6, 1.0], "#336699"),
            (&[0.00196078431372549, 0.0058823529411764705, 0.00980392156862745], "#010203"),
        ];
        for &(v, want) in cases {
            let a = if v.len() == 4 { v[3] } else { 1.0 };
            assert_eq!(to_hex(v[0], v[1], v[2], a), want);
        }
    }

    #[test]
    fn hsl_vectors() {
        let cases: &[(&str, [f64; 3])] = &[
            ("#000", [0.0, 0.0, 0.0]),
            ("#fff", [0.0, 0.0, 1.0]),
            ("#f00", [0.0, 1.0, 0.5]),
            ("#0f0", [120.0, 1.0, 0.5]),
            ("#00f", [240.0, 1.0, 0.5]),
            ("#336699", [210.0, 0.49999999999999994, 0.4]),
            ("#ff8000", [30.11764705882353, 1.0, 0.5]),
            ("#808080", [0.0, 0.0, 0.5019607843137255]),
            ("#c0ffee", [163.80952380952382, 1.0, 0.8764705882352941]),
        ];
        for &(hex, want) in cases {
            let (r, g, b, _) = parse_hex(hex).unwrap();
            near3(hex, rgb_to_hsl(r, g, b), want);
        }
        let back: &[([f64; 3], [f64; 3])] = &[
            ([0.0, 1.0, 0.5], [1.0, 0.0, 0.0]),
            ([120.0, 1.0, 0.5], [0.0, 1.0, 0.0]),
            ([240.0, 1.0, 0.5], [0.0, 0.0, 1.0]),
            ([210.0, 0.5, 0.4], [0.2, 0.4, 0.6000000000000001]),
            ([360.0, 1.0, 0.5], [1.0, 0.0, 0.0]),
            ([-30.0, 1.0, 0.5], [1.0, 0.0, 0.5]),
            ([90.0, 0.0, 0.3], [0.3, 0.3, 0.3]),
            ([30.0, 1.0, 0.75], [1.0, 0.75, 0.5]),
        ];
        for &(i, want) in back {
            near3("hsl_to_rgb", hsl_to_rgb(i[0], i[1], i[2]), want);
        }
    }

    #[test]
    fn oklch_vectors() {
        let cases: &[(&str, [f64; 3])] = &[
            ("#000", [0.0, 0.0, 0.0]),
            ("#fff", [0.9999999934735462, 3.727399553519285e-08, 0.0]),
            ("#f00", [0.6279553606145516, 0.2576833077361567, 29.233885192342633]),
            ("#0f0", [0.8664396115356694, 0.2948272403370166, 142.49533888780996]),
            ("#00f", [0.4520137183853429, 0.31321437166460114, 264.052020638055]),
            ("#336699", [0.49931445292373877, 0.09866435965710138, 250.43305370947127]),
            ("#808080", [0.5998708017071177, 2.2359581629199253e-08, 0.0]),
            ("#ff8000", [0.7318948427227374, 0.1858032156306402, 52.984679593971286]),
        ];
        for &(hex, want) in cases {
            let (r, g, b, _) = parse_hex(hex).unwrap();
            near3(hex, rgb_to_oklch(r, g, b), want);
        }
        let back: &[([f64; 3], [f64; 3])] = &[
            ([0.627955, 0.257683, 29.2339], [0.9999989995226538, 2.4989239385060646e-06, -3.5938127559420605e-08]),
            ([0.7, 0.1, 200.0], [0.25183094033414793, 0.6942495954401551, 0.7170636897415913]),
            ([0.5, 0.4, 150.0], [-2.5595884674002214, 0.5687880047974224, -0.8622713129274896]),
            ([1.0, 0.0, 0.0], [0.9999999999999999, 0.9999999999999999, 0.9999999999999999]),
            ([0.0, 0.0, 0.0], [0.0, 0.0, 0.0]),
        ];
        for &(i, want) in back {
            near3("oklch_to_rgb", oklch_to_rgb(i[0], i[1], i[2]), want);
        }
        assert!(in_gamut(0.25183094033414793, 0.6942495954401551, 0.7170636897415913));
        assert!(!in_gamut(-2.5595884674002214, 0.5687880047974224, -0.8622713129274896));
    }
}
