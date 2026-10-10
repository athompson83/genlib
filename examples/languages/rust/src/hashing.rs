// SPDX-License-Identifier: Apache-2.0

//! Fast NON-cryptographic hashes for checksums, hash tables, sharding and
//! bucketing: CRC-32 (IEEE), FNV-1a 32/64, MurmurHash3 x86_32 and jump
//! consistent hashing. Never use them for passwords, MACs, signatures or
//! anything an attacker must not be able to forge or collide.

const fn crc_table() -> [u32; 256] {
    let mut t = [0u32; 256];
    let mut i = 0;
    while i < 256 {
        let mut c = i as u32;
        let mut k = 0;
        while k < 8 {
            c = if c & 1 != 0 { 0xEDB8_8320 ^ (c >> 1) } else { c >> 1 };
            k += 1;
        }
        t[i] = c;
        i += 1;
    }
    t
}

static CRC_TABLE: [u32; 256] = crc_table();

/// IEEE 802.3 CRC-32 (reflected, polynomial 0xEDB88320).
pub fn crc32(data: &[u8]) -> u32 {
    !data.iter().fold(!0u32, |c, &b| CRC_TABLE[usize::from(c as u8 ^ b)] ^ (c >> 8))
}

/// 32-bit FNV-1a.
pub fn fnv1a32(data: &[u8]) -> u32 {
    data.iter().fold(0x811c_9dc5u32, |h, &b| (h ^ u32::from(b)).wrapping_mul(0x0100_0193))
}

/// 64-bit FNV-1a.
pub fn fnv1a64(data: &[u8]) -> u64 {
    data.iter().fold(0xcbf2_9ce4_8422_2325u64, |h, &b| (h ^ u64::from(b)).wrapping_mul(0x0000_0100_0000_01b3))
}

fn mix(k: u32) -> u32 {
    k.wrapping_mul(0xcc9e_2d51).rotate_left(15).wrapping_mul(0x1b87_3593)
}

/// MurmurHash3 x86_32 over little-endian 4-byte blocks.
pub fn murmur3_32(data: &[u8], seed: u32) -> u32 {
    let mut h = seed;
    let mut blocks = data.chunks_exact(4);
    for b in blocks.by_ref() {
        h ^= mix(u32::from_le_bytes([b[0], b[1], b[2], b[3]]));
        h = h.rotate_left(13).wrapping_mul(5).wrapping_add(0xe654_6b64);
    }
    let tail = blocks.remainder();
    if !tail.is_empty() {
        let k = tail.iter().enumerate().fold(0u32, |k, (i, &b)| k | u32::from(b) << (8 * i));
        h ^= mix(k);
    }
    h ^= data.len() as u32;
    h ^= h >> 16;
    h = h.wrapping_mul(0x85eb_ca6b);
    h ^= h >> 13;
    h = h.wrapping_mul(0xc2b2_ae35);
    h ^ (h >> 16)
}

/// Lamping and Veach's jump consistent hash: a bucket in `[0, buckets)`;
/// growing from n to n+1 buckets moves only about 1/(n+1) of the keys.
/// `None` unless `buckets` is in 1..2^31-1.
pub fn jump_hash(mut key: u64, buckets: u32) -> Option<u32> {
    if buckets == 0 || buckets > (1 << 31) - 1 {
        return None;
    }
    let (mut b, mut j) = (-1i64, 0i64);
    while j < i64::from(buckets) {
        b = j;
        key = key.wrapping_mul(2_862_933_555_777_941_757).wrapping_add(1);
        j = ((b + 1) as f64 * ((1u64 << 31) as f64 / ((key >> 33) + 1) as f64)) as i64;
    }
    Some(b as u32)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strings() {
        for (s, crc, f32_, f64_, m0, m42) in [
            ("", 0u32, 2166136261u32, "cbf29ce484222325", 0u32, 142593372u32),
            ("a", 3904355907, 3826002220, "af63dc4c8601ec8c", 1009084850, 3001393763),
            ("foobar", 2666930069, 3214735720, "85944171f73967e8", 2764362941, 1018276128),
            ("123456789", 3421780262, 3146166556, "06d5573923c6cdfc", 3036607362, 3059026825),
            ("hello", 907060870, 1335831723, "a430d84680aabd0b", 613153351, 3806057185),
            ("The quick brown fox jumps over the lazy dog", 1095738169, 76545936, "f3f9b7f5e7e47110", 776992547, 880582914),
            ("héllo wörld", 354246585, 3558752674, "11824ab841812022", 2549609076, 857211688),
        ] {
            let b = s.as_bytes();
            assert_eq!(crc32(b), crc, "crc32 {s}");
            assert_eq!(fnv1a32(b), f32_, "fnv1a32 {s}");
            assert_eq!(format!("{:016x}", fnv1a64(b)), f64_, "fnv1a64 {s}");
            assert_eq!(murmur3_32(b, 0), m0, "murmur {s}");
            assert_eq!(murmur3_32(b, 42), m42, "murmur42 {s}");
        }
        assert_eq!(crc32(b"123456789"), 0xCBF4_3926);
        assert_eq!(murmur3_32(b"", 1), 0x514E_28B7);
    }

    #[test]
    fn jump() {
        for (key, n, want) in [
            (0u64, 1u32, 0u32),
            (1, 10, 6),
            (256, 1024, 520),
            (3735928559, 100, 87),
            (18446744073709551615, 1000, 313),
            (12345678901234567, 7, 5),
            (42, 2147483647, 1603940301),
        ] {
            assert_eq!(jump_hash(key, n), Some(want), "{key} {n}");
        }
        assert_eq!(jump_hash(1, 0), None);
        assert_eq!(jump_hash(1, 1 << 31), None);
    }
}
