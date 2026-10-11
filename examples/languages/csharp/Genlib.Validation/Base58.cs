// SPDX-License-Identifier: Apache-2.0
using System.Security.Cryptography;
using System.Text;

namespace Genlib.Validation;

/// <summary>
/// Base58 with the Bitcoin alphabet and Base58Check (payload + first 4 bytes of SHA-256(SHA-256(payload))). Leading zero bytes
/// map to leading '1's; the rest is the big-endian number in base 58, converted on byte arrays (no big-integer type). Errors
/// throw <see cref="FormatException"/> (a character outside the alphabet, a Base58Check string under 4 bytes or a checksum mismatch).
/// </summary>
public static class Base58 {
    private const string Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

    /// <summary>Encodes bytes as Base58 text.</summary>
    public static string Encode(ReadOnlySpan<byte> data) {
        int zeros = 0;
        while (zeros < data.Length && data[zeros] == 0) zeros++;
        // Base 58 digits, least significant first.
        var digits = new List<byte>();
        for (int i = zeros; i < data.Length; i++) {
            int carry = data[i];
            for (int j = 0; j < digits.Count; j++) {
                carry += digits[j] << 8;
                digits[j] = (byte)(carry % 58);
                carry /= 58;
            }
            while (carry > 0) { digits.Add((byte)(carry % 58)); carry /= 58; }
        }
        var sb = new StringBuilder(zeros + digits.Count);
        sb.Append('1', zeros);
        for (int j = digits.Count - 1; j >= 0; j--) sb.Append(Alphabet[digits[j]]);
        return sb.ToString();
    }

    /// <summary>Decodes Base58 text to bytes; the empty string gives no bytes; throws FormatException for a character outside the alphabet.</summary>
    public static byte[] Decode(string text) {
        ArgumentNullException.ThrowIfNull(text);
        // Big-endian magnitude, least significant byte first while building.
        var bytes = new List<byte>();
        foreach (char c in text) {
            int carry = Alphabet.IndexOf(c);
            if (carry < 0) throw new FormatException("invalid base58 character");
            for (int j = 0; j < bytes.Count; j++) {
                carry += bytes[j] * 58;
                bytes[j] = (byte)(carry & 0xFF);
                carry >>= 8;
            }
            while (carry > 0) { bytes.Add((byte)(carry & 0xFF)); carry >>= 8; }
        }
        int ones = 0;
        while (ones < text.Length && text[ones] == '1') ones++;
        var result = new byte[ones + bytes.Count];
        for (int j = 0; j < bytes.Count; j++) result[result.Length - 1 - j] = bytes[j];
        return result;
    }

    /// <summary>Encodes a payload as Base58Check (payload followed by a 4-byte double SHA-256 checksum).</summary>
    public static string CheckEncode(ReadOnlySpan<byte> payload) {
        var buffer = new byte[payload.Length + 4];
        payload.CopyTo(buffer);
        Checksum(payload).CopyTo(buffer, payload.Length);
        return Encode(buffer);
    }

    /// <summary>Decodes Base58Check text and returns the payload; throws FormatException when too short or the checksum does not match.</summary>
    public static byte[] CheckDecode(string text) {
        var b = Decode(text);
        if (b.Length < 4) throw new FormatException("too short for a checksum");
        var payload = b.AsSpan(0, b.Length - 4);
        if (!Checksum(payload).AsSpan().SequenceEqual(b.AsSpan(b.Length - 4))) throw new FormatException("checksum mismatch");
        return payload.ToArray();
    }

    private static byte[] Checksum(ReadOnlySpan<byte> payload) => SHA256.HashData(SHA256.HashData(payload))[..4];
}
