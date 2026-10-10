// SPDX-License-Identifier: Apache-2.0
using System.Security.Cryptography;
using System.Text;

namespace Genlib.Validation;

/// <summary>HOTP (RFC 4226) and TOTP (RFC 6238) one-time passwords with RFC 4648 base32 helpers.</summary>
public static class Totp {
    private const string Base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

    /// <summary>Computes an HOTP code using dynamic truncation, zero-padded to <paramref name="digits"/>.</summary>
    public static string Hotp(byte[] secret, ulong counter, int digits = 6, string algorithm = "SHA1") {
        ArgumentNullException.ThrowIfNull(secret);
        if (secret.Length == 0) throw new ArgumentException("secret must not be empty", nameof(secret));
        if (digits < 6 || digits > 10) throw new ArgumentOutOfRangeException(nameof(digits), "digits must be between 6 and 10");
        var message = new byte[8];
        for (int i = 7; i >= 0; i--) { message[i] = (byte)(counter & 0xff); counter >>= 8; }
        byte[] mac = NormalizeAlgorithm(algorithm) switch {
            "SHA1" => HMACSHA1.HashData(secret, message),
            "SHA256" => HMACSHA256.HashData(secret, message),
            _ => HMACSHA512.HashData(secret, message),
        };
        int offset = mac[^1] & 0x0f;
        long binary = ((mac[offset] & 0x7fL) << 24) | ((mac[offset + 1] & 0xffL) << 16)
            | ((mac[offset + 2] & 0xffL) << 8) | (mac[offset + 3] & 0xffL);
        long modulus = 1;
        for (int i = 0; i < digits; i++) modulus *= 10;
        return (binary % modulus).ToString(System.Globalization.CultureInfo.InvariantCulture).PadLeft(digits, '0');
    }

    /// <summary>Computes a TOTP code for <paramref name="unixSeconds"/>.</summary>
    public static string Generate(byte[] secret, long unixSeconds, int step = 30, int digits = 6, string algorithm = "SHA1", long t0 = 0)
        => Hotp(secret, Counter(unixSeconds, step, t0), digits, algorithm);

    /// <summary>Verifies a TOTP code within ±<paramref name="window"/> steps using constant-time comparison.</summary>
    public static bool Verify(string? code, byte[] secret, long unixSeconds, int window = 1, int step = 30, int digits = 6, string algorithm = "SHA1", long t0 = 0) {
        if (window < 0 || window > 10) throw new ArgumentOutOfRangeException(nameof(window), "window must be between 0 and 10");
        if (code is null || code.Length != digits) return false;
        foreach (char c in code) if (c < '0' || c > '9') return false;
        ulong current = Counter(unixSeconds, step, t0);
        byte[] supplied = Encoding.ASCII.GetBytes(code);
        bool matched = false;
        for (long delta = -window; delta <= window; delta++) {
            if (delta < 0 && (ulong)(-delta) > current) continue;
            ulong counter = delta < 0 ? current - (ulong)(-delta) : current + (ulong)delta;
            byte[] expected = Encoding.ASCII.GetBytes(Hotp(secret, counter, digits, algorithm));
            matched |= CryptographicOperations.FixedTimeEquals(expected, supplied);
        }
        return matched;
    }

    /// <summary>Encodes bytes as RFC 4648 base32 without padding.</summary>
    public static string Base32Encode(byte[] data) {
        ArgumentNullException.ThrowIfNull(data);
        var sb = new StringBuilder((data.Length * 8 + 4) / 5);
        int buffer = 0, bits = 0;
        foreach (byte b in data) {
            buffer = (buffer << 8) | b; bits += 8;
            while (bits >= 5) { sb.Append(Base32Alphabet[(buffer >> (bits - 5)) & 31]); bits -= 5; }
        }
        if (bits > 0) sb.Append(Base32Alphabet[(buffer << (5 - bits)) & 31]);
        return sb.ToString();
    }

    /// <summary>Decodes base32 case-insensitively, ignoring spaces, hyphens and trailing '='.</summary>
    public static byte[] Base32Decode(string text) {
        ArgumentNullException.ThrowIfNull(text);
        string cleaned = text.Replace(" ", "").Replace("-", "").TrimEnd('=');
        var output = new List<byte>(cleaned.Length * 5 / 8);
        int buffer = 0, bits = 0;
        foreach (char raw in cleaned) {
            int value = Base32Alphabet.IndexOf(char.ToUpperInvariant(raw));
            if (value < 0 || raw > 127) throw new FormatException($"invalid base32 character '{raw}'");
            buffer = (buffer << 5) | value; bits += 5;
            if (bits >= 8) { output.Add((byte)((buffer >> (bits - 8)) & 0xff)); bits -= 8; }
        }
        return output.ToArray();
    }

    /// <summary>Builds an otpauth:// provisioning URI for authenticator apps.</summary>
    public static string OtpauthUri(string issuer, string account, string secretBase32, int digits = 6, int period = 30, string algorithm = "SHA1") {
        if (string.IsNullOrEmpty(issuer)) throw new ArgumentException("issuer is required", nameof(issuer));
        if (string.IsNullOrEmpty(account)) throw new ArgumentException("account is required", nameof(account));
        if (Base32Decode(secretBase32).Length == 0) throw new ArgumentException("secret is required", nameof(secretBase32));
        if (digits < 6 || digits > 10) throw new ArgumentOutOfRangeException(nameof(digits));
        if (period < 1) throw new ArgumentOutOfRangeException(nameof(period));
        string alg = NormalizeAlgorithm(algorithm);
        string i = PercentEncode(issuer);
        return $"otpauth://totp/{i}:{PercentEncode(account)}?secret={secretBase32}&issuer={i}&algorithm={alg}&digits={digits}&period={period}";
    }

    /// <summary>Returns <paramref name="bytes"/> random bytes from the OS CSPRNG (at least 16).</summary>
    public static byte[] GenerateSecret(int bytes = 20) {
        if (bytes < 16 || bytes > 128) throw new ArgumentOutOfRangeException(nameof(bytes), "secret must be 16-128 bytes");
        return RandomNumberGenerator.GetBytes(bytes);
    }

    private static ulong Counter(long unixSeconds, int step, long t0) {
        if (step < 1) throw new ArgumentOutOfRangeException(nameof(step), "step must be positive");
        if (unixSeconds < t0) throw new ArgumentOutOfRangeException(nameof(unixSeconds), "time precedes t0");
        return (ulong)((unixSeconds - t0) / step);
    }

    private static string NormalizeAlgorithm(string algorithm) => (algorithm ?? "").ToUpperInvariant() switch {
        "SHA1" or "SHA-1" => "SHA1",
        "SHA256" or "SHA-256" => "SHA256",
        "SHA512" or "SHA-512" => "SHA512",
        _ => throw new ArgumentException($"unsupported algorithm '{algorithm}'", nameof(algorithm)),
    };

    /// <summary>RFC 3986 percent-encoding of everything except unreserved characters (space becomes %20).</summary>
    internal static string PercentEncode(string value, bool spaceAsPlus = false) {
        var sb = new StringBuilder();
        foreach (byte b in Encoding.UTF8.GetBytes(value)) {
            char c = (char)b;
            if (c is >= 'A' and <= 'Z' or >= 'a' and <= 'z' or >= '0' and <= '9' or '-' or '.' or '_' or '~') sb.Append(c);
            else if (spaceAsPlus && c == ' ') sb.Append('+');
            else sb.Append('%').Append(b.ToString("X2", System.Globalization.CultureInfo.InvariantCulture));
        }
        return sb.ToString();
    }
}
