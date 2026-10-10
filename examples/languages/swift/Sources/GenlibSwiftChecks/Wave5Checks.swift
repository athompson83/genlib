// SPDX-License-Identifier: Apache-2.0
// Checks for check-digits, signed-urls, polyline, tile-math, email-address, iso-duration, geometry and safe-redirect.
#if canImport(Glibc)
import Glibc
#elseif canImport(Darwin)
import Darwin
#endif
import GenlibSwift

private func close(_ a: Double, _ b: Double, _ tol: Double) -> Bool { abs(a - b) <= tol }

func runCheckDigitsChecks(_ c: inout Checks) {
    for (s, want) in [("4539 1488 0343 6467", true), ("79927398713", true), ("79927398710", false), ("0", false),
                      ("4539-1488-0343-6468", false), ("12a4", false), ("", false)] {
        c.eq("luhn \(s.debugDescription)", want, CheckDigits.luhnValid(s))
    }
    c.eq("luhn check digit 7992739871", "3", try CheckDigits.luhnCheckDigit("7992739871"))
    c.eq("luhn check digit 453914880343646", "7", try CheckDigits.luhnCheckDigit("453914880343646"))
    for bad in ["", "12a", "- "] { c.throwsError("luhn check digit rejects \(bad.debugDescription)", { _ = try CheckDigits.luhnCheckDigit(bad) }) }
    for (s, want) in [("GB82 WEST 1234 5698 7654 32", true), ("DE89 3704 0044 0532 0130 00", true), ("gb82west12345698765432", true),
                      ("GB82 WEST 1234 5698 7654 33", false), ("GB82-WEST", false), ("NO9386011117947", true), ("XX00", false)] {
        c.eq("iban \(s)", want, CheckDigits.ibanValid(s))
    }
    c.eq("iban format gb", "GB82 WEST 1234 5698 7654 32", try CheckDigits.ibanFormat("gb82west12345698765432"))
    c.eq("iban format no", "NO93 8601 1117 947", try CheckDigits.ibanFormat("NO9386011117947"))
    c.throwsError("iban format rejects invalid", { _ = try CheckDigits.ibanFormat("GB82 WEST 1234 5698 7654 33") },
                  where: { $0 is CheckDigitError })
    for (s, want) in [("4006381333931", true), ("036000291452", true), ("96385074", true), ("10614141000415", true),
                      ("4006381333932", false), ("12345", false)] {
        c.eq("gtin \(s)", want, CheckDigits.gtinValid(s))
    }
    for (s, want) in [("0-306-40615-2", true), ("0-8044-2957-X", true), ("0-306-40615-3", false), ("030640615", false)] {
        c.eq("isbn10 \(s)", want, CheckDigits.isbn10Valid(s))
    }
    c.eq("isbn10 lowercase x", true, CheckDigits.isbn10Valid("0-8044-2957-x"))
    for (s, want) in [("978-0-306-40615-7", true), ("979-10-90636-07-1", true), ("978-0-306-40615-8", false), ("4006381333931", false)] {
        c.eq("isbn13 \(s)", want, CheckDigits.isbn13Valid(s))
    }
    c.eq("isbn10 to 13 a", "9780306406157", try CheckDigits.isbn10To13("0-306-40615-2"))
    c.eq("isbn10 to 13 b", "9780804429573", try CheckDigits.isbn10To13("080442957X"))
    c.throwsError("isbn10 to 13 rejects invalid", { _ = try CheckDigits.isbn10To13("0-306-40615-3") }, where: { $0 is CheckDigitError })
}

func runSignedUrlsChecks(_ c: inout Checks) {
    let secret = "url-signing-secret"
    let cases: [(String, UInt64, String)] = [
        ("/files/report.pdf?user=42", 1_790_000_000,
         "/files/report.pdf?user=42&expires=1790000000&signature=OBOJTlNq3AuDbND_6J4njKkDIXDMxhx0l0PmWaRbfaU"),
        ("/download/a%20b.zip", 1_790_003_600,
         "/download/a%20b.zip?expires=1790003600&signature=SafK5ZH-apLeaJ-c1dhzp-kyiS3doOR7ywgvr8WDJOo"),
    ]
    func fails(_ name: String, _ expected: SignedUrlError, _ body: () throws -> Void) {
        c.throwsError(name, body, where: { ($0 as? SignedUrlError) == expected })
    }
    func malformed(_ name: String, _ body: () throws -> Void) {
        c.throwsError(name, body, where: { if case .malformed = ($0 as? SignedUrlError) { return true } else { return false } })
    }
    for (target, expires, signed) in cases {
        c.eq("sign \(target)", signed, try SignedUrls.signUrl(target, secret: secret, expiresUnixSeconds: expires))
        c.check("verify \(target) at expires", (try? SignedUrls.verifyUrl(signed, secret: secret, nowUnixSeconds: expires)) != nil)
        fails("verify \(target) expired at expires+1", .expired) { try SignedUrls.verifyUrl(signed, secret: secret, nowUnixSeconds: expires + 1) }
        let path = "/X" + String(signed.dropFirst(2))
        fails("verify \(target) path changed", .badSignature) { try SignedUrls.verifyUrl(path, secret: secret, nowUnixSeconds: expires) }
        fails("verify \(target) other secret", .badSignature) { try SignedUrls.verifyUrl(signed, secret: "other", nowUnixSeconds: expires) }
        let flipped = String(signed.dropLast()) + (signed.hasSuffix("A") ? "B" : "A")
        fails("verify \(target) signature char changed", .badSignature) {
            try SignedUrls.verifyUrl(flipped, secret: secret, nowUnixSeconds: expires)
        }
    }
    let signed = cases[0].2, sig = String(signed.suffix(43))
    malformed("verify missing signature") { try SignedUrls.verifyUrl("/files/report.pdf?user=42&expires=1790000000", secret: secret, nowUnixSeconds: 0) }
    malformed("verify duplicate expires") {
        try SignedUrls.verifyUrl("/files/report.pdf?user=42&expires=1790000000&expires=1790000000&signature=" + sig, secret: secret, nowUnixSeconds: 0)
    }
    malformed("verify non-decimal expires") {
        try SignedUrls.verifyUrl("/files/report.pdf?user=42&expires=17900000x0&signature=" + sig, secret: secret, nowUnixSeconds: 0)
    }
    malformed("verify short signature") { try SignedUrls.verifyUrl(String(signed.dropLast()), secret: secret, nowUnixSeconds: 0) }
    malformed("verify trailing data") { try SignedUrls.verifyUrl(signed + "&x=1", secret: secret, nowUnixSeconds: 0) }
    for bad in ["files", "/a#b", "/a?expires=1", "/a?x=1&signature=2"] {
        c.throwsError("sign rejects \(bad)", { _ = try SignedUrls.signUrl(bad, secret: secret, expiresUnixSeconds: 1) },
                      where: { if case .invalidArgument = ($0 as? SignedUrlError) { return true } else { return false } })
    }
    c.throwsError("sign empty secret", { _ = try SignedUrls.signUrl("/a", secret: "", expiresUnixSeconds: 1) })
}

func runPolylineChecks(_ c: inout Checks) {
    func same(_ a: [(lat: Double, lon: Double)], _ b: [(lat: Double, lon: Double)], _ tol: Double) -> Bool {
        a.count == b.count && zip(a, b).allSatisfy { close($0.0.lat, $0.1.lat, tol) && close($0.0.lon, $0.1.lon, tol) }
    }
    let google: [(lat: Double, lon: Double)] = [(38.5, -120.2), (40.7, -120.95), (43.252, -126.453)]
    let p6: [(lat: Double, lon: Double)] = [(47.6062, -122.3321), (47.6205, -122.3493)]
    c.eq("polyline encode google", "_p~iF~ps|U_ulLnnqC_mqNvxq`@", try Polyline.encodePolyline(google))
    c.check("polyline decode google", same((try? Polyline.decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")) ?? [], google, 1e-9))
    c.eq("polyline encode precision 6", "ozsxyAf{pihFw|Z~q`@", try Polyline.encodePolyline(p6, precision: 6))
    c.check("polyline decode precision 6", same((try? Polyline.decodePolyline("ozsxyAf{pihFw|Z~q`@", precision: 6)) ?? [], p6, 1e-9))
    c.eq("polyline encode empty", "", try Polyline.encodePolyline([]))
    c.check("polyline decode empty", (try? Polyline.decodePolyline(""))?.isEmpty == true)
    let odd: [(lat: Double, lon: Double)] = [(0.000004, -0.000006), (-89.999995, 179.999995), (12.345675, -12.345675)]
    for precision in [5, 6] {
        let back = (try? Polyline.decodePolyline(try Polyline.encodePolyline(odd, precision: precision), precision: precision)) ?? []
        c.check("polyline round trip precision \(precision)", same(back, odd, 0.5 * pow(10, -Double(precision)) + 1e-12))
    }
    for bad in ["_p~iF~ps|U_", "_p~iF", "_p~iF~ps|U ", "\u{7f}?"] {
        c.throwsError("polyline decode rejects \(bad.debugDescription)", { _ = try Polyline.decodePolyline(bad) }, where: { $0 is PolylineError })
    }
    c.throwsError("polyline encode NaN", { _ = try Polyline.encodePolyline([(.nan, 0)]) })
    c.throwsError("polyline precision 11", { _ = try Polyline.encodePolyline([], precision: 11) })
}

func runTileMathChecks(_ c: inout Checks) {
    for (lon, lat, z, x, y) in [(-122.4194, 37.7749, 12, 655, 1583), (0, 0, 0, 0, 0), (2.3522, 48.8566, 15, 16598, 11273),
                                (179.9999, -89.9, 3, 7, 7), (-180, 85.1, 2, 0, 0)] as [(Double, Double, Int, Int, Int)] {
        c.eq("tile \(lon),\(lat) z\(z)", Tile(x: x, y: y, zoom: z), try TileMath.lonLatToTile(lon, lat, zoom: z))
    }
    let bounds: [(Int, Int, Int, [Double])] = [
        (0, 0, 0, [-180.0, -85.0511287798066, 180.0, 85.0511287798066]),
        (655, 1583, 12, [-122.431640625, 37.718590325588146, -122.34375, 37.78808138412046]),
        (1, 1, 1, [0.0, -85.0511287798066, 180.0, 0.0]),
    ]
    for (x, y, z, want) in bounds {
        if let b = try? TileMath.tileBounds(x: x, y: y, zoom: z) {
            c.check("tile bounds \(x)/\(y)/\(z)", zip([b.west, b.south, b.east, b.north], want).allSatisfy { close($0, $1, 1e-9) })
        } else {
            c.check("tile bounds \(x)/\(y)/\(z)", false)
        }
    }
    for (x, y, z, key) in [(3, 5, 3, "213"), (655, 1583, 12, "023010203333"), (0, 0, 1, "0")] {
        c.eq("quadkey \(x)/\(y)/\(z)", key, try TileMath.tileToQuadkey(x: x, y: y, zoom: z))
        c.eq("quadkey to tile \(key)", Tile(x: x, y: y, zoom: z), try TileMath.quadkeyToTile(key))
    }
    c.eq("quadkey empty is zoom 0", Tile(x: 0, y: 0, zoom: 0), try TileMath.quadkeyToTile(""))
    c.eq("quadkey zoom 0", "", try TileMath.tileToQuadkey(x: 0, y: 0, zoom: 0))
    let merc: [(Double, Double, Double, Double)] = [
        (0, 0, 0.0, -7.081154551613622e-10), (-122.4194, 37.7749, -13627665.271218073, 4547675.354340557),
        (180, 85.05112877980659, 20037508.342789244, 20037508.342789244),
    ]
    for (lon, lat, x, y) in merc {
        let p = try? TileMath.lonLatToMercator(lon, lat)
        c.check("mercator \(lon),\(lat)", p.map { close($0.x, x, 1e-6) && close($0.y, y, 1e-6) } ?? false)
    }
    c.throwsError("tile zoom 25", { _ = try TileMath.lonLatToTile(0, 0, zoom: 25) }, where: { $0 is TileMathError })
    c.throwsError("tile zoom -1", { _ = try TileMath.lonLatToTile(0, 0, zoom: -1) })
    c.throwsError("tile lon 181", { _ = try TileMath.lonLatToTile(181, 0, zoom: 1) })
    c.throwsError("tile NaN", { _ = try TileMath.lonLatToTile(0, .nan, zoom: 1) })
    c.throwsError("tile bounds x out of range", { _ = try TileMath.tileBounds(x: 2, y: 0, zoom: 1) })
    c.throwsError("tile bounds y negative", { _ = try TileMath.tileBounds(x: 0, y: -1, zoom: 1) })
    c.throwsError("quadkey rejects 4", { _ = try TileMath.quadkeyToTile("014") })
    c.throwsError("mercator rejects 86", { _ = try TileMath.lonLatToMercator(0, 86) })
}

func runEmailAddressChecks(_ c: inout Checks) {
    let a63 = String(repeating: "a", count: 63)
    let cases: [(String, Bool)] = [
        ("user@example.com", true), ("first.last+tag@sub.Example.CO.uk", true), ("o'brien@example.ie", true), ("a@b", true),
        ("user@-example.com", false), ("user@example-.com", false), ("user@exa_mple.com", false), ("user example@example.com", false),
        ("user@@example.com", false), ("@example.com", false), ("user@", false), ("user@example..com", false),
        ("user.@example.com", true), ("ünïcode@example.com", false),
        (String(repeating: "x", count: 64) + "@example.com", true), (String(repeating: "x", count: 65) + "@example.com", false),
        ("u@" + [a63, a63, a63].joined(separator: ".") + "." + String(repeating: "b", count: 59), true),
        ("u@" + [a63, a63, a63].joined(separator: ".") + "." + String(repeating: "b", count: 61), false),
        ("user@" + String(repeating: "a", count: 64) + ".com", false),
    ]
    for (s, want) in cases { c.eq("email \(s.prefix(40))", want, EmailAddress.emailValid(s)) }
    c.eq("email normalize", "Mixed.Case@example.com", try EmailAddress.emailNormalize("  Mixed.Case@Example.COM "))
    c.eq("email normalize tabs", "a@b.c", try EmailAddress.emailNormalize("\t\na@B.C\r\n"))
    for bad in ["", "   ", "user@", "x y@z"] {
        c.throwsError("email normalize rejects \(bad.debugDescription)", { _ = try EmailAddress.emailNormalize(bad) }, where: { $0 is EmailError })
    }
}

func runIsoDurationChecks(_ c: inout Checks) {
    let parse: [(String, IsoDurationParts)] = [
        ("P1Y2M3DT4H5M6S", IsoDurationParts(years: 1, months: 2, days: 3, hours: 4, minutes: 5, milliseconds: 6000)),
        ("PT1H30M", IsoDurationParts(hours: 1, minutes: 30)), ("P2W", IsoDurationParts(weeks: 2)),
        ("PT0.5S", IsoDurationParts(milliseconds: 500)), ("PT36H", IsoDurationParts(hours: 36)), ("P0D", IsoDurationParts()),
        ("PT1.250S", IsoDurationParts(milliseconds: 1250)),
    ]
    for (s, want) in parse { c.eq("duration parse \(s)", want, try IsoDuration.parseDuration(s)) }
    for bad in ["P", "PT", "1D", "P1H", "PT1D", "P-1D", "PT1.2345S", "P1.5D", "p1d", "P1DT", "", "P1D1Y", "PT1.S", "P99999999999999999999D"] {
        c.throwsError("duration rejects \(bad.debugDescription)", { _ = try IsoDuration.parseDuration(bad) }, where: { $0 is DurationError })
    }
    for (s, want) in [("PT1H30M", Int64(5_400_000)), ("P2W", 1_209_600_000), ("P1DT0.5S", 86_400_500), ("PT36H", 129_600_000)] {
        c.eq("duration ms \(s)", want, try IsoDuration.durationMilliseconds(try IsoDuration.parseDuration(s)))
    }
    for s in ["P1Y", "P1M"] {
        c.throwsError("duration not exact \(s)", { _ = try IsoDuration.durationMilliseconds(try IsoDuration.parseDuration(s)) },
                      where: { $0 is DurationError })
    }
    c.throwsError("duration ms overflow", { _ = try IsoDuration.durationMilliseconds(try IsoDuration.parseDuration("P9999999999999999W")) })
    for (ms, want) in [(Int64(0), "PT0S"), (5_400_000, "PT1H30M"), (90_061_001, "P1DT1H1M1.001S"), (500, "PT0.5S"),
                       (129_600_000, "P1DT12H"), (1_209_600_000, "P14D")] {
        c.eq("duration format \(ms)", want, try IsoDuration.formatDuration(milliseconds: ms))
    }
    c.eq("duration format 1.25s", "PT1.25S", try IsoDuration.formatDuration(milliseconds: 1250))
    c.throwsError("duration format negative", { _ = try IsoDuration.formatDuration(milliseconds: -1) })
}

func runGeometryChecks(_ c: inout Checks) {
    func pts(_ a: [[Double]]) -> [Point2D] { a.map { Point2D($0[0], $0[1]) } }
    let square = pts([[0, 0], [4, 0], [4, 4], [0, 4]])
    let concave = pts([[0, 0], [6, 0], [6, 6], [3, 3], [0, 6]])
    let pip: [([Point2D], [Double], Bool)] = [
        (square, [2, 2], true), (square, [5, 2], false), (square, [4, 2], true), (square, [0, 0], true), (square, [2, 4.000001], false),
        (concave, [3, 4], false), (concave, [3, 2], true), (concave, [1, 5], true), (concave, [3, 3], true),
    ]
    for (ring, p, want) in pip { c.eq("pip \(p) in \(ring.count)-gon", want, try Geometry.pointInPolygon(Point2D(p[0], p[1]), ring)) }
    c.eq("pip closed ring", true, try Geometry.pointInPolygon(Point2D(2, 2), square + [square[0]]))
    c.eq("area square", 16.0, try Geometry.signedArea(square))
    c.eq("area reversed", -16.0, try Geometry.signedArea(pts([[0, 4], [4, 4], [4, 0], [0, 0]])))
    c.eq("area concave", 27.0, try Geometry.signedArea(concave))
    for (ring, x, y) in [(square, 2.0, 2.0), (concave, 3.0, 2.3333333333333335)] {
        let p = try? Geometry.centroid(ring)
        c.check("centroid \(ring.count)-gon", p.map { close($0.x, x, 1e-9) && close($0.y, y, 1e-9) } ?? false)
    }
    c.throwsError("centroid zero area", { _ = try Geometry.centroid(pts([[0, 0], [1, 1], [2, 2]])) }, where: { $0 is GeometryError })
    c.throwsError("ring too short", { _ = try Geometry.signedArea(pts([[0, 0], [1, 1], [0, 0]])) })
    let line = pts([[0, 0], [1, 0.1], [2, -0.1], [3, 5], [4, 6], [5, 7], [6, 8.1], [7, 9], [8, 9], [9, 9]])
    c.eq("simplify tolerance 1", pts([[0, 0], [2, -0.1], [3, 5], [7, 9], [9, 9]]), try Geometry.simplify(line, tolerance: 1))
    c.eq("simplify tolerance 0.05", pts([[0, 0], [1, 0.1], [2, -0.1], [3, 5], [6, 8.1], [7, 9], [9, 9]]),
         try Geometry.simplify(line, tolerance: 0.05))
    c.eq("simplify two points", pts([[0, 0], [5, 5]]), try Geometry.simplify(pts([[0, 0], [5, 5]]), tolerance: 1))
    c.throwsError("simplify negative tolerance", { _ = try Geometry.simplify(line, tolerance: -1) })
    for (ring, want) in [(pts([[0, 0], [1, 0], [1, 1], [0, 1]]), 12391399902.070992),
                         (pts([[-0.13, 51.5], [-0.12, 51.5], [-0.12, 51.51], [-0.13, 51.51]]), 771337.3090775362)] {
        let a = try? Geometry.ringAreaSquareMeters(ring)
        c.check("ring area \(want)", a.map { abs($0 - want) <= want * 1e-9 } ?? false)
    }
}

func runSafeRedirectChecks(_ c: inout Checks) {
    let allowed = ["https://app.example.com", "https://accounts.example.com:8443"]
    let cases: [(String, String)] = [
        ("/dashboard?tab=1#top", "/dashboard?tab=1#top"), ("//evil.com/x", "/"), ("/\\evil.com", "/"),
        ("https://app.example.com/settings", "https://app.example.com/settings"), ("HTTPS://APP.EXAMPLE.COM:443/a", "HTTPS://APP.EXAMPLE.COM:443/a"),
        ("https://app.example.com.evil.com/", "/"), ("https://user@app.example.com/", "/"), ("http://app.example.com/", "/"),
        ("https://accounts.example.com:8443/login", "https://accounts.example.com:8443/login"), ("https://accounts.example.com/login", "/"),
        ("javascript:alert(1)", "/"), ("/ok path", "/"), ("dashboard", "/"), ("", "/"), ("/\t/evil.com", "/"),
        ("https://app.example.com:99999/", "/"),
    ]
    for (target, want) in cases { c.eq("redirect \(target.debugDescription)", want, SafeRedirect.safeRedirect(target, allowedOrigins: allowed)) }
    let extra: [(String, String)] = [
        ("https://app.example.com", "https://app.example.com"), ("https://app.example.com?x=1", "https://app.example.com?x=1"),
        ("https://.app.example.com/", "/home"), ("https://app..example.com/", "/home"), ("https://app.example.com:/", "/home"),
        ("https://app.example.com:0/", "/home"), ("ftp://app.example.com/", "/home"), ("/" + String(repeating: "a", count: 2048), "/home"),
        ("/a\u{7f}", "/home"),
    ]
    for (target, want) in extra {
        c.eq("redirect extra \(target.prefix(40).debugDescription)", want, SafeRedirect.safeRedirect(target, allowedOrigins: allowed, fallback: "/home"))
    }
}
