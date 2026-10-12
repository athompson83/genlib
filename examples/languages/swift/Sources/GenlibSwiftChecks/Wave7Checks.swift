// SPDX-License-Identifier: Apache-2.0
// Checks for base-encodings, vcard, hashing, feature-flags, human-units, password-policy and text-sanitize.
// Every vector comes from the shared wave 7 vector set (JSON null = nil; hex strings are byte inputs). Strings are
// compared as UTF-8 bytes because Swift String equality treats canonically equivalent text as equal.
import GenlibSwift

private let base32Vectors: [(String, String, String, String)] = [
    ("", "", "", ""),
    ("66", "MY======", "CO======", "MY"),
    ("666f", "MZXQ====", "CPNG====", "MZXQ"),
    ("666f6f", "MZXW6===", "CPNMU===", "MZXW6"),
    ("666f6f62", "MZXW6YQ=", "CPNMUOG=", "MZXW6YQ"),
    ("666f6f6261", "MZXW6YTB", "CPNMUOJ1", "MZXW6YTB"),
    ("666f6f626172", "MZXW6YTBOI======", "CPNMUOJ1E8======", "MZXW6YTBOI"),
]
private let base32CaseInsensitive: [(String, String)] = [("mzxw6ytboi======", "666f6f626172")]
private let base32Invalid: [(String, Bool)] = [("MZXW6YT", true), ("MZXW6YR=", true), ("MZ======", true), ("MZXW6YTB1=======", true), ("MZXR====", true), ("MZXW6===", false)]
private let base58Vectors: [(String, String)] = [
    ("", ""),
    ("48656c6c6f20576f726c6421", "2NEpo7TZRRrLZSi2U"),
    ("0000287fb4cd", "11233QC4"),
    ("00", "1"),
    ("0000", "11"),
    ("ff", "5Q"),
    ("00eb15231dfceb60925886b67d065299925915aeb172c06647", "1NS17iag9jJgTHD1VXjvLCEnZuQ3rJDE9L"),
]
private let base58Invalid = ["0OIl", "abc0", "I"]
private let base64UrlVectors: [(String, String)] = [
    ("", ""),
    ("66", "Zg"),
    ("666f", "Zm8"),
    ("666f6f", "Zm9v"),
    ("666f6f62", "Zm9vYg"),
    ("666f6f6261", "Zm9vYmE"),
    ("666f6f626172", "Zm9vYmFy"),
    ("fbff", "-_8"),
    ("000102030405", "AAECAwQF"),
]
private let base64UrlInvalid = ["Zg==", "Zh", "a", "+/", "Zm9v!"]

private let vcardCases: [(VCardContact, String)] = [
    (VCardContact(fn: "Ada Lovelace", n: VCardName(family: "Lovelace", given: "Ada", prefix: "Countess"), org: "Analytical Engines, Ltd.", title: "Programmer", emails: [VCardValue("ada@example.com", type: "work")], phones: [VCardValue("+44 20 7946 0000", type: "cell")], address: VCardAddress(type: "home", street: "12 St. James's Sq", locality: "London", postalCode: "SW1Y 4LB", country: "United Kingdom"), urls: ["https://example.com/ada"], note: "First line\nSecond; with, punctuation \\ backslash", uid: "urn:uuid:01a0c450-6c7b-7102-8304-05060708090a"),
     "BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Ada Lovelace\r\nN:Lovelace;Ada;;Countess;\r\nORG:Analytical Engines\\, Ltd.\r\nTITLE:Programmer\r\nEMAIL;TYPE=work:ada@example.com\r\nTEL;TYPE=cell:+44 20 7946 0000\r\nADR;TYPE=home:;;12 St. James's Sq;London;;SW1Y 4LB;United Kingdom\r\nURL:https://example.com/ada\r\nNOTE:First line\\nSecond\\; with\\, punctuation \\\\ backslash\r\nUID:urn:uuid:01a0c450-6c7b-7102-8304-05060708090a\r\nEND:VCARD\r\n"),
    (VCardContact(fn: "Zoë Ångström"),
     "BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Zoë Ångström\r\nEND:VCARD\r\n"),
    (VCardContact(fn: "Long Note", note: "éééééééééééééééééééééééééééééééééééééééééééééééééééééééééééé"),
     "BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Long Note\r\nNOTE:ééééééééééééééééééééééééééééééééééé\r\n ééééééééééééééééééééééééé\r\nEND:VCARD\r\n"),
]
private let vcardInvalid: [VCardContact] = [
    VCardContact(fn: ""),
    VCardContact(fn: "   "),
    VCardContact(fn: "A", emails: [VCardValue("not an email")]),
    VCardContact(fn: "A", phones: [VCardValue("call me")]),
    VCardContact(fn: "A", urls: ["javascript:alert(1)"]),
    VCardContact(fn: "A", emails: [VCardValue("a@b.c", type: "Work")]),
    VCardContact(fn: "Tab\there"),
]

private let hashStrings: [(String, UInt32, UInt32, String, UInt32, UInt32)] = [
    ("", 0, 2166136261, "cbf29ce484222325", 0, 142593372),
    ("a", 3904355907, 3826002220, "af63dc4c8601ec8c", 1009084850, 3001393763),
    ("foobar", 2666930069, 3214735720, "85944171f73967e8", 2764362941, 1018276128),
    ("123456789", 3421780262, 3146166556, "06d5573923c6cdfc", 3036607362, 3059026825),
    ("hello", 907060870, 1335831723, "a430d84680aabd0b", 613153351, 3806057185),
    ("The quick brown fox jumps over the lazy dog", 1095738169, 76545936, "f3f9b7f5e7e47110", 776992547, 880582914),
    ("héllo wörld", 354246585, 3558752674, "11824ab841812022", 2549609076, 857211688),
]
private let jumpVectors: [(UInt64, Int, Int)] = [(0, 1, 0), (1, 10, 6), (256, 1024, 520), (3735928559, 100, 87), (18446744073709551615, 1000, 313), (12345678901234567, 7, 5), (42, 2147483647, 1603940301)]

private let flagCases: [(FeatureFlag, String, FlagEvaluation)] = [
    (FeatureFlag(key: "new-checkout", rolloutPercent: 25), "user-1", FlagEvaluation(on: true, reason: "rollout", bucket: 849, variant: nil)),
    (FeatureFlag(key: "new-checkout", rolloutPercent: 25), "user-2", FlagEvaluation(on: false, reason: "excluded", bucket: 5308, variant: nil)),
    (FeatureFlag(key: "new-checkout", rolloutPercent: 25), "user-3", FlagEvaluation(on: false, reason: "excluded", bucket: 5247, variant: nil)),
    (FeatureFlag(key: "new-checkout", rolloutPercent: 25), "user-42", FlagEvaluation(on: false, reason: "excluded", bucket: 9209, variant: nil)),
    (FeatureFlag(key: "new-checkout", rolloutPercent: 25), "alice@example.com", FlagEvaluation(on: false, reason: "excluded", bucket: 9060, variant: nil)),
    (FeatureFlag(key: "new-checkout", allow: ["user-2"], deny: ["user-1"], rolloutPercent: 25), "user-1", FlagEvaluation(on: false, reason: "deny", bucket: 849, variant: nil)),
    (FeatureFlag(key: "new-checkout", allow: ["user-2"], deny: ["user-1"], rolloutPercent: 25), "user-2", FlagEvaluation(on: true, reason: "allow", bucket: 5308, variant: nil)),
    (FeatureFlag(key: "beta", enabled: false, allow: ["vip"]), "vip", FlagEvaluation(on: false, reason: "disabled", bucket: 8844, variant: nil)),
    (FeatureFlag(key: "banner", rolloutPercent: 0), "user-1", FlagEvaluation(on: false, reason: "excluded", bucket: 6875, variant: nil)),
    (FeatureFlag(key: "banner", rolloutPercent: 100), "user-1", FlagEvaluation(on: true, reason: "rollout", bucket: 6875, variant: nil)),
    (FeatureFlag(key: "banner", rolloutPercent: 12.34), "user-9", FlagEvaluation(on: false, reason: "excluded", bucket: 8197, variant: nil)),
    (FeatureFlag(key: "pricing-test", variants: [FlagVariant("control", weight: 50), FlagVariant("annual-first", weight: 30), FlagVariant("monthly-first", weight: 20)]), "u1", FlagEvaluation(on: true, reason: "rollout", bucket: 6435, variant: "control")),
    (FeatureFlag(key: "pricing-test", variants: [FlagVariant("control", weight: 50), FlagVariant("annual-first", weight: 30), FlagVariant("monthly-first", weight: 20)]), "u2", FlagEvaluation(on: true, reason: "rollout", bucket: 401, variant: "annual-first")),
    (FeatureFlag(key: "pricing-test", variants: [FlagVariant("control", weight: 50), FlagVariant("annual-first", weight: 30), FlagVariant("monthly-first", weight: 20)]), "u3", FlagEvaluation(on: true, reason: "rollout", bucket: 9955, variant: "monthly-first")),
    (FeatureFlag(key: "pricing-test", variants: [FlagVariant("control", weight: 50), FlagVariant("annual-first", weight: 30), FlagVariant("monthly-first", weight: 20)]), "u4", FlagEvaluation(on: true, reason: "rollout", bucket: 8249, variant: "annual-first")),
    (FeatureFlag(key: "pricing-test", variants: [FlagVariant("control", weight: 50), FlagVariant("annual-first", weight: 30), FlagVariant("monthly-first", weight: 20)]), "u5", FlagEvaluation(on: true, reason: "rollout", bucket: 6254, variant: "control")),
    (FeatureFlag(key: "pricing-test", variants: [FlagVariant("control", weight: 50), FlagVariant("annual-first", weight: 30), FlagVariant("monthly-first", weight: 20)]), "ünïcode", FlagEvaluation(on: true, reason: "rollout", bucket: 7068, variant: "control")),
]
private let flagInvalid: [FeatureFlag] = [
    FeatureFlag(key: "bad key"),
    FeatureFlag(key: "k", rolloutPercent: 101),
    FeatureFlag(key: "k", rolloutPercent: 12.345),
    FeatureFlag(key: "k", variants: [FlagVariant("a", weight: 0)]),
    FeatureFlag(key: ""),
]

private let formatBytesVectors: [(Int64, ByteBase, Int, String)] = [
    (0, .si, 1, "0 B"),
    (999, .si, 1, "999 B"),
    (1000, .si, 1, "1 kB"),
    (1536, .iec, 1, "1.5 KiB"),
    (1536, .si, 1, "1.5 kB"),
    (999950, .si, 1, "1 MB"),
    (999949, .si, 1, "999.9 kB"),
    (1048576, .iec, 2, "1 MiB"),
    (123456789, .si, 2, "123.46 MB"),
    (123456789, .iec, 0, "118 MiB"),
    (9223372036854775807, .iec, 3, "8 EiB"),
    (1023, .iec, 1, "1023 B"),
    (1024, .iec, 1, "1 KiB"),
    (5000000000000, .si, 1, "5 TB"),
]
private let parseBytesVectors: [(String, Int64)] = [("0", 0), ("512", 512), ("1kB", 1000), ("1 KiB", 1024), ("1.5 GiB", 1610612736), ("2.25MB", 2250000), (" 10 b ", 10), ("1.0005 kB", 1001), ("1.5", 2), ("0.5 B", 1), ("7 EiB", 8070450532247928832)]
private let parseBytesInvalid = ["", "abc", "1 KB B", "1.5.2 MB", "-1 kB", "1 kbit", "1e3 B", "9 EiB", ".5 kB"]
private let durationVectors: [(Int64, String)] = [(0, "0ms"), (850, "850ms"), (1000, "1s"), (45000, "45s"), (65000, "1m 5s"), (3600000, "1h"), (3725000, "1h 2m"), (90061000, "1d 1h"), (172800000, "2d"), (59999, "59s")]
private let relativeVectors: [(Int64, String)] = [
    (0, "just now"),
    (30, "just now"),
    (-44, "just now"),
    (45, "in a minute"),
    (-89, "a minute ago"),
    (90, "in 2 minutes"),
    (150, "in 3 minutes"),
    (-2670, "45 minutes ago"),
    (2700, "in an hour"),
    (5399, "in an hour"),
    (5400, "in 2 hours"),
    (-75600, "21 hours ago"),
    (79200, "in a day"),
    (129599, "in a day"),
    (129600, "in 2 days"),
    (2246400, "in a month"),
    (-3974400, "2 months ago"),
    (15552000, "in 6 months"),
    (27648000, "in a year"),
    (-47347200, "2 years ago"),
    (63115200, "in 2 years"),
    (315569520, "in 10 years"),
]


private let passwordCases: [(String, PasswordOptions, PasswordCheck)] = [
    ("correct horse battery staple", PasswordOptions(), PasswordCheck(ok: true, failures: [])),
    ("short", PasswordOptions(), PasswordCheck(ok: false, failures: ["too-short"])),
    ("Tr0ub4dor&3", PasswordOptions(minLength: 8), PasswordCheck(ok: true, failures: [])),
    ("password", PasswordOptions(minLength: 8, blocklist: ["Password", "123456"]), PasswordCheck(ok: false, failures: ["blocklisted"])),
    ("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", PasswordOptions(maxLength: 64), PasswordCheck(ok: false, failures: ["too-long", "repetitive"])),
    ("aaaa-unique-phrase-x", PasswordOptions(), PasswordCheck(ok: false, failures: ["repetitive"])),
    ("my-1234-long-passphrase", PasswordOptions(), PasswordCheck(ok: false, failures: ["repetitive"])),
    ("zyxw-backwards-phrase!", PasswordOptions(), PasswordCheck(ok: false, failures: ["repetitive"])),
    ("alice-secret-passphrase", PasswordOptions(context: ["alice", "example"]), PasswordCheck(ok: false, failures: ["contains-context"])),
    ("tab\tinside-long-enough", PasswordOptions(), PasswordCheck(ok: false, failures: ["control-characters"])),
    ("ünïcödé-pässwörd-long", PasswordOptions(), PasswordCheck(ok: true, failures: [])),
    ("😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀", PasswordOptions(), PasswordCheck(ok: false, failures: ["repetitive"])),
    ("ABCD-upper-sequence-x", PasswordOptions(), PasswordCheck(ok: false, failures: ["repetitive"])),
]

private let sanitizeCases: [(String, SanitizeOptions, String)] = [
    ("plain text", SanitizeOptions(), "plain text"),
    ("line1\r\nline2\rline3", SanitizeOptions(), "line1\nline2\nline3"),
    ("zero\u{200B}width\u{FEFF}bom", SanitizeOptions(), "zerowidthbom"),
    ("tab\there\u{0}nul\u{7F}del\u{85}nel", SanitizeOptions(), "tab\therenuldelnel"),
    ("if (accessLevel != \"user\u{202E} \u{2066}// Check if admin\u{2069} \u{2066}\") {", SanitizeOptions(), "if (accessLevel != \"user // Check if admin \") {"),
    ("emoji 👍\u{1F3FD} and ZWJ 👨\u{200D}👩\u{200D}👧 family", SanitizeOptions(), "emoji 👍\u{1F3FD} and ZWJ 👨\u{200D}👩\u{200D}👧 family"),
    ("café e\u{301}", SanitizeOptions(), "café e\u{301}"),
    ("a\nb\r\nc", SanitizeOptions(allowNewlines: false), "a b c"),
    ("abcdef", SanitizeOptions(maxLength: 3), "abc"),
    ("😀😀😀", SanitizeOptions(maxLength: 2), "😀😀"),
]
private let bidiCases: [(String, [BidiControl])] = [
    ("plain text", []),
    ("line1\r\nline2\rline3", []),
    ("zero\u{200B}width\u{FEFF}bom", []),
    ("tab\there\u{0}nul\u{7F}del\u{85}nel", []),
    ("if (accessLevel != \"user\u{202E} \u{2066}// Check if admin\u{2069} \u{2066}\") {", [BidiControl(24, "202E"), BidiControl(26, "2066"), BidiControl(44, "2069"), BidiControl(46, "2066")]),
    ("emoji 👍\u{1F3FD} and ZWJ 👨\u{200D}👩\u{200D}👧 family", []),
    ("café e\u{301}", []),
]
private let whitespaceCases: [(String, String)] = [("  a   b\t\tc\n\nd  ", "a b c d"), ("", ""), (" \t\n ", ""), ("one", "one")]

private func hex(_ bytes: [UInt8]) -> String {
    let d = Array("0123456789abcdef".utf8)
    return String(decoding: bytes.flatMap { [d[Int($0 >> 4)], d[Int($0 & 15)]] }, as: UTF8.self)
}

private func unhex(_ text: String) -> [UInt8] {
    let b = Array(text.utf8)
    func v(_ c: UInt8) -> UInt8 { c <= 0x39 ? c - 0x30 : c - 0x57 }
    return stride(from: 0, to: b.count, by: 2).map { v(b[$0]) << 4 | v(b[$0 + 1]) }
}

/// Byte-exact string comparison (Swift String == ignores canonical-equivalence differences).
private func eqText(_ c: inout Checks, _ name: String, _ expected: String, _ actual: @autoclosure () throws -> String) {
    c.eq(name, Array(expected.utf8), Array(try actual().utf8))
}

private func hex64(_ v: UInt64) -> String {
    let s = String(v, radix: 16)
    return String(repeating: "0", count: 16 - s.count) + s
}

func runBaseEncodingsChecks(_ c: inout Checks) {
    for (input, padded, hexPadded, unpadded) in base32Vectors {
        let bytes = unhex(input)
        eqText(&c, "base32 \(input)", padded, BaseEncodings.base32Encode(bytes))
        eqText(&c, "base32 hex \(input)", hexPadded, BaseEncodings.base32Encode(bytes, alphabet: .hex))
        eqText(&c, "base32 unpadded \(input)", unpadded, BaseEncodings.base32Encode(bytes, padding: false))
        c.eq("base32 decode \(padded)", bytes, try BaseEncodings.base32Decode(padded))
        c.eq("base32 hex decode \(hexPadded)", bytes, try BaseEncodings.base32Decode(hexPadded, alphabet: .hex))
        c.eq("base32 unpadded decode \(unpadded)", bytes, try BaseEncodings.base32Decode(unpadded, padding: false))
    }
    for (text, want) in base32CaseInsensitive { c.eq("base32 case-insensitive \(text)", unhex(want), try BaseEncodings.base32Decode(text)) }
    for (text, padding) in base32Invalid {
        c.throwsError("base32 rejects \(text) padding=\(padding)", { _ = try BaseEncodings.base32Decode(text, padding: padding) },
                      where: { $0 is BaseEncodingError })
    }
    for (input, want) in base58Vectors {
        eqText(&c, "base58 \(input)", want, BaseEncodings.base58Encode(unhex(input)))
        c.eq("base58 decode \(want)", unhex(input), try BaseEncodings.base58Decode(want))
    }
    for bad in base58Invalid { c.throwsError("base58 rejects \(bad)", { _ = try BaseEncodings.base58Decode(bad) }, where: { $0 is BaseEncodingError }) }
    for (input, want) in base64UrlVectors {
        eqText(&c, "base64url \(input)", want, BaseEncodings.base64UrlEncode(unhex(input)))
        c.eq("base64url decode \(want)", unhex(input), try BaseEncodings.base64UrlDecode(want))
    }
    for bad in base64UrlInvalid {
        c.throwsError("base64url rejects \(bad)", { _ = try BaseEncodings.base64UrlDecode(bad) }, where: { $0 is BaseEncodingError })
    }
    let all = (0...255).map { UInt8($0) }
    c.eq("base58 round trip 0...255", all, try BaseEncodings.base58Decode(BaseEncodings.base58Encode(all)))
    c.eq("base64url round trip 0...255", all, try BaseEncodings.base64UrlDecode(BaseEncodings.base64UrlEncode(all)))
    c.eq("base32 hex round trip 0...255", all, try BaseEncodings.base32Decode(BaseEncodings.base32Encode(all, alphabet: .hex), alphabet: .hex))
    c.eq("hex helper", "00ff", hex([0, 255]))
}

func runVCardChecks(_ c: inout Checks) {
    for (contact, want) in vcardCases { eqText(&c, "buildVcard \(contact.fn)", want, try VCard.buildVcard(contact)) }
    for bad in vcardInvalid {
        c.throwsError("buildVcard rejects \(bad)", { _ = try VCard.buildVcard(bad) }, where: { $0 is VCardError })
    }
    c.throwsError("buildVcard rejects CR", { _ = try VCard.buildVcard(VCardContact(fn: "A", note: "x\ry")) }, where: { $0 is VCardError })
    c.throwsError("buildVcard rejects TYPE with space", { _ = try VCard.buildVcard(VCardContact(fn: "A", phones: [VCardValue("+1 555 0100", type: "a b")])) },
                  where: { $0 is VCardError })
}

func runHashingChecks(_ c: inout Checks) {
    for (s, crc, f32, f64, m0, m42) in hashStrings {
        let b = Array(s.utf8)
        c.eq("crc32 \(s)", crc, Hashing.crc32(b))
        c.eq("fnv1a32 \(s)", f32, Hashing.fnv1a32(b))
        c.eq("fnv1a64 \(s)", f64, hex64(Hashing.fnv1a64(b)))
        c.eq("murmur3_32 \(s)", m0, Hashing.murmur3_32(b))
        c.eq("murmur3_32 seed 42 \(s)", m42, Hashing.murmur3_32(s, seed: 42))
    }
    for (key, buckets, want) in jumpVectors { c.eq("jumpHash \(key) \(buckets)", want, try Hashing.jumpHash(key, buckets: buckets)) }
    for bad in [0, -1, 1 << 31] {
        c.throwsError("jumpHash rejects \(bad) buckets", { _ = try Hashing.jumpHash(1, buckets: bad) }, where: { $0 is HashingError })
    }
}

func runFeatureFlagsChecks(_ c: inout Checks) {
    for (flag, user, want) in flagCases { c.eq("evaluateFlag \(flag.key) \(user)", want, try FeatureFlags.evaluateFlag(flag, userId: user)) }
    for bad in flagInvalid {
        c.throwsError("evaluateFlag rejects \(bad)", { _ = try FeatureFlags.evaluateFlag(bad, userId: "u") }, where: { $0 is FeatureFlagError })
    }
    // Raising the percentage only adds users.
    var monotonic = true
    for i in 0..<200 {
        let low = try? FeatureFlags.evaluateFlag(FeatureFlag(key: "grow", rolloutPercent: 10), userId: "user-\(i)")
        let high = try? FeatureFlags.evaluateFlag(FeatureFlag(key: "grow", rolloutPercent: 30), userId: "user-\(i)")
        if low?.on == true && high?.on != true { monotonic = false }
    }
    c.check("evaluateFlag rollout is monotonic", monotonic)
    // Plain FNV-1a's low bit is the parity of the input bytes, so two 50/50 experiments with similar keys put every
    // subject in the same half of both. The fmix32 finalizer must keep them independent (chi-square < 10.83, p > 0.001).
    let ab = [FlagVariant("a", weight: 1), FlagVariant("b", weight: 1)]
    for (k1, k2) in [("checkout-a", "checkout-b"), ("exp1", "exp2")] {
        var parity: [[Double]] = [[0, 0], [0, 0]]
        var arms: [[Double]] = [[0, 0], [0, 0]]
        for i in 0..<10000 {
            let u = "u\(i)"
            guard let b1 = try? FeatureFlags.evaluateFlag(FeatureFlag(key: k1), userId: u),
                  let b2 = try? FeatureFlags.evaluateFlag(FeatureFlag(key: k2), userId: u),
                  let v1 = try? FeatureFlags.evaluateFlag(FeatureFlag(key: k1, variants: ab), userId: u),
                  let v2 = try? FeatureFlags.evaluateFlag(FeatureFlag(key: k2, variants: ab), userId: u) else { continue }
            parity[b1.bucket % 2][b2.bucket % 2] += 1
            arms[v1.variant == "b" ? 1 : 0][v2.variant == "b" ? 1 : 0] += 1
        }
        let cp = flagChiSquare2x2(parity), ca = flagChiSquare2x2(arms)
        c.check("evaluateFlag bucket parity \(k1)/\(k2) independent (chi-square \(cp))", cp < 10.83)
        c.check("evaluateFlag 50/50 variants \(k1)/\(k2) independent (chi-square \(ca))", ca < 10.83)
    }
    var counts = [Int](repeating: 0, count: 100)
    for i in 0..<10000 {
        if let r = try? FeatureFlags.evaluateFlag(FeatureFlag(key: "checkout-a"), userId: "u\(i)") { counts[r.bucket % 100] += 1 }
    }
    c.check("evaluateFlag 100 buckets each get 100 +/- 40 of 10000 subjects", counts.allSatisfy { abs($0 - 100) <= 40 })
}

/// Chi-square statistic of the 2x2 contingency table of two 0/1 assignments.
private func flagChiSquare2x2(_ t: [[Double]]) -> Double {
    let n = t[0][0] + t[0][1] + t[1][0] + t[1][1]
    var chi = 0.0
    for i in 0..<2 {
        for j in 0..<2 {
            let e = (t[i][0] + t[i][1]) * (t[0][j] + t[1][j]) / n
            chi += (t[i][j] - e) * (t[i][j] - e) / e
        }
    }
    return chi
}

func runHumanUnitsChecks(_ c: inout Checks) {
    for (n, base, decimals, want) in formatBytesVectors {
        eqText(&c, "formatBytes \(n) \(base) \(decimals)", want, try HumanUnits.formatBytes(n, base: base, decimals: decimals))
    }
    c.throwsError("formatBytes rejects negative", { _ = try HumanUnits.formatBytes(-1) }, where: { $0 is HumanUnitsError })
    c.throwsError("formatBytes rejects decimals 4", { _ = try HumanUnits.formatBytes(1, decimals: 4) }, where: { $0 is HumanUnitsError })
    for (text, want) in parseBytesVectors { c.eq("parseBytes \(text)", want, try HumanUnits.parseBytes(text)) }
    for bad in parseBytesInvalid { c.throwsError("parseBytes rejects \(bad)", { _ = try HumanUnits.parseBytes(bad) }, where: { $0 is HumanUnitsError }) }
    c.eq("parseBytes max", Int64.max, try HumanUnits.parseBytes("9223372036854775807"))
    c.throwsError("parseBytes rejects 2^63", { _ = try HumanUnits.parseBytes("9223372036854775808") }, where: { $0 is HumanUnitsError })
    c.eq("parseBytes long fraction", 1, try HumanUnits.parseBytes("0.50000000000000000000000000001 B"))
    for (ms, want) in durationVectors { eqText(&c, "formatDuration \(ms)", want, try HumanUnits.formatDuration(ms)) }
    c.throwsError("formatDuration rejects negative", { _ = try HumanUnits.formatDuration(-1) }, where: { $0 is HumanUnitsError })
    for (delta, want) in relativeVectors { eqText(&c, "relativeTime \(delta)", want, HumanUnits.relativeTime(delta)) }
}

func runPasswordPolicyChecks(_ c: inout Checks) {
    for (password, options, want) in passwordCases {
        c.eq("checkPassword \(password.debugDescription)", want, try PasswordPolicy.checkPassword(password, options))
    }
    c.throwsError("checkPassword rejects minLength 0", { _ = try PasswordPolicy.checkPassword("x", PasswordOptions(minLength: 0)) },
                  where: { $0 is PasswordPolicyError })
    c.throwsError("checkPassword rejects maxLength < minLength", { _ = try PasswordPolicy.checkPassword("x", PasswordOptions(minLength: 10, maxLength: 9)) },
                  where: { $0 is PasswordPolicyError })
}

func runTextSanitizeChecks(_ c: inout Checks) {
    for (text, options, want) in sanitizeCases { eqText(&c, "sanitizeText \(text.debugDescription)", want, TextSanitize.sanitizeText(text, options)) }
    for (text, want) in bidiCases { c.eq("findBidiControls \(text.debugDescription)", want, TextSanitize.findBidiControls(text)) }
    for (text, want) in whitespaceCases { eqText(&c, "normalizeWhitespace \(text.debugDescription)", want, TextSanitize.normalizeWhitespace(text)) }
}

func runWave7Checks(_ c: inout Checks) {
    runBaseEncodingsChecks(&c)
    runVCardChecks(&c)
    runHashingChecks(&c)
    runFeatureFlagsChecks(&c)
    runHumanUnitsChecks(&c)
    runPasswordPolicyChecks(&c)
    runTextSanitizeChecks(&c)
}
