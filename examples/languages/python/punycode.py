# SPDX-License-Identifier: Apache-2.0
"""Punycode (RFC 3492) and simple IDNA-style domain conversion.

The bootstring parameters are base 36, tmin 1, tmax 26, skew 38, damp 700, initial bias 72, initial n
128 and delimiter '-'. Arithmetic is checked against 2**31 - 1 like the RFC's reference code. Decoding
accepts upper- or lower-case digits and rejects invalid digits, overflow, non-basic code points before
the last delimiter, truncated input and results that are surrogates or above U+10FFFF.

The domain helpers only lowercase ASCII letters and convert labels; they do NOT apply Unicode
normalization or the IDNA/UTS #46 mapping table, so normalize (NFC, case-fold) first if you need that.
"""

_BASE, _TMIN, _TMAX, _SKEW, _DAMP, _INITIAL_BIAS, _INITIAL_N = 36, 1, 26, 38, 700, 72, 128
_MAXINT = 2**31 - 1


class PunycodeError(ValueError):
    """Raised for invalid Punycode input, overflow or an invalid domain name."""


def _adapt(delta: int, num: int, first: bool) -> int:
    delta = delta // _DAMP if first else delta // 2
    delta += delta // num
    k = 0
    while delta > ((_BASE - _TMIN) * _TMAX) // 2:
        delta //= _BASE - _TMIN
        k += _BASE
    return k + (_BASE - _TMIN + 1) * delta // (delta + _SKEW)


def _digit(d: int) -> str:
    return chr(d + 22 + (75 if d < 26 else 0))


def _threshold(k: int, bias: int) -> int:
    if k <= bias:
        return _TMIN
    if k >= bias + _TMAX:
        return _TMAX
    return k - bias


def _value(c: str) -> int:
    o = ord(c)
    if 48 <= o <= 57:
        return o - 22
    if 65 <= o <= 90:
        return o - 65
    if 97 <= o <= 122:
        return o - 97
    raise PunycodeError("invalid digit")


def punycode_encode(s: str) -> str:
    """Encode a Unicode string with Punycode (no 'xn--' prefix)."""
    cps = [ord(c) for c in s]
    out = [chr(c) for c in cps if c < 0x80]
    b = h = len(out)
    if b:
        out.append("-")
    n, delta, bias = _INITIAL_N, 0, _INITIAL_BIAS
    while h < len(cps):
        m = min(c for c in cps if c >= n)
        if (m - n) * (h + 1) > _MAXINT - delta:
            raise PunycodeError("overflow")
        delta += (m - n) * (h + 1)
        n = m
        for c in cps:
            if c < n:
                delta += 1
                if delta > _MAXINT:
                    raise PunycodeError("overflow")
            if c == n:
                q, k = delta, _BASE
                while True:
                    t = _threshold(k, bias)
                    if q < t:
                        break
                    out.append(_digit(t + (q - t) % (_BASE - t)))
                    q = (q - t) // (_BASE - t)
                    k += _BASE
                out.append(_digit(q))
                bias = _adapt(delta, h + 1, h == b)
                delta = 0
                h += 1
        delta += 1
        n += 1
    return "".join(out)


def punycode_decode(s: str) -> str:
    """Decode a Punycode string (no 'xn--' prefix); raises PunycodeError for invalid input."""
    i = s.rfind("-")
    out: list[int] = []
    if i > 0:
        for c in s[:i]:
            if ord(c) >= 0x80:
                raise PunycodeError("non-basic code point")
            out.append(ord(c))
    pos = i + 1 if i >= 0 else 0
    n, idx, bias = _INITIAL_N, 0, _INITIAL_BIAS
    while pos < len(s):
        old, w, k = idx, 1, _BASE
        while True:
            if pos >= len(s):
                raise PunycodeError("truncated input")
            d = _value(s[pos])
            pos += 1
            if d > (_MAXINT - idx) // w:
                raise PunycodeError("overflow")
            idx += d * w
            t = _threshold(k, bias)
            if d < t:
                break
            if w > _MAXINT // (_BASE - t):
                raise PunycodeError("overflow")
            w *= _BASE - t
            k += _BASE
        bias = _adapt(idx - old, len(out) + 1, old == 0)
        if idx // (len(out) + 1) > _MAXINT - n:
            raise PunycodeError("overflow")
        n += idx // (len(out) + 1)
        idx %= len(out) + 1
        if n > 0x10FFFF or 0xD800 <= n <= 0xDFFF:
            raise PunycodeError("invalid code point")
        out.insert(idx, n)
        idx += 1
    return "".join(map(chr, out))


def domain_to_ascii(domain: str) -> str:
    """Lowercase ASCII letters and Punycode non-ASCII labels as 'xn--...' (no normalization or IDNA mapping)."""
    trailing = domain.endswith(".") and len(domain) > 1
    labels = (domain[:-1] if trailing else domain).split(".")
    res = []
    for label in labels:
        if label == "":
            raise PunycodeError("empty label")
        a = "".join(c.lower() if c < "\x80" else c for c in label)
        if any(ord(c) >= 0x80 for c in a):
            a = "xn--" + punycode_encode(a)
        if len(a) > 63:
            raise PunycodeError("label too long")
        res.append(a)
    out = ".".join(res)
    if len(out) > 253:
        raise PunycodeError("name too long")
    return out + ("." if trailing else "")


def domain_to_unicode(domain: str) -> str:
    """Decode every 'xn--' label (case-insensitive prefix); other labels are kept as is (no IDNA mapping)."""
    return ".".join(punycode_decode(lb[4:]) if lb[:4].lower() == "xn--" else lb for lb in domain.split("."))
