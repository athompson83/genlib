// SPDX-License-Identifier: Apache-2.0
using System.Text;

namespace Genlib.Validation;

/// <summary>
/// Strict RFC 4648 base32 (standard and extended-hex alphabets), Bitcoin base58 and unpadded base64url codecs.
/// Decoders reject unknown characters, bad padding or length and non-canonical trailing bits with <see cref="FormatException"/>.
/// </summary>
public static class BaseEncodings {
    private const string Base32Rfc = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    private const string Base32Hex = "0123456789ABCDEFGHIJKLMNOPQRSTUV";
    private const string Base58Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    private const string Base64UrlAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

    private static string Base32Alphabet(string alphabet) => alphabet switch {
        "rfc4648" => Base32Rfc,
        "hex" => Base32Hex,
        _ => throw new ArgumentException("alphabet must be rfc4648 or hex", nameof(alphabet)),
    };

    /// <summary>Base32 encodes with uppercase output; <paramref name="alphabet"/> is "rfc4648" (section 6) or "hex" (section 7).</summary>
    public static string Base32Encode(byte[] data, string alphabet = "rfc4648", bool padding = true) {
        string a = Base32Alphabet(alphabet);
        var sb = new StringBuilder();
        int bits = 0, n = 0;
        foreach (byte b in data) {
            bits = ((bits << 8) | b) & 0xFFFF;
            n += 8;
            while (n >= 5) { n -= 5; sb.Append(a[(bits >> n) & 31]); }
        }
        if (n > 0) sb.Append(a[(bits << (5 - n)) & 31]);
        if (padding) while (sb.Length % 8 != 0) sb.Append('=');
        return sb.ToString();
    }

    /// <summary>Case-insensitive base32 decode. With padding the length must be a multiple of 8 with 0, 1, 3, 4 or 6 "=";
    /// without padding no "=" is allowed. Unpadded lengths of 1, 3 or 6 mod 8 are rejected.</summary>
    public static byte[] Base32Decode(string text, string alphabet = "rfc4648", bool padding = true) {
        string a = Base32Alphabet(alphabet);
        string t = text.ToUpperInvariant();
        if (padding) {
            if (t.Length % 8 != 0) throw new FormatException("base32 length must be a multiple of 8");
            string stripped = t.TrimEnd('=');
            int pad = t.Length - stripped.Length;
            if (pad is not (0 or 1 or 3 or 4 or 6)) throw new FormatException("invalid base32 padding");
            t = stripped;
        } else if (t.Contains('=')) {
            throw new FormatException("unexpected base32 padding");
        }
        if (t.Length % 8 is 1 or 3 or 6) throw new FormatException("invalid base32 length");
        var output = new List<byte>(t.Length * 5 / 8);
        int bits = 0, n = 0;
        foreach (char ch in t) {
            int i = a.IndexOf(ch);
            if (i < 0) throw new FormatException("invalid base32 character");
            bits = ((bits << 5) | i) & 0xFFFF;
            n += 5;
            if (n >= 8) { n -= 8; output.Add((byte)((bits >> n) & 255)); }
        }
        if ((bits & ((1 << n) - 1)) != 0) throw new FormatException("non-canonical base32 trailing bits");
        return output.ToArray();
    }

    /// <summary>Base58 (Bitcoin alphabet); each leading zero byte becomes one leading "1".</summary>
    public static string Base58Encode(byte[] data) {
        int zeros = 0;
        while (zeros < data.Length && data[zeros] == 0) zeros++;
        var digits = new List<int>(); // little-endian base-58 digits
        for (int k = zeros; k < data.Length; k++) {
            int carry = data[k];
            for (int d = 0; d < digits.Count; d++) {
                carry += digits[d] << 8;
                digits[d] = carry % 58;
                carry /= 58;
            }
            while (carry > 0) { digits.Add(carry % 58); carry /= 58; }
        }
        var sb = new StringBuilder(new string('1', zeros));
        for (int d = digits.Count - 1; d >= 0; d--) sb.Append(Base58Alphabet[digits[d]]);
        return sb.ToString();
    }

    /// <summary>Decodes base58; each leading "1" becomes one zero byte. Throws <see cref="FormatException"/> for other characters.</summary>
    public static byte[] Base58Decode(string text) {
        int zeros = 0;
        while (zeros < text.Length && text[zeros] == '1') zeros++;
        var bytes = new List<int>(); // little-endian base-256 digits
        foreach (char ch in text) {
            int carry = Base58Alphabet.IndexOf(ch);
            if (carry < 0) throw new FormatException("invalid base58 character");
            for (int d = 0; d < bytes.Count; d++) {
                carry += bytes[d] * 58;
                bytes[d] = carry & 255;
                carry >>= 8;
            }
            while (carry > 0) { bytes.Add(carry & 255); carry >>= 8; }
        }
        var result = new byte[zeros + bytes.Count];
        for (int d = 0; d < bytes.Count; d++) result[result.Length - 1 - d] = (byte)bytes[d];
        return result;
    }

    /// <summary>RFC 4648 section 5 base64url without padding.</summary>
    public static string Base64UrlEncode(byte[] data) {
        var sb = new StringBuilder((data.Length * 4 + 2) / 3);
        int i = 0;
        for (; i + 2 < data.Length; i += 3) {
            int v = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
            sb.Append(Base64UrlAlphabet[v >> 18]).Append(Base64UrlAlphabet[(v >> 12) & 63])
              .Append(Base64UrlAlphabet[(v >> 6) & 63]).Append(Base64UrlAlphabet[v & 63]);
        }
        int rest = data.Length - i;
        if (rest == 1) {
            int v = data[i] << 16;
            sb.Append(Base64UrlAlphabet[v >> 18]).Append(Base64UrlAlphabet[(v >> 12) & 63]);
        } else if (rest == 2) {
            int v = (data[i] << 16) | (data[i + 1] << 8);
            sb.Append(Base64UrlAlphabet[v >> 18]).Append(Base64UrlAlphabet[(v >> 12) & 63]).Append(Base64UrlAlphabet[(v >> 6) & 63]);
        }
        return sb.ToString();
    }

    /// <summary>Decodes unpadded base64url; rejects "=", "+", "/", other characters, length 1 mod 4 and non-canonical trailing bits.</summary>
    public static byte[] Base64UrlDecode(string text) {
        if (text.Length % 4 == 1) throw new FormatException("invalid base64url length");
        var output = new List<byte>(text.Length * 3 / 4);
        int bits = 0, n = 0;
        foreach (char ch in text) {
            int i = Base64UrlAlphabet.IndexOf(ch);
            if (i < 0) throw new FormatException("invalid base64url character");
            bits = ((bits << 6) | i) & 0xFFFF;
            n += 6;
            if (n >= 8) { n -= 8; output.Add((byte)((bits >> n) & 255)); }
        }
        if ((bits & ((1 << n) - 1)) != 0) throw new FormatException("non-canonical base64url trailing bits");
        return output.ToArray();
    }
}
