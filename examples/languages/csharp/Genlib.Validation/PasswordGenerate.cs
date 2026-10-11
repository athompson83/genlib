// SPDX-License-Identifier: Apache-2.0
using System.Security.Cryptography;
using System.Text;

namespace Genlib.Validation;

/// <summary>
/// Password and passphrase generation from an injected byte source (each call returns 0..255) so results are reproducible in
/// tests; the overloads without a byte source use the platform CSPRNG (<see cref="RandomNumberGenerator"/>), never
/// <see cref="Random"/>. Indexes use unbiased rejection sampling; a password takes one character from each class in class order,
/// fills the rest from the union of the classes, then applies a Fisher-Yates shuffle. Classes: lower, upper, digits, symbols
/// ('!#$%&amp;*+-=?@^_~'); excluding ambiguous characters removes 'Il1O0o'. Invalid arguments throw <see cref="ArgumentException"/>.
/// </summary>
public static class PasswordGenerate {
    private static readonly Dictionary<string, string> Classes = new() {
        ["lower"] = "abcdefghijklmnopqrstuvwxyz",
        ["upper"] = "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        ["digits"] = "0123456789",
        ["symbols"] = "!#$%&*+-=?@^_~",
    };
    private static readonly string[] DefaultClasses = { "lower", "upper", "digits", "symbols" };

    /// <summary>One byte from the platform CSPRNG.</summary>
    public static byte SecureByte() => (byte)RandomNumberGenerator.GetInt32(256);

    /// <summary>An unbiased index in [0, n) by rejection sampling over the fewest big-endian bytes k with 256^k &gt;= n.</summary>
    public static int RandomIndex(int n, Func<byte> nextByte) {
        ArgumentNullException.ThrowIfNull(nextByte);
        if (n < 1) throw new ArgumentOutOfRangeException(nameof(n), "n must be positive");
        if (n == 1) return 0;
        int k = 1;
        ulong span = 256;
        while (span < (ulong)n) { k++; span *= 256; }
        ulong limit = span / (ulong)n * (ulong)n;
        while (true) {
            ulong x = 0;
            for (int i = 0; i < k; i++) x = x * 256 + nextByte();
            if (x < limit) return (int)(x % (ulong)n);
        }
    }

    /// <summary>An unbiased index in [0, n) from the platform CSPRNG.</summary>
    public static int RandomIndex(int n) => RandomIndex(n, SecureByte);

    /// <summary>A password of <paramref name="length"/> (classes count..1024) with at least one character from each distinct known class.</summary>
    public static string GeneratePassword(int length, IReadOnlyList<string> classes, Func<byte> nextByte, bool excludeAmbiguous = false) {
        ArgumentNullException.ThrowIfNull(classes);
        ArgumentNullException.ThrowIfNull(nextByte);
        if (classes.Count == 0 || classes.Distinct().Count() != classes.Count || classes.Any(c => c is null || !Classes.ContainsKey(c)))
            throw new ArgumentException("bad classes", nameof(classes));
        if (length < classes.Count || length > 1024) throw new ArgumentOutOfRangeException(nameof(length), "bad length");
        var alphabets = classes.Select(c => excludeAmbiguous ? new string(Classes[c].Where(ch => !"Il1O0o".Contains(ch)).ToArray()) : Classes[c]).ToList();
        var output = new List<char>(length);
        foreach (var a in alphabets) output.Add(a[RandomIndex(a.Length, nextByte)]);
        string union = string.Concat(alphabets);
        for (int i = classes.Count; i < length; i++) output.Add(union[RandomIndex(union.Length, nextByte)]);
        for (int i = output.Count - 1; i > 0; i--) {
            int j = RandomIndex(i + 1, nextByte);
            (output[i], output[j]) = (output[j], output[i]);
        }
        return new string(output.ToArray());
    }

    /// <summary>A password from the platform CSPRNG (default 16 characters from all four classes).</summary>
    public static string GeneratePassword(int length = 16, IReadOnlyList<string>? classes = null, bool excludeAmbiguous = false) =>
        GeneratePassword(length, classes ?? DefaultClasses, SecureByte, excludeAmbiguous);

    /// <summary>A passphrase of <paramref name="count"/> (1..64) words joined by <paramref name="separator"/>; needs 2+ distinct non-empty words.</summary>
    public static string GeneratePassphrase(IReadOnlyList<string> words, int count, string separator, Func<byte> nextByte) {
        ArgumentNullException.ThrowIfNull(words);
        ArgumentNullException.ThrowIfNull(separator);
        ArgumentNullException.ThrowIfNull(nextByte);
        if (count < 1 || count > 64 || words.Distinct().Count() < 2 || words.Any(string.IsNullOrEmpty)) throw new ArgumentException("bad arguments");
        var sb = new StringBuilder();
        for (int i = 0; i < count; i++) {
            if (i > 0) sb.Append(separator);
            sb.Append(words[RandomIndex(words.Count, nextByte)]);
        }
        return sb.ToString();
    }

    /// <summary>A passphrase from the platform CSPRNG (default 5 words joined by '-').</summary>
    public static string GeneratePassphrase(IReadOnlyList<string> words, int count = 5, string separator = "-") =>
        GeneratePassphrase(words, count, separator, SecureByte);

    /// <summary>length * log2(alphabetSize), rounded to 2 decimals (for strength meters).</summary>
    public static double EntropyBits(int alphabetSize, int length) => Math.Round(length * Math.Log2(alphabetSize), 2, MidpointRounding.ToEven);
}
