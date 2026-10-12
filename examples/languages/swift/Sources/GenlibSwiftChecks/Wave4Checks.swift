// SPDX-License-Identifier: Apache-2.0
// Checks for ids, retry-backoff, token-bucket, semver, cron-next, wcag-contrast, geo and webhook-signature.
#if canImport(Glibc)
import Glibc
#elseif canImport(Darwin)
import Darwin
#elseif canImport(ucrt)
import ucrt
#endif
import GenlibSwift

func runIdsChecks(_ c: inout Checks) {
    let r: [UInt8] = Array(1...10)
    c.eq("uuid7 vector", "01a0c450-6c7b-7102-8304-05060708090a", try Ids.uuidV7(unixMs: 1_790_000_000_123, random: r))
    c.eq("ulid vector", "01M3250V3V041061050R3GG28A", try Ids.ulid(unixMs: 1_790_000_000_123, random: r))
    c.eq("uuid7 zero", "00000000-0000-7000-8000-000000000000", try Ids.uuidV7(unixMs: 0, random: Array(repeating: 0, count: 10)))
    c.eq("ulid max time", "7ZZZZZZZZZZZZZZZZZZZZZZZZZ", try Ids.ulid(unixMs: Ids.maxUnixMs, random: Array(repeating: 0xff, count: 10)))
    c.eq("uuid7 time", 1_790_000_000_123, try Ids.uuidV7Time("01a0c450-6c7b-7102-8304-05060708090a"))
    c.eq("uuid7 time upper", 1_790_000_000_123, try Ids.uuidV7Time("01A0C450-6C7B-7102-8304-05060708090A"))
    c.eq("uuid7 time zero", 0, try Ids.uuidV7Time("00000000-0000-7000-8000-000000000000"))
    c.eq("ulid time", 1_790_000_000_123, try Ids.ulidTime("01M3250V3V041061050R3GG28A"))
    c.eq("ulid time lower", 1_790_000_000_123, try Ids.ulidTime("01m3250v3v041061050r3gg28a"))
    c.eq("ulid time max", Ids.maxUnixMs, try Ids.ulidTime("7ZZZZZZZZZZZZZZZZZZZZZZZZZ"))
    c.throwsError("uuid7 time > 48 bits", { _ = try Ids.uuidV7(unixMs: Ids.maxUnixMs + 1, random: r) })
    c.throwsError("uuid7 9 random bytes", { _ = try Ids.uuidV7(unixMs: 0, random: Array(repeating: 0, count: 9)) })
    c.throwsError("ulid 11 random bytes", { _ = try Ids.ulid(unixMs: 0, random: Array(repeating: 0, count: 11)) })
    for bad in ["01a0c450-6c7b-4102-8304-05060708090a", "01a0c450-6c7b-7102-c304-05060708090a", "01a0c450-6c7b-7102-8304-05060708090",
                "01a0c450x6c7b-7102-8304-05060708090a", "01a0c450-6c7b-7102-8304-05060708090g"] {
        c.throwsError("uuid7 time rejects \(bad)", { _ = try Ids.uuidV7Time(bad) }, where: { $0 is IdError })
    }
    for bad in ["8ZZZZZZZZZZZZZZZZZZZZZZZZZ", "01M3250V3V041061050R3GG28", "01M3250V3V041061050R3GG28U"] {
        c.throwsError("ulid time rejects \(bad)", { _ = try Ids.ulidTime(bad) }, where: { $0 is IdError })
    }
    let a = (try? Ids.newUuidV7()) ?? "", b = (try? Ids.newUuidV7()) ?? ""
    c.check("new uuid7 differ and parse", a != b && (try? Ids.uuidV7Time(a)) != nil)
    let u = (try? Ids.newUlid()) ?? "", v = (try? Ids.newUlid()) ?? ""
    c.check("new ulid differ and recent", u != v && u.count == 26 && ((try? Ids.ulidTime(u)) ?? 0) > 1_700_000_000_000)
}

func runRetryBackoffChecks(_ c: inout Checks) {
    c.eq("backoff a0", 50, try RetryBackoff.backoffDelay(attempt: 0, baseMs: 100, capMs: 10000, randomFraction: 0.5))
    c.eq("backoff a3", 799, try RetryBackoff.backoffDelay(attempt: 3, baseMs: 100, capMs: 10000, randomFraction: 0.999))
    c.eq("backoff a10", 2500, try RetryBackoff.backoffDelay(attempt: 10, baseMs: 100, capMs: 10000, randomFraction: 0.25))
    c.eq("backoff a3zero", 0, try RetryBackoff.backoffDelay(attempt: 3, baseMs: 100, capMs: 10000, randomFraction: 0.0))
    c.eq("backoff huge attempt", 5000, try RetryBackoff.backoffDelay(attempt: Int.max, baseMs: 100, capMs: 10000, randomFraction: 0.5))
    c.eq("backoff no overflow", 0, try RetryBackoff.backoffDelay(attempt: 200, baseMs: UInt64.max / 2, capMs: UInt64.max, randomFraction: 0))
    for (attempt, base, cap, fraction) in [(-1, UInt64(100), UInt64(1000), 0.5), (0, 0, 10, 0.5), (0, 100, 99, 0.5), (0, 100, 1000, 1.0),
                                           (0, 100, 1000, -0.1), (0, 100, 1000, Double.nan)] {
        c.throwsError("backoff rejects \(attempt) \(base) \(cap) \(fraction)", {
            _ = try RetryBackoff.backoffDelay(attempt: attempt, baseMs: base, capMs: cap, randomFraction: fraction)
        }, where: { $0 is BackoffError })
    }
    c.eq("retry-after secs", 120_000, RetryBackoff.retryAfterMs("120", nowMs: 0))
    c.eq("retry-after date", 30_000, RetryBackoff.retryAfterMs("Wed, 21 Oct 2026 07:28:00 GMT", nowMs: 1_792_567_650_000))
    c.eq("retry-after past", 0, RetryBackoff.retryAfterMs("Wed, 21 Oct 2015 07:28:00 GMT", nowMs: 1_792_567_650_000))
    for bad in ["", "-1", "1.5", "soon", "Thu, 21 Oct 2026 07:28:00 GMT", "Wed, 32 Oct 2026 07:28:00 GMT", "Wed, 21 Oct 2026 07:28:00 UTC",
                "Wednesday, 21-Oct-26 07:28:00 GMT", "99999999999999999999"] {
        c.check("retry-after rejects \(bad.debugDescription)", RetryBackoff.retryAfterMs(bad, nowMs: 0) == nil)
    }
}

func runTokenBucketChecks(_ c: inout Checks) {
    // (now, cost, allowed, tokensMilli, retryAfterMs)
    let steps: [(Int64, UInt64, Bool, UInt64, UInt64)] = [
        (0, 1, true, 4000, 0), (0, 1, true, 3000, 0), (0, 1, true, 2000, 0), (0, 1, true, 1000, 0), (0, 1, true, 0, 0),
        (0, 1, false, 0, 500), (250, 1, false, 500, 250), (500, 1, true, 0, 0), (500, 2, false, 0, 1000), (3000, 5, true, 0, 0),
    ]
    guard var state = try? TokenBucket.newBucket(capacity: 5, nowMs: 0) else { c.check("token bucket new", false); return }
    c.eq("token bucket starts full", 5000, state.tokensMilli)
    for (i, step) in steps.enumerated() {
        guard let r = try? TokenBucket.take(state, nowMs: step.0, cost: step.1, capacity: 5, ratePerSecond: 2) else {
            c.check("token bucket step \(i)", false); continue
        }
        c.check("token bucket step \(i)", r.allowed == step.2 && r.state.tokensMilli == step.3 && r.retryAfterMs == step.4)
        state = r.state
    }
    let s = BucketState(tokensMilli: 0, lastMs: 1000)
    c.eq("token bucket clock backwards", s, try TokenBucket.take(s, nowMs: 500, cost: 1, capacity: 5, ratePerSecond: 2).state)
    c.eq("token bucket huge refill", 4000,
         try TokenBucket.take(BucketState(tokensMilli: 0, lastMs: .min), nowMs: .max, cost: 1, capacity: 5, ratePerSecond: .max).state.tokensMilli)
    c.throwsError("token bucket cost > capacity", { _ = try TokenBucket.take(s, nowMs: 0, cost: 6, capacity: 5, ratePerSecond: 2) })
    c.throwsError("token bucket zero cost", { _ = try TokenBucket.take(s, nowMs: 0, cost: 0, capacity: 5, ratePerSecond: 2) })
    c.throwsError("token bucket zero rate", { _ = try TokenBucket.take(s, nowMs: 0, cost: 1, capacity: 5, ratePerSecond: 0) })
    c.throwsError("token bucket zero capacity", { _ = try TokenBucket.newBucket(capacity: 0, nowMs: 0) })
    c.throwsError("token bucket capacity overflow", { _ = try TokenBucket.newBucket(capacity: .max, nowMs: 0) })
}

func runSemverChecks(_ c: inout Checks) {
    let input = ["1.0.0-rc.1", "2.0.0", "1.0.0", "1.0.0-beta.11", "1.0.0-alpha", "1.0.0+build.5", "1.0.0-beta.2", "0.9.9",
                 "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-alpha.1"]
    // Insertion sort is stable, so equal versions keep their input order.
    var sorted: [String] = []
    for v in input {
        var i = sorted.count
        while i > 0, ((try? Semver.compare(sorted[i - 1], v)) ?? 0) > 0 { i -= 1 }
        sorted.insert(v, at: i)
    }
    c.eq("semver sort vector", ["0.9.9", "1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-beta.2", "1.0.0-beta.11",
                                "1.0.0-rc.1", "1.0.0", "1.0.0+build.5", "2.0.0"], sorted)
    c.eq("semver build ignored", 0, try Semver.compare("1.0.0", "1.0.0+build.5"))
    c.eq("semver parse parts", [.alphanumeric("alpha"), .numeric(1)], try Semver.parse("1.2.3-alpha.1+sha.5").prerelease)
    c.eq("semver parse build", ["sha", "5"], try Semver.parse("1.2.3-alpha.1+sha.5").build)
    c.eq("semver 0a is alphanumeric", [.alphanumeric("0a")], try Semver.parse("1.2.3-0a").prerelease)
    for bad in ["1.2", "1.2.3.4", "01.2.3", "1.02.3", "1.2.3-01", "1.2.3-", "1.2.3+", "1.2.3-a..b", "v1.2.3", " 1.2.3", "1.2.3-a_b",
                "99999999999999999999.0.0"] {
        c.throwsError("semver parse rejects \(bad.debugDescription)", { _ = try Semver.parse(bad) }, where: { $0 is SemverError })
    }
    let cases: [(String, String, Bool)] = [
        ("1.2.3", "^1.0.0", true), ("2.0.0", "^1.0.0", false), ("0.2.5", "^0.2.3", true), ("0.3.0", "^0.2.3", false),
        ("0.0.4", "^0.0.3", false), ("1.2.9", "~1.2.3", true), ("1.3.0", "~1.2.3", false), ("1.5.0", "1.x", true),
        ("1.5.0", ">=1.2.0 <1.5.0", false), ("1.4.9", ">=1.2.0 <1.5.0", true), ("3.1.0", "^1.0.0 || ^3.0.0", true),
        ("1.2.3-beta.2", "^1.2.3-beta.1", true), ("1.2.4-beta.1", "^1.2.3-beta.1", false), ("1.3.0-rc.1", "^1.2.0", false),
        ("1.2.0", "1.0.0 - 1.2.0", true), ("1.2.1", "1.0.0 - 1.2.0", false), ("0.0.1", "*", true), ("2.0.0", "<=1.x", false),
    ]
    for (v, r, want) in cases { c.eq("satisfies \(v) \(r)", want, try Semver.satisfies(v, r)) }
    let extra: [(String, String, Bool)] = [
        ("1.9.9", "<=1.x", true), ("1.2.3", ">= 1.2.3", true), ("1.0.0-beta", "*", false), ("1.0.0", ">*", false), ("1.2.3", "", true),
        ("1.2.0", "~1.2", true), ("1.3.0", "~1.2", false), ("0.0.9", "^0.0", true), ("2.0.0", ">1", true), ("1.9.0", ">1", false),
        ("1.2.3", "=1.2.3", true), ("1.2.3", "1.2.3+b", true), ("1.0.0", "1 - 2", true), ("2.9.9", "1 - 2", true), ("3.0.0", "1 - 2", false),
    ]
    for (v, r, want) in extra { c.eq("satisfies extra \(v) \(r.debugDescription)", want, try Semver.satisfies(v, r)) }
    for bad in ["^1.2.3.4", "1.x.3", ">=", "1 - ", "a.b.c", "1.2-beta"] {
        c.throwsError("satisfies rejects range \(bad.debugDescription)", { _ = try Semver.satisfies("1.2.3", bad) }, where: { $0 is SemverError })
    }
    c.throwsError("satisfies rejects version 1.2", { _ = try Semver.satisfies("1.2", "*") })
}

func runCronNextChecks(_ c: inout Checks) {
    let cases = [
        ("*/15 * * * *", "2026-10-10T12:07:30Z", "2026-10-10T12:15:00Z"),
        ("0 9 * * 1-5", "2026-10-10T12:00:00Z", "2026-10-12T09:00:00Z"),
        ("30 2 1 * *", "2026-10-10T00:00:00Z", "2026-11-01T02:30:00Z"),
        ("0 0 29 2 *", "2026-03-01T00:00:00Z", "2028-02-29T00:00:00Z"),
        ("0 12 13 * 5", "2026-10-10T00:00:00Z", "2026-10-13T12:00:00Z"),
        ("59 23 31 12 *", "2026-12-31T23:59:00Z", "2027-12-31T23:59:00Z"),
        ("0 0 * * 0", "2026-10-10T00:00:00Z", "2026-10-11T00:00:00Z"),
        ("5,10 8-9 * * *", "2026-10-10T09:10:00Z", "2026-10-11T08:05:00Z"),
        // Extra behaviour: 7 = Sunday, N/step, fractional seconds, OR of restricted day fields, AND when one starts with *.
        ("0 0 * * 7", "2026-10-10T00:00:00Z", "2026-10-11T00:00:00Z"),
        ("10/20 * * * *", "2026-10-10T12:31:00Z", "2026-10-10T12:50:00Z"),
        ("* * * * *", "2026-10-10T12:00:59.999Z", "2026-10-10T12:01:00Z"),
        ("0 0 13 * 5", "2026-10-14T00:00:00Z", "2026-10-16T00:00:00Z"),
        ("0 0 */10 * 5", "2026-10-10T00:00:00Z", "2026-12-11T00:00:00Z"),
    ]
    for (expr, after, want) in cases { c.eq("cron \(expr) after \(after)", want, try CronNext.nextRun(expr, after: after)) }
    for bad in ["* * * *", "60 * * * *", "* 24 * * *", "* * 0 * *", "* * * 13 *", "* * * * 8", "*/0 * * * *", "5-1 * * * *",
                "MON * * * *", "* * * * MON", "? * * * *", "1,,2 * * * *"] {
        c.throwsError("cron rejects \(bad)", { _ = try CronNext.nextRun(bad, after: "2026-10-10T00:00:00Z") }, where: { $0 is CronError })
    }
    c.throwsError("cron gives up after 5 years", { _ = try CronNext.nextRun("0 0 31 2 *", after: "2026-10-10T00:00:00Z") })
    for bad in ["2026-10-10 00:00:00Z", "2026-13-10T00:00:00Z", "2026-02-30T00:00:00Z", "2026-10-10T00:00:00", "x"] {
        c.throwsError("cron rejects after \(bad)", { _ = try CronNext.nextRun("* * * * *", after: bad) }, where: { $0 is CronError })
    }
}

func runWcagContrastChecks(_ c: inout Checks) {
    c.eq("wcag bw", 21.0, try WcagContrast.contrastRatio2("#000", "#fff"))
    c.eq("wcag grey", 4.54, try WcagContrast.contrastRatio2("#767676", "#ffffff"))
    c.eq("wcag blue", 4.51, try WcagContrast.contrastRatio2("#1a73e8", "#ffffff"))
    c.eq("wcag same", 1.0, try WcagContrast.contrastRatio2("#abc", "#aabbcc"))
    c.eq("wcag yellow", 1.07, try WcagContrast.contrastRatio2("#ffff00", "#ffffff"))
    c.eq("wcag grey passes AA", true, WcagContrast.passes(try WcagContrast.contrastRatio("#767676", "#ffffff"), level: .aa, largeText: false))
    c.eq("wcag yellow fails AA large", false, WcagContrast.passes(try WcagContrast.contrastRatio("#ffff00", "#ffffff"), level: .aa, largeText: true))
    c.eq("wcag luminance white", 1.0, try WcagContrast.relativeLuminance("#FFF"))
    c.eq("wcag luminance black", 0.0, try WcagContrast.relativeLuminance("#000000"))
    c.eq("wcag symmetric", (try? WcagContrast.contrastRatio("#000", "#fff")) ?? 0, try WcagContrast.contrastRatio("#fff", "#000"))
    c.check("wcag thresholds", WcagContrast.passes(3.0, level: .aa, largeText: true) && !WcagContrast.passes(2.99, level: .aa, largeText: true)
        && WcagContrast.passes(7.0, level: .aaa, largeText: false) && !WcagContrast.passes(6.99, level: .aaa, largeText: false)
        && WcagContrast.passes(4.5, level: .aaa, largeText: true) && !WcagContrast.passes(4.49, level: .aaa, largeText: true)
        && !WcagContrast.passes(4.499, level: .aa, largeText: false))
    for bad in ["fff", "#ffff", "#gggggg", "#fffffff", "", "#", "#ff ff ff"] {
        c.throwsError("wcag rejects \(bad.debugDescription)", { _ = try WcagContrast.relativeLuminance(bad) }, where: { $0 is ContrastError })
    }
}

func runGeoChecks(_ c: inout Checks) {
    c.eq("geo london-paris", 343_557, try Geo.haversineMeters(51.5074, -0.1278, 48.8566, 2.3522).rounded())
    c.eq("geo same point", 0, try Geo.haversineMeters(10, 10, 10, 10).rounded())
    c.eq("geo antipode", 20_015_114, try Geo.haversineMeters(0, 0, 0, 180).rounded())
    c.throwsError("geo lat > 90", { _ = try Geo.haversineMeters(91, 0, 0, 0) }, where: { $0 is GeoError })
    c.throwsError("geo lon < -180", { _ = try Geo.haversineMeters(0, 0, 0, -180.5) }, where: { $0 is GeoError })
    c.throwsError("geo NaN", { _ = try Geo.haversineMeters(.nan, 0, 0, 0) }, where: { $0 is GeoError })
    for (lat, lon, precision, want) in [(37.7749, -122.4194, 9, "9q8yyk8yt"), (0.0, 0.0, 5, "s0000"), (-33.8688, 151.2093, 7, "r3gx2f7")] {
        c.eq("geohash \(want)", want, try Geo.geohashEncode(lat, lon, precision: precision))
        if let cell = try? Geo.geohashDecode(want) {
            c.check("geohash decode \(want) contains point", abs(cell.lat - lat) <= cell.latError && abs(cell.lon - lon) <= cell.lonError)
        } else {
            c.check("geohash decode \(want)", false)
        }
    }
    c.eq("geohash decode case-insensitive", try? Geo.geohashDecode("9q8yyk8yt"), try? Geo.geohashDecode("9Q8YYK8YT"))
    c.throwsError("geohash precision 0", { _ = try Geo.geohashEncode(0, 0, precision: 0) })
    c.throwsError("geohash precision 13", { _ = try Geo.geohashEncode(0, 0, precision: 13) })
    for bad in ["", "abc", "9q8a", "s000i", "0123456789bcd"] {
        c.throwsError("geohash decode rejects \(bad.debugDescription)", { _ = try Geo.geohashDecode(bad) }, where: { $0 is GeoError })
    }
    let (lat, lon, radius) = (51.5, -0.12, 10_000.0)
    if let box = try? Geo.boundingBox(lat, lon, radiusMeters: radius) {
        for (plat, plon) in [(box.maxLat, lon), (box.minLat, lon), (lat, box.maxLon), (lat, box.minLon)] {
            c.check("bbox side \(plat),\(plon) >= radius - 1", ((try? Geo.haversineMeters(lat, lon, plat, plon)) ?? 0) >= radius - 1)
        }
        c.check("bbox contains center", box.minLat < lat && box.maxLat > lat && box.minLon < lon && box.maxLon > lon)
    } else {
        c.check("bbox computes", false)
    }
    let polar = try? Geo.boundingBox(89.99, 10, radiusMeters: 5000)
    c.check("bbox polar widens to all longitudes", polar?.minLon == -180 && polar?.maxLon == 180 && polar?.maxLat == 90)
    c.throwsError("bbox negative radius", { _ = try Geo.boundingBox(0, 0, radiusMeters: -1) })
    // Regression: the half-width is asin(sin(r)/cos(lat)), not 2*asin(sin(r/2)/cos(lat)).
    if let wide = try? Geo.boundingBox(60, 0, radiusMeters: 0.1 * Geo.earthRadiusMeters) {
        let half = wide.maxLon * Double.pi / 180
        let want = asin(sin(0.1) / cos(Double.pi / 3))
        c.check("bbox lat 60 r 0.1 half-width \(half) want \(want)", abs(half - want) <= 1e-6 * want && abs(half - 0.20101) < 1e-5)
        c.check("bbox lat 60 symmetric", abs(wide.minLon + wide.maxLon) < 1e-12)
    } else {
        c.check("bbox lat 60 computes", false)
    }
    var outside: String? = nil
    for cLat in [0.0, 45.0, 60.0, 75.0, -70.0] {
        for r in [1_000.0, 100_000.0, 1_000_000.0] {
            guard let b = try? Geo.boundingBox(cLat, 0, radiusMeters: r) else {
                outside = outside ?? "center \(cLat), radius \(r): boundingBox threw"
                continue
            }
            let d = r / Geo.earthRadiusMeters
            let p1 = cLat * Double.pi / 180
            for i in 0..<360 where outside == nil {
                let t = Double(i) * Double.pi / 180
                let p2 = asin(sin(p1) * cos(d) + cos(p1) * sin(d) * cos(t))
                let l2 = atan2(sin(t) * sin(d) * cos(p1), cos(d) - sin(p1) * sin(p2))
                let pLat = p2 * 180 / Double.pi, pLon = l2 * 180 / Double.pi
                if pLat < b.minLat - 1e-9 || pLat > b.maxLat + 1e-9 || pLon < b.minLon - 1e-9 || pLon > b.maxLon + 1e-9 {
                    outside = "center \(cLat), radius \(r), bearing \(i): \(pLat),\(pLon) outside \(b)"
                }
            }
        }
    }
    c.check("bbox contains circle points at 360 bearings \(outside ?? "")", outside == nil)
    for (cLon, bearing) in [(179.9, 90.0), (-179.9, 270.0)] {
        guard let b = try? Geo.boundingBox(10, cLon, radiusMeters: 50_000) else {
            c.check("bbox antimeridian center lon \(cLon) computes", false)
            continue
        }
        c.check("bbox antimeridian center lon \(cLon) spans all longitudes \(b)", b.minLon == -180 && b.maxLon == 180)
        let d = 50_000 / Geo.earthRadiusMeters, p1 = 10 * Double.pi / 180, t = bearing * Double.pi / 180
        let p2 = asin(sin(p1) * cos(d) + cos(p1) * sin(d) * cos(t))
        let l2 = cLon * Double.pi / 180 + atan2(sin(t) * sin(d) * cos(p1), cos(d) - sin(p1) * sin(p2))
        let pLat = p2 * 180 / Double.pi
        let pLon = (l2 * 180 / Double.pi + 540).truncatingRemainder(dividingBy: 360) - 180
        c.check("bbox antimeridian far-side point \(pLat),\(pLon) inside \(b)",
                abs(pLon) > 179.5 && pLat >= b.minLat && pLat <= b.maxLat && pLon >= b.minLon && pLon <= b.maxLon)
    }
}

func runWebhookSignatureChecks(_ c: inout Checks) {
    let secret = Array("whsec_test_secret_0123456789abcd".utf8)
    let body = Array("{\"id\":\"evt_1\",\"amount\":1999}".utf8)
    let t: UInt64 = 1_790_000_000
    let header = "t=1790000000,v1=ad4e559e93bea390aff65b8c1eaec615bbdf3df1ef1d1c908b03299c20cf44a6"
    let hex = String(header.dropFirst(16)), sig = String(header.dropFirst(13))
    func verify(_ h: String, _ b: [UInt8] = body, _ s: [UInt8] = secret, now: UInt64 = t) throws {
        try WebhookSignature.verifyWebhook(header: h, body: b, secret: s, nowSeconds: now)
    }
    func fails(_ name: String, _ expected: WebhookError, _ body: () throws -> Void) {
        c.throwsError(name, body, where: { ($0 as? WebhookError) == expected })
    }
    func malformed(_ name: String, _ body: () throws -> Void) {
        c.throwsError(name, body, where: { if case .malformed = ($0 as? WebhookError) { return true } else { return false } })
    }
    c.eq("webhook sign vector", header, try WebhookSignature.signWebhook(secret: secret, timestampSeconds: t, body: body))
    c.check("webhook verifies at t", (try? verify(header)) != nil)
    c.check("webhook verifies at t+300", (try? verify(header, now: t + 300)) != nil)
    c.check("webhook verifies at t-300", (try? verify(header, now: t - 300)) != nil)
    fails("webhook expired t+301", .expired) { try verify(header, now: t + 301) }
    fails("webhook expired t-301", .expired) { try verify(header, now: t - 301) }
    var tampered = body
    tampered[7] ^= 1
    fails("webhook body byte changed", .badSignature) { try verify(header, tampered) }
    fails("webhook other secret", .badSignature) { try verify(header, body, Array("whsec_other".utf8)) }
    let flipped = String(header.dropLast()) + "7"
    fails("webhook hex digit changed", .badSignature) { try verify(flipped) }
    fails("webhook bad signature before expiry", .badSignature) { try verify(flipped, now: t + 301) }
    c.check("webhook rotation with extra v1", (try? verify("t=1790000000, v1=\(String(repeating: "0", count: 64)) , v1=\(hex)")) != nil)
    c.check("webhook ignores v0", (try? verify(header + ",v0=whatever")) != nil)
    malformed("webhook missing t") { try verify(sig) }
    malformed("webhook two t") { try verify("t=1790000000,t=1790000000,\(sig)") }
    malformed("webhook non-hex v1") { try verify("t=1790000000,v1=zz" + String(hex.dropFirst(2))) }
    malformed("webhook uppercase v1") { try verify("t=1790000000,v1=" + hex.uppercased()) }
    malformed("webhook missing v1") { try verify("t=1790000000") }
    malformed("webhook negative t") { try verify("t=-5,\(sig)") }
    malformed("webhook fractional t") { try verify("t=1.5,\(sig)") }
    malformed("webhook garbage item") { try verify("garbage,\(header)") }
    malformed("webhook empty header") { try verify("") }
    c.throwsError("webhook sign empty secret", { _ = try WebhookSignature.signWebhook(secret: [], timestampSeconds: t, body: body) },
                  where: { if case .invalidArgument = ($0 as? WebhookError) { return true } else { return false } })
    c.throwsError("webhook verify empty secret", { try verify(header, body, []) },
                  where: { if case .invalidArgument = ($0 as? WebhookError) { return true } else { return false } })
}
