// SPDX-License-Identifier: Apache-2.0
// Great-circle distance (haversine, mean Earth radius 6,371,008.8 m), geohash encode/decode and a radius bounding box
// for coarse database prefilters.
#if canImport(Glibc)
import Glibc
#elseif canImport(Darwin)
import Darwin
#elseif canImport(ucrt)
import ucrt
#endif

public enum GeoError: Error, Equatable {
    case invalidArgument(String)
}

/// A decoded geohash cell: center and half the cell size in each axis.
public struct GeohashCell: Equatable, Sendable {
    public let lat: Double, lon: Double, latError: Double, lonError: Double
}

/// Latitude/longitude bounds enclosing a circle.
public struct GeoBoundingBox: Equatable, Sendable {
    public let minLat: Double, minLon: Double, maxLat: Double, maxLon: Double
}

public enum Geo {
    public static let earthRadiusMeters = 6_371_008.8
    private static let base32 = Array("0123456789bcdefghjkmnpqrstuvwxyz".utf8)

    private static func radians(_ deg: Double) -> Double { deg * .pi / 180 }
    private static func degrees(_ rad: Double) -> Double { rad * 180 / .pi }

    private static func check(_ lat: Double, _ lon: Double) throws {
        guard lat >= -90, lat <= 90 else { throw GeoError.invalidArgument("latitude must be in [-90, 90]: \(lat)") }
        guard lon >= -180, lon <= 180 else { throw GeoError.invalidArgument("longitude must be in [-180, 180]: \(lon)") }
    }

    /// Great-circle distance in meters.
    public static func haversineMeters(_ lat1: Double, _ lon1: Double, _ lat2: Double, _ lon2: Double) throws -> Double {
        try check(lat1, lon1)
        try check(lat2, lon2)
        let dp = radians(lat2 - lat1), dl = radians(lon2 - lon1)
        let h = pow(sin(dp / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * pow(sin(dl / 2), 2)
        return 2 * earthRadiusMeters * asin(min(1, h.squareRoot()))
    }

    /// Geohash of `precision` (1...12) characters, longitude bit first.
    public static func geohashEncode(_ lat: Double, _ lon: Double, precision: Int) throws -> String {
        try check(lat, lon)
        guard (1...12).contains(precision) else { throw GeoError.invalidArgument("precision must be 1 to 12") }
        var latRange = (-90.0, 90.0), lonRange = (-180.0, 180.0)
        var out: [UInt8] = []
        var bit = 0, ch = 0, even = true
        while out.count < precision {
            let value = even ? lon : lat
            var range = even ? lonRange : latRange
            let mid = (range.0 + range.1) / 2
            ch <<= 1
            if value >= mid { ch |= 1; range.0 = mid } else { range.1 = mid }
            if even { lonRange = range } else { latRange = range }
            even.toggle()
            bit += 1
            if bit == 5 { out.append(base32[ch]); bit = 0; ch = 0 }
        }
        return String(decoding: out, as: UTF8.self)
    }

    /// Decodes a geohash (case-insensitive) to its cell center and error.
    public static func geohashDecode(_ hash: String) throws -> GeohashCell {
        let b = Array(hash.utf8)
        guard (1...12).contains(b.count) else { throw GeoError.invalidArgument("geohash must be 1 to 12 characters") }
        var latRange = (-90.0, 90.0), lonRange = (-180.0, 180.0)
        var even = true
        for c in b {
            let lower = (0x41...0x5A).contains(c) ? c + 32 : c
            guard let v = base32.firstIndex(of: lower) else { throw GeoError.invalidArgument("invalid geohash character in \"\(hash)\"") }
            for shift in stride(from: 4, through: 0, by: -1) {
                var range = even ? lonRange : latRange
                let mid = (range.0 + range.1) / 2
                if (v >> shift) & 1 == 1 { range.0 = mid } else { range.1 = mid }
                if even { lonRange = range } else { latRange = range }
                even.toggle()
            }
        }
        return GeohashCell(lat: (latRange.0 + latRange.1) / 2, lon: (lonRange.0 + lonRange.1) / 2,
                           latError: (latRange.1 - latRange.0) / 2, lonError: (lonRange.1 - lonRange.0) / 2)
    }

    /// Box around a point: latitude +-radius/R, longitude half-width equal to the circle's widest longitude extent,
    /// asin(sin(r)/cos(lat)) for angular radius r, latitude clamped to valid ranges. Near a pole (or when
    /// sin(r) >= cos(lat)) and when the box would cross the antimeridian, the longitude range becomes [-180, 180] so
    /// far-side points are never excluded. Use as a prefilter, then haversine.
    public static func boundingBox(_ lat: Double, _ lon: Double, radiusMeters: Double) throws -> GeoBoundingBox {
        try check(lat, lon)
        guard radiusMeters.isFinite, radiusMeters >= 0 else { throw GeoError.invalidArgument("radiusMeters must be a non-negative finite number") }
        let angular = radiusMeters / earthRadiusMeters
        let dlat = degrees(angular)
        let minLat = lat - dlat, maxLat = lat + dlat
        let s = sin(angular) / cos(radians(lat))
        var minLon = -180.0, maxLon = 180.0
        if minLat > -90, maxLat < 90, s.isFinite, s < 1 {
            let dlon = degrees(asin(s))
            if lon - dlon >= -180, lon + dlon <= 180 {
                minLon = lon - dlon
                maxLon = lon + dlon
            }
        }
        return GeoBoundingBox(minLat: max(-90, minLat), minLon: minLon, maxLat: min(90, maxLat), maxLon: maxLon)
    }
}
