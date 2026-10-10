// SPDX-License-Identifier: Apache-2.0
// Checks for ip-cidr, http-range, content-negotiation, http-conditional, cookies, url-normalize, string-similarity and
// rrule. Every vector comes from the shared wave 6 vector set (JSON null = nil).
import GenlibSwift

private let ipCanonical = [
        ("192.168.1.1", "192.168.1.1"),
        ("2001:DB8:0:0:0:0:0:1", "2001:db8::1"),
        ("2001:db8::0:1", "2001:db8::1"),
        ("::", "::"),
        ("::1", "::1"),
        ("2001:db8:0:0:1:0:0:1", "2001:db8::1:0:0:1"),
        ("2001:0db8:0000:0000:0000:ff00:0042:8329", "2001:db8::ff00:42:8329"),
        ("fe80::1:0:0:0", "fe80::1:0:0:0"),
        ("::ffff:192.0.2.128", "::ffff:192.0.2.128"),
        ("::ffff:c000:280", "::ffff:192.0.2.128"),
        ("1:0:0:2:0:0:0:3", "1:0:0:2::3"),
        ("64:ff9b::198.51.100.7", "64:ff9b::c633:6407"),
    ] as [(String, String)]
private let ipInvalid = ["256.1.1.1", "01.2.3.4", "1.2.3", "1.2.3.4.5", "1:2:3:4:5:6:7:8:9", "1::2::3", "::g", "fe80::1%eth0", "[::1]", "", " 1.2.3.4", "1.2.3.4/24", "12345::"]
private let ipContains = [
        ("10.0.0.0/8", "10.255.1.2", true),
        ("10.0.0.0/8", "11.0.0.1", false),
        ("192.168.1.0/24", "192.168.1.255", true),
        ("0.0.0.0/0", "8.8.8.8", true),
        ("2001:db8::/32", "2001:db8:ffff::1", true),
        ("2001:db8::/32", "2001:db9::1", false),
        ("10.0.0.0/8", "::ffff:10.0.0.1", false),
        ("::/0", "::1", true),
        ("192.168.1.1/32", "192.168.1.1", true),
    ] as [(String, String, Bool)]
private let ipInvalidCidr = ["10.0.0.1/8", "10.0.0.0/33", "10.0.0.0", "10.0.0.0/08", "2001:db8::/129"]
private let ipPublic = [
        ("8.8.8.8", true),
        ("10.1.2.3", false),
        ("127.0.0.1", false),
        ("169.254.169.254", false),
        ("100.64.0.1", false),
        ("172.31.255.255", false),
        ("172.32.0.1", true),
        ("192.168.0.10", false),
        ("0.0.0.0", false),
        ("255.255.255.255", false),
        ("224.0.0.1", false),
        ("2606:4700:4700::1111", true),
        ("::1", false),
        ("fd00::1", false),
        ("fe80::1", false),
        ("::ffff:127.0.0.1", false),
        ("::ffff:8.8.8.8", true),
        ("64:ff9b::a00:1", false),
        ("2001:db8::1", false),
        ("ff02::1", false),
    ] as [(String, Bool)]
private let rangeSize: Int64 = 10000
private let rangeCases = [
        ("bytes=0-499", RangeResult.ranges([ByteRange(0, 499)])),
        ("bytes=500-999", RangeResult.ranges([ByteRange(500, 999)])),
        ("bytes=-500", RangeResult.ranges([ByteRange(9500, 9999)])),
        ("bytes=9500-", RangeResult.ranges([ByteRange(9500, 9999)])),
        ("bytes=0-0,-1", RangeResult.ranges([ByteRange(0, 0), ByteRange(9999, 9999)])),
        ("bytes= 0-1 , 5-6", RangeResult.ranges([ByteRange(0, 1), ByteRange(5, 6)])),
        ("BYTES=0-99", RangeResult.ranges([ByteRange(0, 99)])),
        ("bytes=9999-20000", RangeResult.ranges([ByteRange(9999, 9999)])),
        ("bytes=10000-", RangeResult.unsatisfiable(contentRange: "bytes */10000")),
        ("bytes=-0", RangeResult.unsatisfiable(contentRange: "bytes */10000")),
        ("bytes=-20000", RangeResult.ranges([ByteRange(0, 9999)])),
        ("bytes=500-400", RangeResult.none),
        ("items=0-1", RangeResult.none),
        ("bytes=", RangeResult.none),
        ("bytes=0-1,", RangeResult.none),
        ("bytes=abc", RangeResult.none),
        ("bytes=1-2-3", RangeResult.none),
        (nil, RangeResult.none),
        ("bytes=10000-10001,20000-", RangeResult.unsatisfiable(contentRange: "bytes */10000")),
    ] as [(String?, RangeResult)]
private let rangeEmptyFile = [
        ("bytes=0-", RangeResult.unsatisfiable(contentRange: "bytes */0")),
        ("bytes=-5", RangeResult.unsatisfiable(contentRange: "bytes */0")),
    ] as [(String?, RangeResult)]
private let rangeContentRange = [
        (0, 499, 10000, "bytes 0-499/10000"),
    ] as [(Int64, Int64, Int64, String)]
private let mediaAvailable = ["application/json", "text/html", "text/csv"]
private let mediaCases = [
        ("application/json", "application/json"),
        ("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "text/html"),
        ("text/*;q=0.5, application/json;q=0.4", "text/html"),
        ("*/*", "application/json"),
        ("text/csv;q=0, text/*", "text/html"),
        ("image/png", nil),
        ("application/json;q=0", nil),
        ("TEXT/HTML", "text/html"),
        ("text/html;q=1.5, text/csv", "text/csv"),
        (nil, "application/json"),
        ("", "application/json"),
        ("application/*;q=0.2, */*;q=0.1", "application/json"),
        ("text/html;level=1;q=0.7, text/csv;q=0.7", "text/html"),
    ] as [(String?, String?)]
private let languageAvailable = ["en", "en-GB", "fr", "pt-BR"]
private let languageCases = [
        ("fr-CH, fr;q=0.9, en;q=0.8, de;q=0.7, *;q=0.5", "fr"),
        ("en-GB", "en-GB"),
        ("en-US,en;q=0.9", "en"),
        ("pt", "pt-BR"),
        ("de", nil),
        ("de, *;q=0.1", "en"),
        ("en;q=0, *", "fr"),
        ("PT-br", "pt-BR"),
        (nil, "en"),
        ("zh-Hant-TW", nil),
    ] as [(String?, String?)]
private let conditionalCases = [
        (ConditionalRequest(method: "GET", etag: "\"v2\"", ifNoneMatch: "\"v2\""), 304),
        (ConditionalRequest(method: "GET", etag: "\"v2\"", ifNoneMatch: "W/\"v2\""), 304),
        (ConditionalRequest(method: "GET", etag: "W/\"v2\"", ifNoneMatch: "\"v1\", \"v2\""), 304),
        (ConditionalRequest(method: "GET", etag: "\"v2\"", ifNoneMatch: "\"v1\""), 200),
        (ConditionalRequest(method: "HEAD", etag: "\"v2\"", ifNoneMatch: "*"), 304),
        (ConditionalRequest(method: "PUT", etag: "\"v2\"", ifNoneMatch: "*"), 412),
        (ConditionalRequest(method: "PUT", ifNoneMatch: "*"), 200),
        (ConditionalRequest(method: "PUT", etag: "\"v2\"", ifMatch: "\"v2\""), 200),
        (ConditionalRequest(method: "PUT", etag: "\"v2\"", ifMatch: "\"v1\""), 412),
        (ConditionalRequest(method: "PUT", etag: "W/\"v2\"", ifMatch: "W/\"v2\""), 412),
        (ConditionalRequest(method: "DELETE", ifMatch: "*"), 412),
        (ConditionalRequest(method: "DELETE", etag: "\"a\"", ifMatch: "*"), 200),
        (ConditionalRequest(method: "GET", etag: "\"v2\"", lastModified: 1792567680, ifModifiedSince: "Wed, 21 Oct 2026 07:28:00 GMT"), 304),
        (ConditionalRequest(method: "GET", etag: "\"v2\"", lastModified: 1792567680, ifModifiedSince: "Tue, 20 Oct 2026 07:28:00 GMT"), 200),
        (ConditionalRequest(method: "GET", etag: "\"v2\"", lastModified: 1792567680, ifNoneMatch: "\"v1\"", ifModifiedSince: "Wed, 21 Oct 2026 07:28:00 GMT"), 200),
        (ConditionalRequest(method: "POST", lastModified: 1792567680, ifModifiedSince: "Wed, 21 Oct 2026 07:28:00 GMT"), 200),
        (ConditionalRequest(method: "PUT", lastModified: 1792567680, ifUnmodifiedSince: "Tue, 20 Oct 2026 07:28:00 GMT"), 412),
        (ConditionalRequest(method: "PUT", lastModified: 1792567680, ifUnmodifiedSince: "Wed, 21 Oct 2026 07:28:00 GMT"), 200),
        (ConditionalRequest(method: "GET", lastModified: 1792567680, ifModifiedSince: "Wednesday, 21-Oct-26 07:28:00 GMT"), 200),
        (ConditionalRequest(method: "GET", etag: "\"v2\"", ifNoneMatch: "v2"), 200),
        (ConditionalRequest(method: "PUT", etag: "\"v2\"", ifMatch: "\"v2\"", ifUnmodifiedSince: "Tue, 20 Oct 2026 07:28:00 GMT"), 200),
    ] as [(ConditionalRequest, Int)]
private let etagParse = [
        ("\"a\", W/\"b\" ,\"c\"", EtagList.tags(["\"a\"", "W/\"b\"", "\"c\""])),
        ("*", EtagList.any),
        (" * ", EtagList.any),
        ("W/\"x\", bogus, \"y\"", EtagList.tags(["W/\"x\"", "\"y\""])),
        ("\"\"", EtagList.tags(["\"\""])),
    ] as [(String, EtagList)]
private let cookieSerialize = [
        ("sid", "abc123", CookieOptions(path: "/", secure: true, httpOnly: true, sameSite: "Lax"), "sid=abc123; Path=/; Secure; HttpOnly; SameSite=Lax"),
        ("__Host-session", "x.y.z", CookieOptions(maxAge: 3600, path: "/", secure: true, httpOnly: true, sameSite: "Strict"), "__Host-session=x.y.z; Max-Age=3600; Path=/; Secure; HttpOnly; SameSite=Strict"),
        ("theme", "dark", CookieOptions(maxAge: 0, expires: 1792567680, domain: "Example.COM", path: "/app"), "theme=dark; Max-Age=0; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Domain=example.com; Path=/app"),
        ("embed", "1", CookieOptions(secure: true, sameSite: "None", partitioned: true), "embed=1; Secure; SameSite=None; Partitioned"),
        ("empty", "", CookieOptions(), "empty="),
    ] as [(String, String, CookieOptions, String)]
private let cookieInvalid = [
        ("bad name", "v", CookieOptions()),
        ("n", "a;b", CookieOptions()),
        ("n", "a b", CookieOptions()),
        ("n", "a\"b", CookieOptions()),
        ("n", "v", CookieOptions(sameSite: "None")),
        ("__Secure-x", "v", CookieOptions()),
        ("__Host-x", "v", CookieOptions(path: "/a", secure: true)),
        ("__Host-x", "v", CookieOptions(domain: "example.com", path: "/", secure: true)),
        ("n", "v", CookieOptions(path: "relative")),
        ("n", "v", CookieOptions(sameSite: "lax")),
        ("n", "v", CookieOptions(partitioned: true)),
        ("n", "v", CookieOptions(maxAge: -1)),
        ("", "v", CookieOptions()),
    ] as [(String, String, CookieOptions)]
private let cookieParse = [
        ("sid=abc; theme=dark", [["sid", "abc"], ["theme", "dark"]]),
        (" a = 1 ;b=2;; c=\"quoted value\" ;flag;d==x", [["a", "1"], ["b", "2"], ["c", "quoted value"], ["d", "=x"]]),
        ("a=1; a=2", [["a", "1"], ["a", "2"]]),
        ("", []),
    ] as [(String, [[String]])]
private let dotSegments = [
        ("/a/b/c/./../../g", "/a/g"),
        ("mid/content=5/../6", "mid/6"),
        ("/../a", "/a"),
        ("/a/./b/.", "/a/b/"),
        ("/a/b/..", "/a/"),
        (".", ""),
        ("../x", "x"),
        ("/a//b/../c", "/a//c"),
    ] as [(String, String)]
private let urlNormalize = [
        ("HTTP://Example.COM:80/%7Euser/./a/../b?q=%2f", "http://example.com/~user/b?q=%2F"),
        ("https://example.com", "https://example.com/"),
        ("https://example.com:443/a%2Fb#frag", "https://example.com/a%2Fb"),
        ("http://example.com:8080/A/B/../C?", "http://example.com:8080/A/C"),
        ("https://[2001:DB8::0:1]:8443/x", "https://[2001:db8::1]:8443/x"),
        ("https://example.com/%e2%82%ac", "https://example.com/%E2%82%AC"),
        ("http://example.com:/p", "http://example.com/p"),
        ("https://EXAMPLE.com/a%20b", "https://example.com/a%20b"),
    ] as [(String, String)]
private let urlInvalid = ["ftp://example.com/", "https://user@example.com/", "https://exa mple.com/", "//example.com/", "https://example.com/%zz", "https://example.com:99999/", "example.com/path", "https://[::g]/"]
private let similarityPairs = [
        ("kitten", "sitting", 3, 3, 0.746031746031746, 0.746031746031746, 0.5714285714285714),
        ("flaw", "lawn", 2, 2, 0.8333333333333334, 0.8333333333333334, 0.5),
        ("", "", 0, 0, 1.0, 1.0, 1.0),
        ("", "abc", 3, 3, 0.0, 0.0, 0.0),
        ("abc", "abc", 0, 0, 1.0, 1.0, 1.0),
        ("ca", "abc", 3, 3, 0.0, 0.0, 0.0),
        ("MARTHA", "MARHTA", 2, 1, 0.9444444444444445, 0.9611111111111111, 0.6666666666666667),
        ("DIXON", "DICKSONX", 4, 4, 0.7666666666666666, 0.8133333333333332, 0.5),
        ("DWAYNE", "DUANE", 2, 2, 0.8222222222222223, 0.8400000000000001, 0.6666666666666667),
        ("café", "cafe", 1, 1, 0.8333333333333334, 0.8833333333333334, 0.75),
        ("naïve", "naive", 1, 1, 0.8666666666666667, 0.8933333333333333, 0.8),
        ("🙂ab", "ab🙂", 2, 2, 0.0, 0.0, 0.33333333333333337),
        ("JELLYFISH", "SMELLYFISH", 2, 2, 0.8962962962962964, 0.8962962962962964, 0.8),
    ] as [(String, String, Int, Int, Double, Double, Double)]
private let rruleCases = [
        ("2026-01-31T09:00:00Z", "FREQ=MONTHLY;COUNT=5", ["2026-01-31T09:00:00Z", "2026-03-31T09:00:00Z", "2026-05-31T09:00:00Z", "2026-07-31T09:00:00Z", "2026-08-31T09:00:00Z"]),
        ("2026-10-12T09:30:00Z", "FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=7", ["2026-10-12T09:30:00Z", "2026-10-14T09:30:00Z", "2026-10-16T09:30:00Z", "2026-10-19T09:30:00Z", "2026-10-21T09:30:00Z", "2026-10-23T09:30:00Z", "2026-10-26T09:30:00Z"]),
        ("2026-10-01T00:00:00Z", "FREQ=DAILY;INTERVAL=10;UNTIL=20261115T000000Z", ["2026-10-01T00:00:00Z", "2026-10-11T00:00:00Z", "2026-10-21T00:00:00Z", "2026-10-31T00:00:00Z", "2026-11-10T00:00:00Z"]),
        ("2026-01-01T12:00:00Z", "FREQ=MONTHLY;BYDAY=-1FR;COUNT=4", ["2026-01-30T12:00:00Z", "2026-02-27T12:00:00Z", "2026-03-27T12:00:00Z", "2026-04-24T12:00:00Z"]),
        ("2026-01-01T12:00:00Z", "FREQ=MONTHLY;BYDAY=2TU,4TU;COUNT=6", ["2026-01-13T12:00:00Z", "2026-01-27T12:00:00Z", "2026-02-10T12:00:00Z", "2026-02-24T12:00:00Z", "2026-03-10T12:00:00Z", "2026-03-24T12:00:00Z"]),
        ("2026-01-15T08:00:00Z", "FREQ=MONTHLY;BYMONTHDAY=1,-1;COUNT=6", ["2026-01-31T08:00:00Z", "2026-02-01T08:00:00Z", "2026-02-28T08:00:00Z", "2026-03-01T08:00:00Z", "2026-03-31T08:00:00Z", "2026-04-01T08:00:00Z"]),
        ("2028-02-29T00:00:00Z", "FREQ=YEARLY;COUNT=3", ["2028-02-29T00:00:00Z", "2032-02-29T00:00:00Z", "2036-02-29T00:00:00Z"]),
        ("2026-03-10T10:00:00Z", "FREQ=YEARLY;BYMONTH=3,9;COUNT=5", ["2026-03-10T10:00:00Z", "2026-09-10T10:00:00Z", "2027-03-10T10:00:00Z", "2027-09-10T10:00:00Z", "2028-03-10T10:00:00Z"]),
        ("2026-10-14T18:00:00Z", "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU;COUNT=3", ["2026-10-27T18:00:00Z", "2026-11-10T18:00:00Z", "2026-11-24T18:00:00Z"]),
        ("2026-10-14T18:00:00Z", "FREQ=WEEKLY;COUNT=2", ["2026-10-14T18:00:00Z", "2026-10-21T18:00:00Z"]),
        ("2026-01-31T09:00:00Z", "FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=31;UNTIL=20261231T235959Z", ["2026-01-31T09:00:00Z", "2026-03-31T09:00:00Z", "2026-05-31T09:00:00Z", "2026-07-31T09:00:00Z"]),
    ] as [(String, String, [String])]
private let rruleInvalid = ["FREQ=HOURLY", "COUNT=3", "FREQ=DAILY;COUNT=2;UNTIL=20261231T000000Z", "FREQ=WEEKLY;BYDAY=1MO", "FREQ=DAILY;BYDAY=MO", "FREQ=MONTHLY;BYMONTHDAY=32", "FREQ=MONTHLY;BYSETPOS=1", "FREQ=WEEKLY;INTERVAL=0", "FREQ=MONTHLY;BYDAY=MO;BYMONTHDAY=1", "FREQ=YEARLY;UNTIL=2026-12-31", "FREQ=DAILY;FREQ=DAILY", "FREQ=WEEKLY;BYDAY=XX"]

func runIpCidrChecks(_ c: inout Checks) {
    for (input, want) in ipCanonical { c.eq("canonicalIp \(input)", want, try IpCidr.canonicalIp(input)) }
    c.eq("parseIp v4 bytes", [192, 168, 1, 1], try IpCidr.parseIp("192.168.1.1"))
    c.eq("parseIp v6 length", 16, try IpCidr.parseIp("::1").count)
    for bad in ipInvalid {
        c.throwsError("parseIp rejects \(bad.debugDescription)", { _ = try IpCidr.parseIp(bad) }, where: { $0 is IpCidrError })
    }
    for (cidr, ip, want) in ipContains { c.eq("cidrContains \(cidr) \(ip)", want, try IpCidr.cidrContains(cidr, ip)) }
    for bad in ipInvalidCidr {
        c.throwsError("cidrContains rejects \(bad)", { _ = try IpCidr.cidrContains(bad, "10.0.0.1") }, where: { $0 is IpCidrError })
    }
    for (ip, want) in ipPublic { c.eq("isPublicIp \(ip)", want, try IpCidr.isPublicIp(ip)) }
}

func runHttpRangeChecks(_ c: inout Checks) {
    for (header, want) in rangeCases { c.eq("parseRange \(header ?? "nil")", want, HttpRange.parseRange(header, size: rangeSize)) }
    for (header, want) in rangeEmptyFile { c.eq("parseRange empty file \(header ?? "nil")", want, HttpRange.parseRange(header, size: 0)) }
    for (a, b, size, want) in rangeContentRange { c.eq("contentRange \(a)-\(b)/\(size)", want, HttpRange.contentRange(a, b, size)) }
    c.eq("parseRange 64-bit size", RangeResult.ranges([ByteRange(5_000_000_000, 5_999_999_999)]),
         HttpRange.parseRange("bytes=-1000000000", size: 6_000_000_000))
    c.eq("parseRange huge first is past the end", RangeResult.unsatisfiable(contentRange: "bytes */10"),
         HttpRange.parseRange("bytes=99999999999999999999999-", size: 10))
    c.eq("parseRange more than 100 specs", RangeResult.none,
         HttpRange.parseRange("bytes=" + Array(repeating: "0-0", count: 101).joined(separator: ","), size: 10))
}

func runContentNegotiationChecks(_ c: inout Checks) {
    for (header, want) in mediaCases {
        c.eq("negotiateMediaType \(header ?? "nil")", want, ContentNegotiation.negotiateMediaType(header, mediaAvailable))
    }
    for (header, want) in languageCases {
        c.eq("negotiateLanguage \(header ?? "nil")", want, ContentNegotiation.negotiateLanguage(header, languageAvailable))
    }
    c.eq("negotiateMediaType empty available", nil, ContentNegotiation.negotiateMediaType(nil, []))
}

func runHttpConditionalChecks(_ c: inout Checks) {
    for (header, want) in etagParse { c.eq("parseEtags \(header)", want, HttpConditional.parseEtags(header)) }
    for (i, (request, want)) in conditionalCases.enumerated() {
        c.eq("evaluateConditional case \(i) \(request.method)", want, HttpConditional.evaluateConditional(request))
    }
    c.eq("http date round trip", 1_792_567_680, HttpConditional.parseHttpDate("Wed, 21 Oct 2026 07:28:00 GMT"))
    c.eq("http date wrong weekday", nil, HttpConditional.parseHttpDate("Thu, 21 Oct 2026 07:28:00 GMT"))
    c.eq("http date format", "Wed, 21 Oct 2026 07:28:00 GMT", HttpConditional.formatHttpDate(1_792_567_680))
}

func runCookiesChecks(_ c: inout Checks) {
    for (name, value, options, want) in cookieSerialize {
        c.eq("serializeCookie \(name)", want, try Cookies.serializeCookie(name, value, options))
    }
    for (i, (name, value, options)) in cookieInvalid.enumerated() {
        c.throwsError("serializeCookie rejects case \(i) \(name.debugDescription)", { _ = try Cookies.serializeCookie(name, value, options) },
                      where: { $0 is CookieError })
    }
    for (header, want) in cookieParse {
        c.eq("parseCookieHeader \(header.debugDescription)", want, Cookies.parseCookieHeader(header).map { [$0.0, $0.1] })
    }
}

func runUrlNormalizeChecks(_ c: inout Checks) {
    for (path, want) in dotSegments { c.eq("removeDotSegments \(path)", want, UrlNormalize.removeDotSegments(path)) }
    for (url, want) in urlNormalize { c.eq("normalizeUrl \(url)", want, try UrlNormalize.normalizeUrl(url)) }
    for bad in urlInvalid {
        c.throwsError("normalizeUrl rejects \(bad.debugDescription)", { _ = try UrlNormalize.normalizeUrl(bad) },
                      where: { $0 is UrlNormalizeError })
    }
}

func runStringSimilarityChecks(_ c: inout Checks) {
    func near(_ a: Double, _ b: Double) -> Bool { abs(a - b) <= 1e-12 }
    for (a, b, lev, osa, jaro, jw, ratio) in similarityPairs {
        let label = "\(a.debugDescription) vs \(b.debugDescription)"
        c.eq("levenshtein \(label)", lev, StringSimilarity.levenshtein(a, b))
        c.eq("damerauOsa \(label)", osa, StringSimilarity.damerauOsa(a, b))
        c.check("jaro \(label)", near(jaro, StringSimilarity.jaro(a, b)))
        c.check("jaroWinkler \(label)", near(jw, StringSimilarity.jaroWinkler(a, b)))
        c.check("similarityRatio \(label)", near(ratio, StringSimilarity.similarityRatio(a, b)))
    }
}

func runRRuleChecks(_ c: inout Checks) {
    for (start, rule, want) in rruleCases { c.eq("expandRRule \(start) \(rule)", want, try RRule.expandRRule(start, rule)) }
    for bad in rruleInvalid {
        c.throwsError("expandRRule rejects \(bad)", { _ = try RRule.expandRRule("2026-01-01T00:00:00Z", bad) }, where: { $0 is RRuleError })
    }
    c.eq("expandRRule limit", 3, try RRule.expandRRule("2026-01-01T00:00:00Z", "FREQ=DAILY", limit: 3).count)
    c.eq("expandRRule default limit 50", 50, try RRule.expandRRule("2026-01-01T00:00:00Z", "FREQ=DAILY").count)
    for limit in [0, 1001] {
        c.throwsError("expandRRule rejects limit \(limit)", { _ = try RRule.expandRRule("2026-01-01T00:00:00Z", "FREQ=DAILY", limit: limit) },
                      where: { $0 is RRuleError })
    }
    for bad in ["2026-01-01 00:00:00Z", "2026-02-30T00:00:00Z", "2026-01-01T00:00:00"] {
        c.throwsError("expandRRule rejects dtstart \(bad)", { _ = try RRule.expandRRule(bad, "FREQ=DAILY") }, where: { $0 is RRuleError })
    }
}
