// SPDX-License-Identifier: Apache-2.0

import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * Bloom filter with deterministic FNV-1a 64-bit double hashing: h1 = low 32 bits, h2 = high 32 bits, position i =
 * (h1 + i*h2) mod m in unsigned 64-bit arithmetic. Bit j lives in byte j>>3 at mask 1<<(j&7). The serialized form is
 * base64url without padding. Items are hashed as UTF-8. Failures throw IllegalArgumentException.
 */
public final class BloomFilter {
    /** Bit count m and hash count k for an expected item count and false-positive rate. */
    public record Size(int m, int k) {}

    private final int m;
    private final int k;
    private final byte[] bits;

    /** An empty filter with m bits (at least 8) and k hash positions (1..64). */
    public BloomFilter(int m, int k) { this(m, k, new byte[(m + 7) / 8]); }

    private BloomFilter(int m, int k, byte[] bits) {
        if (m < 8 || k < 1 || k > 64) throw new IllegalArgumentException("bad params");
        this.m = m;
        this.k = k;
        this.bits = bits;
    }

    /** FNV-1a 64-bit hash of the bytes (as an unsigned value stored in a long). */
    public static long fnv1a64(byte[] data) {
        long h = 0xcbf29ce484222325L;
        for (byte b : data) {
            h ^= b & 0xFF;
            h *= 0x100000001b3L;
        }
        return h;
    }

    /** m = ceil(-n ln p / ln(2)^2) (min 8) and k = max(1, floor(m/n ln 2 + 0.5)); n >= 1 and 0 < p < 1. */
    public static Size bloomSizeFor(long n, double p) {
        if (n < 1 || !(p > 0 && p < 1)) throw new IllegalArgumentException("bad size");
        double ln2 = Math.log(2);
        double raw = Math.ceil(-n * Math.log(p) / (ln2 * ln2));
        if (raw > Integer.MAX_VALUE - 7) throw new IllegalArgumentException("bad size");
        int m = Math.max(8, (int) raw);
        int k = (int) Math.max(1, Math.floor((double) m / n * ln2 + 0.5));
        return new Size(m, k);
    }

    /** Bit count m. */
    public int m() { return m; }

    /** Hash count k. */
    public int k() { return k; }

    /** The k bit positions for an item. */
    public int[] positions(String item) {
        long h = fnv1a64(item.getBytes(StandardCharsets.UTF_8));
        long h1 = h & 0xffffffffL;
        long h2 = h >>> 32;
        int[] out = new int[k];
        for (int i = 0; i < k; i++) out[i] = (int) Long.remainderUnsigned(h1 + i * h2, m);
        return out;
    }

    /** Sets the item's bits. */
    public void add(String item) {
        for (int j : positions(item)) bits[j >> 3] |= (byte) (1 << (j & 7));
    }

    /** True when all of the item's bits are set (false positives possible, no false negatives). */
    public boolean mightContain(String item) {
        for (int j : positions(item)) if ((bits[j >> 3] & (1 << (j & 7))) == 0) return false;
        return true;
    }

    /** Estimated item count round(-m/k ln(1 - X/m)), or null when every bit is set. */
    public Long countEstimate() {
        int x = 0;
        for (byte b : bits) x += Integer.bitCount(b & 0xFF);
        if (x >= m) return null;
        return (long) Math.floor(-(double) m / k * Math.log(1 - (double) x / m) + 0.5);
    }

    /** The bit array as base64url without padding. */
    public String serialize() { return Base64.getUrlEncoder().withoutPadding().encodeToString(bits); }

    /** A filter from serialize() output; rejects a byte length other than ceil(m/8). */
    public static BloomFilter deserialize(int m, int k, String text) {
        byte[] raw = Base64.getUrlDecoder().decode(text);
        if (raw.length != (m + 7) / 8) throw new IllegalArgumentException("length");
        return new BloomFilter(m, k, raw);
    }

    /** A new filter with the bits of both; m and k must match. */
    public BloomFilter union(BloomFilter other) {
        if (m != other.m || k != other.k) throw new IllegalArgumentException("mismatch");
        byte[] out = new byte[bits.length];
        for (int i = 0; i < out.length; i++) out[i] = (byte) (bits[i] | other.bits[i]);
        return new BloomFilter(m, k, out);
    }
}
