// SPDX-License-Identifier: Apache-2.0
using System.Numerics;

namespace Genlib.Validation;

/// <summary>
/// Non-cryptographic hashes for checksums, sharding and bucketing: CRC-32, FNV-1a, MurmurHash3 x86_32 and jump consistent hash.
/// Never use them for passwords, MACs, signatures or anything an attacker must not forge.
/// </summary>
public static class Hashing {
    private static readonly uint[] CrcTable = BuildCrcTable();

    private static uint[] BuildCrcTable() {
        var table = new uint[256];
        for (uint n = 0; n < 256; n++) {
            uint c = n;
            for (int k = 0; k < 8; k++) c = (c & 1) != 0 ? 0xEDB88320u ^ (c >> 1) : c >> 1;
            table[n] = c;
        }
        return table;
    }

    /// <summary>CRC-32 (IEEE 802.3, reflected polynomial 0xEDB88320, init and xorout 0xFFFFFFFF).</summary>
    public static uint Crc32(byte[] data) {
        uint c = 0xFFFFFFFFu;
        foreach (byte b in data) c = CrcTable[(c ^ b) & 0xFF] ^ (c >> 8);
        return c ^ 0xFFFFFFFFu;
    }

    /// <summary>32-bit FNV-1a.</summary>
    public static uint Fnv1a32(byte[] data) {
        uint h = 0x811C9DC5u;
        foreach (byte b in data) h = unchecked((h ^ b) * 0x01000193u);
        return h;
    }

    /// <summary>64-bit FNV-1a (offset basis 0xcbf29ce484222325, prime 0x100000001b3).</summary>
    public static ulong Fnv1a64(byte[] data) {
        ulong h = 0xCBF29CE484222325ul;
        foreach (byte b in data) h = unchecked((h ^ b) * 0x100000001B3ul);
        return h;
    }

    /// <summary>MurmurHash3 x86_32 with little-endian 4-byte blocks.</summary>
    public static uint Murmur3_32(byte[] data, uint seed = 0) {
        const uint c1 = 0xCC9E2D51u, c2 = 0x1B873593u;
        uint h = seed;
        int n = data.Length, blocks = n - n % 4;
        unchecked {
            for (int i = 0; i < blocks; i += 4) {
                uint k = (uint)(data[i] | (data[i + 1] << 8) | (data[i + 2] << 16) | (data[i + 3] << 24));
                k *= c1; k = BitOperations.RotateLeft(k, 15); k *= c2;
                h ^= k; h = BitOperations.RotateLeft(h, 13); h = h * 5 + 0xE6546B64u;
            }
            uint t = 0;
            for (int i = n - 1; i >= blocks; i--) t = (t << 8) | data[i];
            if (n > blocks) { t *= c1; t = BitOperations.RotateLeft(t, 15); t *= c2; h ^= t; }
            h ^= (uint)n;
            h ^= h >> 16; h *= 0x85EBCA6Bu; h ^= h >> 13; h *= 0xC2B2AE35u; h ^= h >> 16;
        }
        return h;
    }

    /// <summary>Lamping and Veach jump consistent hash: maps a 64-bit key to a bucket in [0, buckets) moving few keys on resize.</summary>
    public static int JumpHash(ulong key, int buckets) {
        if (buckets < 1) throw new ArgumentOutOfRangeException(nameof(buckets), "buckets must be 1..2^31-1");
        long b = -1, j = 0;
        while (j < buckets) {
            b = j;
            key = unchecked(key * 2862933555777941757ul + 1);
            j = (long)((b + 1) * (2147483648.0 / ((key >> 33) + 1)));
        }
        return (int)b;
    }
}
