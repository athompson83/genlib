// SPDX-License-Identifier: Apache-2.0
using System.Security.Cryptography;

namespace Genlib.Validation;

/// <summary>Time-ordered identifiers: UUIDv7 (RFC 9562) and ULID (Crockford base32).</summary>
public static class Ids {
    private const string Crockford = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    private const long MaxTime = (1L << 48) - 1;

    /// <summary>Builds a UUIDv7 from a 48-bit unix millisecond time and exactly 10 random bytes.</summary>
    public static string UuidV7(long unixMs, byte[] random10) {
        byte[] b = Layout(unixMs, random10);
        b[6] = (byte)(0x70 | (b[6] & 0x0f));
        b[8] = (byte)(0x80 | (b[8] & 0x3f));
        string hex = Convert.ToHexString(b).ToLowerInvariant();
        return $"{hex[..8]}-{hex[8..12]}-{hex[12..16]}-{hex[16..20]}-{hex[20..]}";
    }

    /// <summary>Builds a 26-character ULID from a 48-bit unix millisecond time and exactly 10 random bytes.</summary>
    public static string Ulid(long unixMs, byte[] random10) {
        byte[] b = Layout(unixMs, random10);
        UInt128 value = 0;
        foreach (byte x in b) value = (value << 8) | x;
        var chars = new char[26];
        for (int i = 0; i < 26; i++) chars[i] = Crockford[(int)((value >> (125 - 5 * i)) & 31)];
        return new string(chars);
    }

    /// <summary>Returns the unix millisecond time of a UUIDv7; throws <see cref="FormatException"/> for anything else.</summary>
    public static long UuidV7Time(string text) {
        ArgumentNullException.ThrowIfNull(text);
        if (text.Length != 36) throw new FormatException("UUID must be 36 characters");
        for (int i = 0; i < 36; i++) {
            bool dash = i is 8 or 13 or 18 or 23;
            if (dash ? text[i] != '-' : !Uri.IsHexDigit(text[i])) throw new FormatException("UUID has an invalid character at " + i);
        }
        if (text[14] != '7') throw new FormatException("UUID is not version 7");
        if ("89abAB".IndexOf(text[19]) < 0) throw new FormatException("UUID has an invalid variant");
        return Convert.ToInt64(text[..8] + text[9..13], 16);
    }

    /// <summary>Returns the unix millisecond time of a ULID (case-insensitive); throws <see cref="FormatException"/> when invalid.</summary>
    public static long UlidTime(string text) {
        ArgumentNullException.ThrowIfNull(text);
        if (text.Length != 26) throw new FormatException("ULID must be 26 characters");
        UInt128 value = 0;
        for (int i = 0; i < 26; i++) {
            int v = Crockford.IndexOf(char.ToUpperInvariant(text[i]));
            if (v < 0) throw new FormatException("ULID has an invalid character at " + i);
            if (i == 0 && v > 7) throw new FormatException("ULID overflows 128 bits");
            value = (value << 5) | (uint)v;
        }
        return (long)(ulong)(value >> 80);
    }

    /// <summary>A new UUIDv7 from the system clock and the cryptographic random generator.</summary>
    public static string NewUuidV7() => UuidV7(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), RandomNumberGenerator.GetBytes(10));

    /// <summary>A new ULID from the system clock and the cryptographic random generator.</summary>
    public static string NewUlid() => Ulid(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), RandomNumberGenerator.GetBytes(10));

    private static byte[] Layout(long unixMs, byte[] random10) {
        ArgumentNullException.ThrowIfNull(random10);
        if (unixMs < 0 || unixMs > MaxTime) throw new ArgumentOutOfRangeException(nameof(unixMs), "unixMs must be in [0, 2^48-1]");
        if (random10.Length != 10) throw new ArgumentException("exactly 10 random bytes are required", nameof(random10));
        var b = new byte[16];
        for (int i = 0; i < 6; i++) b[i] = (byte)(unixMs >> (40 - 8 * i));
        random10.CopyTo(b, 6);
        return b;
    }
}
