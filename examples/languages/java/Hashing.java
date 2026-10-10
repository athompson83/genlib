// SPDX-License-Identifier: Apache-2.0

/**
 * Non-cryptographic hashes: CRC-32 (IEEE), FNV-1a 32/64, MurmurHash3 x86_32 and jump consistent hash.
 * Never use them for passwords, MACs or signatures. 32-bit results are returned as unsigned values in a long;
 * fnv1a64 returns the 64 bits in a long (format with Long.toUnsignedString).
 */
public final class Hashing {
    private static final int[] CRC_TABLE = new int[256];

    static {
        for (int i = 0; i < 256; i++) {
            int c = i;
            for (int k = 0; k < 8; k++) c = (c & 1) != 0 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
            CRC_TABLE[i] = c;
        }
    }

    private Hashing() {}

    /** CRC-32 (IEEE 802.3, reflected, polynomial 0xEDB88320). */
    public static long crc32(byte[] data) {
        int c = 0xFFFFFFFF;
        for (byte b : data) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
        return Integer.toUnsignedLong(~c);
    }

    public static long fnv1a32(byte[] data) {
        int h = 0x811c9dc5;
        for (byte b : data) h = (h ^ (b & 0xff)) * 0x01000193;
        return Integer.toUnsignedLong(h);
    }

    public static long fnv1a64(byte[] data) {
        long h = 0xcbf29ce484222325L;
        for (byte b : data) h = (h ^ (b & 0xff)) * 0x100000001b3L;
        return h;
    }

    public static long murmur3_32(byte[] data) { return murmur3_32(data, 0); }

    /** MurmurHash3 x86_32 with little-endian 4-byte blocks. */
    public static long murmur3_32(byte[] data, int seed) {
        final int c1 = 0xcc9e2d51;
        final int c2 = 0x1b873593;
        int h = seed;
        int n = data.length;
        int blocks = n - n % 4;
        for (int i = 0; i < blocks; i += 4) {
            int k = (data[i] & 0xff) | (data[i + 1] & 0xff) << 8 | (data[i + 2] & 0xff) << 16 | (data[i + 3] & 0xff) << 24;
            k *= c1; k = Integer.rotateLeft(k, 15); k *= c2;
            h ^= k; h = Integer.rotateLeft(h, 13); h = h * 5 + 0xe6546b64;
        }
        int k = 0;
        for (int i = blocks; i < n; i++) k |= (data[i] & 0xff) << (8 * (i - blocks));
        if (n > blocks) { k *= c1; k = Integer.rotateLeft(k, 15); k *= c2; h ^= k; }
        h ^= n;
        h ^= h >>> 16; h *= 0x85ebca6b; h ^= h >>> 13; h *= 0xc2b2ae35; h ^= h >>> 16;
        return Integer.toUnsignedLong(h);
    }

    /** Lamping and Veach jump consistent hash; key is an unsigned 64-bit value, buckets 1..2^31-1. */
    public static int jumpHash(long key, int buckets) {
        if (buckets < 1) throw new IllegalArgumentException("buckets must be 1..2^31-1");
        long b = -1;
        long j = 0;
        while (j < buckets) {
            b = j;
            key = key * 2862933555777941757L + 1;
            j = (long) ((b + 1) * ((double) (1L << 31) / (double) ((key >>> 33) + 1)));
        }
        return (int) b;
    }
}
