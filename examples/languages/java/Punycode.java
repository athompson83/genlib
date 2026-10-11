// SPDX-License-Identifier: Apache-2.0

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * RFC 3492 Punycode (base 36, tmin 1, tmax 26, skew 38, damp 700, initial bias 72, initial n 128, delimiter '-')
 * with 31-bit overflow checks, plus simplified IDNA-style domain conversion. The domain functions lowercase ASCII
 * letters only and apply no Unicode normalization or IDNA (UTS #46) mapping: normalize (NFC, case-fold) first if
 * needed. Strings are processed by code point. Every failure throws IllegalArgumentException.
 */
public final class Punycode {
    private static final int BASE = 36, TMIN = 1, TMAX = 26, SKEW = 38, DAMP = 700, INITIAL_BIAS = 72, INITIAL_N = 128;
    private static final long MAXINT = 0x7FFFFFFFL;

    private Punycode() {}

    private static long adapt(long delta, long num, boolean first) {
        delta = first ? delta / DAMP : delta / 2;
        delta += delta / num;
        long k = 0;
        while (delta > ((BASE - TMIN) * TMAX) / 2) { delta /= BASE - TMIN; k += BASE; }
        return k + (BASE - TMIN + 1) * delta / (delta + SKEW);
    }

    private static char digit(long d) { return (char) (d < 26 ? 'a' + d : '0' + d - 26); }

    private static long threshold(long k, long bias) { return k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias; }

    /** Encodes a Unicode string to Punycode (without the 'xn--' prefix). */
    public static String punycodeEncode(String s) {
        int[] cps = s.codePoints().toArray();
        StringBuilder out = new StringBuilder();
        for (int c : cps) if (c < 0x80) out.append((char) c);
        long b = out.length();
        long h = b;
        if (b > 0) out.append('-');
        long n = INITIAL_N, delta = 0, bias = INITIAL_BIAS;
        while (h < cps.length) {
            long m = Long.MAX_VALUE;
            for (int c : cps) if (c >= n && c < m) m = c;
            if ((m - n) * (h + 1) > MAXINT - delta) throw new IllegalArgumentException("overflow");
            delta += (m - n) * (h + 1);
            n = m;
            for (int c : cps) {
                if (c < n) {
                    delta++;
                    if (delta > MAXINT) throw new IllegalArgumentException("overflow");
                }
                if (c == n) {
                    long q = delta;
                    for (long k = BASE; ; k += BASE) {
                        long t = threshold(k, bias);
                        if (q < t) break;
                        out.append(digit(t + (q - t) % (BASE - t)));
                        q = (q - t) / (BASE - t);
                    }
                    out.append(digit(q));
                    bias = adapt(delta, h + 1, h == b);
                    delta = 0;
                    h++;
                }
            }
            delta++;
            n++;
        }
        return out.toString();
    }

    private static long value(int c) {
        if (c >= '0' && c <= '9') return c - 22;
        if (c >= 'A' && c <= 'Z') return c - 'A';
        if (c >= 'a' && c <= 'z') return c - 'a';
        throw new IllegalArgumentException("invalid digit");
    }

    /** Decodes Punycode (either digit case) to a Unicode string; rejects invalid, truncated or overflowing input. */
    public static String punycodeDecode(String s) {
        int[] cps = s.codePoints().toArray();
        int i = -1;
        for (int k = cps.length - 1; k >= 0; k--) if (cps[k] == '-') { i = k; break; }
        List<Integer> out = new ArrayList<>();
        if (i > 0) {
            for (int k = 0; k < i; k++) {
                if (cps[k] >= 0x80) throw new IllegalArgumentException("non-basic code point");
                out.add(cps[k]);
            }
        }
        int pos = i >= 0 ? i + 1 : 0;
        long n = INITIAL_N, idx = 0, bias = INITIAL_BIAS;
        while (pos < cps.length) {
            long old = idx, w = 1;
            for (long k = BASE; ; k += BASE) {
                if (pos >= cps.length) throw new IllegalArgumentException("truncated input");
                long d = value(cps[pos++]);
                if (d > (MAXINT - idx) / w) throw new IllegalArgumentException("overflow");
                idx += d * w;
                long t = threshold(k, bias);
                if (d < t) break;
                if (w > MAXINT / (BASE - t)) throw new IllegalArgumentException("overflow");
                w *= BASE - t;
            }
            long len = out.size() + 1;
            bias = adapt(idx - old, len, old == 0);
            if (idx / len > MAXINT - n) throw new IllegalArgumentException("overflow");
            n += idx / len;
            idx %= len;
            if (n > 0x10FFFF || (n >= 0xD800 && n <= 0xDFFF)) throw new IllegalArgumentException("invalid code point");
            out.add((int) idx, (int) n);
            idx++;
        }
        StringBuilder sb = new StringBuilder();
        for (int c : out) sb.appendCodePoint(c);
        return sb.toString();
    }

    /** Converts a domain to ASCII ('xn--' labels); lowercases ASCII only, no normalization or IDNA mapping. */
    public static String domainToAscii(String domain) {
        boolean trailing = domain.endsWith(".") && domain.length() > 1;
        String body = trailing ? domain.substring(0, domain.length() - 1) : domain;
        List<String> res = new ArrayList<>();
        for (String l : body.split("\\.", -1)) {
            if (l.isEmpty()) throw new IllegalArgumentException("empty label");
            StringBuilder a = new StringBuilder();
            boolean nonAscii = false;
            for (int k = 0; k < l.length(); k++) {
                char c = l.charAt(k);
                if (c < 0x80) a.append(c >= 'A' && c <= 'Z' ? (char) (c + 32) : c);
                else { a.append(c); nonAscii = true; }
            }
            String label = nonAscii ? "xn--" + punycodeEncode(a.toString()) : a.toString();
            if (label.length() > 63) throw new IllegalArgumentException("label too long");
            res.add(label);
        }
        String out = String.join(".", res);
        if (out.length() > 253) throw new IllegalArgumentException("name too long");
        return trailing ? out + "." : out;
    }

    /** Converts a domain to Unicode by decoding each 'xn--' label (prefix matched case-insensitively). */
    public static String domainToUnicode(String domain) {
        List<String> res = new ArrayList<>();
        for (String l : domain.split("\\.", -1)) {
            boolean ace = l.length() >= 4 && l.substring(0, 4).toLowerCase(Locale.ROOT).equals("xn--");
            res.add(ace ? punycodeDecode(l.substring(4)) : l);
        }
        return String.join(".", res);
    }
}
