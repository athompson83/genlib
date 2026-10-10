// SPDX-License-Identifier: Apache-2.0
using System.Security.Cryptography;
using System.Text;

namespace Genlib.Validation;

/// <summary>MFA backup codes using Crockford base32 (no I, L, O, U); store only keyed hashes.</summary>
public static class RecoveryCodes {
    public const string Alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

    /// <summary>Generates unique codes such as "7K3QX-9MNP2"; each symbol uses 5 unbiased CSPRNG bits.</summary>
    public static IReadOnlyList<string> Generate(int count = 10, int groups = 2, int groupLength = 5) {
        if (count < 1 || count > 1000) throw new ArgumentOutOfRangeException(nameof(count), "count must be 1-1000");
        ValidateShape(groups, groupLength);
        var seen = new HashSet<string>();
        var codes = new List<string>(count);
        var bytes = new byte[groups * groupLength];
        while (codes.Count < count) {
            RandomNumberGenerator.Fill(bytes);
            var sb = new StringBuilder();
            for (int i = 0; i < bytes.Length; i++) {
                if (i > 0 && i % groupLength == 0) sb.Append('-');
                sb.Append(Alphabet[bytes[i] & 31]);
            }
            string code = sb.ToString();
            if (seen.Add(code)) codes.Add(code);
        }
        return codes;
    }

    /// <summary>Uppercases, strips spaces/hyphens, maps O→0 and I/L→1, then checks alphabet and length.</summary>
    public static string Normalize(string input, int groups = 2, int groupLength = 5) {
        ArgumentNullException.ThrowIfNull(input);
        ValidateShape(groups, groupLength);
        var sb = new StringBuilder(input.Length);
        foreach (char raw in input) {
            if (raw == ' ' || raw == '-') continue;
            char c = char.ToUpperInvariant(raw) switch { 'O' => '0', 'I' or 'L' => '1', var other => other };
            if (Alphabet.IndexOf(c) < 0) throw new FormatException($"invalid recovery code character '{raw}'");
            sb.Append(c);
        }
        if (sb.Length != groups * groupLength) throw new FormatException($"recovery code must have {groups * groupLength} characters");
        return sb.ToString();
    }

    /// <summary>Lowercase hex HMAC-SHA256(key, normalized code).</summary>
    public static string Hash(string code, byte[] key) {
        ArgumentNullException.ThrowIfNull(key);
        if (key.Length == 0) throw new ArgumentException("key must not be empty", nameof(key));
        return Convert.ToHexString(HMACSHA256.HashData(key, Encoding.ASCII.GetBytes(Normalize(code)))).ToLowerInvariant();
    }

    /// <summary>Returns the index of the matching stored hash or -1; compares every hash without early exit.</summary>
    public static int Find(string input, IReadOnlyList<string> storedHashes, byte[] key) {
        ArgumentNullException.ThrowIfNull(storedHashes);
        string candidate;
        try { candidate = Hash(input, key); } catch (FormatException) { return -1; }
        byte[] candidateBytes = Encoding.ASCII.GetBytes(candidate);
        int found = -1;
        for (int i = 0; i < storedHashes.Count; i++) {
            bool equal = CryptographicOperations.FixedTimeEquals(candidateBytes, Encoding.ASCII.GetBytes(storedHashes[i] ?? ""));
            if (equal && found < 0) found = i;
        }
        return found;
    }

    private static void ValidateShape(int groups, int groupLength) {
        if (groups < 1 || groupLength < 1 || groups * groupLength > 64) throw new ArgumentOutOfRangeException(nameof(groups), "invalid code shape");
    }
}
