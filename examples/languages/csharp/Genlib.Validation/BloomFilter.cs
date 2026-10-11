// SPDX-License-Identifier: Apache-2.0
using System.Numerics;
using System.Text;

namespace Genlib.Validation;

/// <summary>
/// Bloom filter with deterministic hashing: h = FNV-1a 64 of the item's UTF-8 bytes, h1 = low 32 bits, h2 = high 32 bits, bit
/// position i = (h1 + i*h2) mod m in wrapping unsigned 64-bit arithmetic. Bit j lives in byte j&gt;&gt;3 at mask 1&lt;&lt;(j&amp;7).
/// The state serializes as unpadded base64url. Bad parameters throw <see cref="ArgumentException"/>.
/// </summary>
public sealed class BloomFilter {
    private readonly byte[] bits;

    /// <summary>Number of bits.</summary>
    public int M { get; }
    /// <summary>Number of hash positions per item.</summary>
    public int K { get; }

    /// <summary>Creates an empty filter with <paramref name="m"/> bits (at least 8) and <paramref name="k"/> positions (1..64).</summary>
    public BloomFilter(int m, int k) : this(m, k, null) { }

    private BloomFilter(int m, int k, byte[]? state) {
        if (m < 8 || k < 1 || k > 64) throw new ArgumentException("bad params");
        M = m; K = k;
        bits = state ?? new byte[(m + 7) / 8];
    }

    /// <summary>64-bit FNV-1a of <paramref name="data"/> (offset 0xcbf29ce484222325, prime 0x100000001b3).</summary>
    public static ulong Fnv1a64(byte[] data) => Hashing.Fnv1a64(data);

    /// <summary>Optimal (m, k) for <paramref name="n"/> items at false-positive rate <paramref name="p"/>: m = max(8, ceil(-n ln p / ln²2)), k = max(1, floor(m/n ln 2 + 0.5)).</summary>
    public static (int M, int K) BloomSizeFor(long n, double p) {
        if (n < 1 || !(p > 0 && p < 1)) throw new ArgumentException("bad size");
        double ln2 = Math.Log(2);
        double mm = Math.Ceiling(-n * Math.Log(p) / (ln2 * ln2));
        if (mm > int.MaxValue) throw new ArgumentException("filter too large");
        int m = Math.Max(8, (int)mm);
        int k = Math.Max(1, (int)Math.Floor((double)m / n * ln2 + 0.5));
        return (m, k);
    }

    /// <summary>The k bit positions for <paramref name="item"/>.</summary>
    public int[] Positions(string item) {
        ArgumentNullException.ThrowIfNull(item);
        ulong h = Hashing.Fnv1a64(Encoding.UTF8.GetBytes(item));
        ulong h1 = h & 0xFFFFFFFFul, h2 = h >> 32;
        var output = new int[K];
        for (int i = 0; i < K; i++) output[i] = (int)(unchecked(h1 + (ulong)i * h2) % (ulong)M);
        return output;
    }

    /// <summary>Adds <paramref name="item"/> to the filter.</summary>
    public void Add(string item) {
        foreach (int j in Positions(item)) bits[j >> 3] |= (byte)(1 << (j & 7));
    }

    /// <summary>True when all k bits for <paramref name="item"/> are set (possibly a false positive); false means definitely absent.</summary>
    public bool MightContain(string item) => Positions(item).All(j => (bits[j >> 3] & (1 << (j & 7))) != 0);

    /// <summary>Estimated item count -m/k ln(1 - X/m) rounded half up, X = set bits; null when every bit is set (saturated).</summary>
    public long? CountEstimate() {
        long x = 0;
        foreach (byte b in bits) x += BitOperations.PopCount(b);
        if (x >= M) return null;
        return (long)Math.Floor(-(double)M / K * Math.Log(1 - (double)x / M) + 0.5);
    }

    /// <summary>The bit array as unpadded base64url (ceil(m/8) bytes).</summary>
    public string Serialize() => Convert.ToBase64String(bits).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    /// <summary>Restores a filter from <see cref="Serialize"/> output; throws ArgumentException for bad base64 or the wrong length.</summary>
    public static BloomFilter Deserialize(int m, int k, string text) {
        ArgumentNullException.ThrowIfNull(text);
        string b64 = text.Replace('-', '+').Replace('_', '/');
        b64 += new string('=', (4 - b64.Length % 4) % 4);
        byte[] raw;
        try { raw = Convert.FromBase64String(b64); } catch (FormatException e) { throw new ArgumentException("bad base64", e); }
        if (m < 8 || raw.Length != (m + 7) / 8) throw new ArgumentException("length");
        return new BloomFilter(m, k, raw);
    }

    /// <summary>A new filter holding the bitwise OR of both; throws ArgumentException when m or k differ.</summary>
    public BloomFilter Union(BloomFilter other) {
        ArgumentNullException.ThrowIfNull(other);
        if (M != other.M || K != other.K) throw new ArgumentException("mismatch");
        var merged = new byte[bits.Length];
        for (int i = 0; i < merged.Length; i++) merged[i] = (byte)(bits[i] | other.bits[i]);
        return new BloomFilter(M, K, merged);
    }
}
