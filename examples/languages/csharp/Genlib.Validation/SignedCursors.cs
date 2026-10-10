// SPDX-License-Identifier: Apache-2.0
using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace Genlib.Validation;

/// <summary>Why a cursor was rejected.</summary>
public enum CursorErrorKind { Malformed, BadSignature, Expired }

/// <summary>A rejected pagination cursor; the message starts with "malformed", "bad signature" or "expired".</summary>
public sealed class CursorException : Exception {
    public CursorErrorKind Kind { get; }
    public CursorException(CursorErrorKind kind, string message) : base(message) { Kind = kind; }
}

/// <summary>HMAC-SHA256 signed, expiring pagination cursors: base64url(body) + "." + base64url(mac), unpadded.</summary>
public static class SignedCursors {
    private static readonly UTF8Encoding StrictUtf8 = new(false, true);

    /// <summary>Encodes 1-16 newline-free values with an expiry (unix seconds) under a secret of at least 32 bytes.</summary>
    public static string EncodeCursor(IReadOnlyList<string> values, byte[] secret, long expiresAt) {
        ArgumentNullException.ThrowIfNull(values);
        CheckSecret(secret);
        if (values.Count == 0 || values.Count > 16) throw new ArgumentException("values must contain 1 to 16 entries", nameof(values));
        foreach (var v in values) {
            if (v is null) throw new ArgumentException("values must not contain null", nameof(values));
            if (v.Contains('\n')) throw new ArgumentException("values must not contain a newline", nameof(values));
        }
        if (expiresAt <= 0) throw new ArgumentOutOfRangeException(nameof(expiresAt), "expiresAt must be positive");
        byte[] body = Encoding.UTF8.GetBytes("v1\n" + expiresAt.ToString(CultureInfo.InvariantCulture) + "\n" + string.Join("\n", values));
        return Base64UrlEncode(body) + "." + Base64UrlEncode(HMACSHA256.HashData(secret, body));
    }

    /// <summary>Verifies and decodes a cursor; throws <see cref="CursorException"/> when malformed, badly signed or expired at <paramref name="now"/>.</summary>
    public static string[] DecodeCursor(string token, byte[] secret, long now) {
        CheckSecret(secret);
        if (token is null) throw new CursorException(CursorErrorKind.Malformed, "malformed: token is null");
        int dot = token.LastIndexOf('.');
        if (dot < 0) throw new CursorException(CursorErrorKind.Malformed, "malformed: missing '.'");
        string bodyPart = token[..dot], sigPart = token[(dot + 1)..];
        byte[] body = Base64UrlDecode(bodyPart, strictTrailingBits: true)
            ?? throw new CursorException(CursorErrorKind.Malformed, "malformed: invalid body encoding");
        if (Base64UrlDecode(sigPart, strictTrailingBits: false) is null)
            throw new CursorException(CursorErrorKind.Malformed, "malformed: invalid signature encoding");
        // Compare the canonical encoding so every character of the signature part is significant.
        byte[] expected = Encoding.ASCII.GetBytes(Base64UrlEncode(HMACSHA256.HashData(secret, body)));
        if (!CryptographicOperations.FixedTimeEquals(expected, Encoding.ASCII.GetBytes(sigPart)))
            throw new CursorException(CursorErrorKind.BadSignature, "bad signature");
        string text;
        try { text = StrictUtf8.GetString(body); }
        catch (DecoderFallbackException) { throw new CursorException(CursorErrorKind.Malformed, "malformed: body is not UTF-8"); }
        string[] parts = text.Split('\n');
        if (parts.Length < 3 || parts[0] != "v1") throw new CursorException(CursorErrorKind.Malformed, "malformed: unsupported header");
        if (parts[1].Length == 0 || !parts[1].All(c => c is >= '0' and <= '9')
            || !long.TryParse(parts[1], NumberStyles.None, CultureInfo.InvariantCulture, out long expiresAt))
            throw new CursorException(CursorErrorKind.Malformed, "malformed: invalid expiry");
        if (now >= expiresAt) throw new CursorException(CursorErrorKind.Expired, "expired");
        return parts[2..];
    }

    private static void CheckSecret(byte[] secret) {
        ArgumentNullException.ThrowIfNull(secret);
        if (secret.Length < 32) throw new ArgumentException("secret must be at least 32 bytes", nameof(secret));
    }

    private static string Base64UrlEncode(byte[] data) => Convert.ToBase64String(data).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[]? Base64UrlDecode(string text, bool strictTrailingBits) {
        if (text.Length == 0 || text.Length % 4 == 1) return null;
        int buffer = 0, bits = 0;
        var output = new List<byte>(text.Length * 3 / 4);
        foreach (char c in text) {
            int v = c switch {
                >= 'A' and <= 'Z' => c - 'A', >= 'a' and <= 'z' => c - 'a' + 26, >= '0' and <= '9' => c - '0' + 52,
                '-' => 62, '_' => 63, _ => -1,
            };
            if (v < 0) return null;
            buffer = ((buffer << 6) | v) & 0xffff; bits += 6;
            if (bits >= 8) { bits -= 8; output.Add((byte)(buffer >> bits)); }
        }
        if (strictTrailingBits && (buffer & ((1 << bits) - 1)) != 0) return null;
        return output.ToArray();
    }
}
