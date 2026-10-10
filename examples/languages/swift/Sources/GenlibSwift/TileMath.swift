// SPDX-License-Identifier: Apache-2.0
// Web Mercator (EPSG:3857) slippy-map tile math: lon/lat to tile, tile bounds, Bing quadkeys and Mercator meters.
#if canImport(Glibc)
import Glibc
#elseif canImport(Darwin)
import Darwin
#elseif canImport(ucrt)
import ucrt
#endif

public enum TileMathError: Error, Equatable {
    case invalidArgument(String)
}

public struct Tile: Equatable, Sendable {
    public let x: Int, y: Int, zoom: Int
    public init(x: Int, y: Int, zoom: Int) { self.x = x; self.y = y; self.zoom = zoom }
}

/// Tile bounds in degrees.
public struct TileBounds: Equatable, Sendable {
    public let west: Double, south: Double, east: Double, north: Double
}

public struct MercatorPoint: Equatable, Sendable {
    public let x: Double, y: Double
}

public enum TileMath {
    public static let maxLatitude = 85.05112877980659
    public static let maxZoom = 24
    public static let earthRadiusMeters = 6_378_137.0

    private static func checkZoom(_ zoom: Int) throws {
        guard (0...maxZoom).contains(zoom) else { throw TileMathError.invalidArgument("zoom must be 0 to \(maxZoom)") }
    }

    private static func checkLonLat(_ lon: Double, _ lat: Double) throws {
        guard lon.isFinite, lon >= -180, lon <= 180 else { throw TileMathError.invalidArgument("longitude must be in [-180, 180]: \(lon)") }
        guard lat.isFinite, lat >= -90, lat <= 90 else { throw TileMathError.invalidArgument("latitude must be in [-90, 90]: \(lat)") }
    }

    private static func checkTile(_ x: Int, _ y: Int, _ zoom: Int) throws {
        try checkZoom(zoom)
        let n = 1 << zoom
        guard (0..<n).contains(x), (0..<n).contains(y) else { throw TileMathError.invalidArgument("tile x/y must be in [0, \(n - 1)]") }
    }

    /// Tile containing the point; latitude is clamped to the Mercator limit.
    public static func lonLatToTile(_ lon: Double, _ lat: Double, zoom: Int) throws -> Tile {
        try checkZoom(zoom)
        try checkLonLat(lon, lat)
        let n = 1 << zoom, nd = Double(n)
        let r = max(-maxLatitude, min(maxLatitude, lat)) * .pi / 180
        let x = Int(((lon + 180) / 360 * nd).rounded(.down))
        let y = Int(((1 - log(tan(r) + 1 / cos(r)) / .pi) / 2 * nd).rounded(.down))
        return Tile(x: min(max(x, 0), n - 1), y: min(max(y, 0), n - 1), zoom: zoom)
    }

    /// West, south, east and north edges of a tile in degrees.
    public static func tileBounds(x: Int, y: Int, zoom: Int) throws -> TileBounds {
        try checkTile(x, y, zoom)
        let n = Double(1 << zoom)
        func lon(_ v: Int) -> Double { Double(v) / n * 360 - 180 }
        func lat(_ v: Int) -> Double { atan(sinh(.pi * (1 - 2 * Double(v) / n))) * 180 / .pi }
        return TileBounds(west: lon(x), south: lat(y + 1), east: lon(x + 1), north: lat(y))
    }

    /// Bing Maps quadkey of a tile (empty at zoom 0).
    public static func tileToQuadkey(x: Int, y: Int, zoom: Int) throws -> String {
        try checkTile(x, y, zoom)
        var out: [UInt8] = []
        for i in stride(from: zoom, to: 0, by: -1) {
            let m = 1 << (i - 1)
            out.append(0x30 + (x & m != 0 ? 1 : 0) + (y & m != 0 ? 2 : 0))
        }
        return String(decoding: out, as: UTF8.self)
    }

    /// Tile of a quadkey of digits 0-3 (the empty key is zoom 0).
    public static func quadkeyToTile(_ key: String) throws -> Tile {
        let b = Array(key.utf8)
        guard b.count <= maxZoom else { throw TileMathError.invalidArgument("quadkey longer than \(maxZoom)") }
        var x = 0, y = 0
        for c in b {
            guard c >= 0x30 && c <= 0x33 else { throw TileMathError.invalidArgument("quadkey digits must be 0-3") }
            let d = Int(c - 0x30)
            x = x << 1 | (d & 1)
            y = y << 1 | (d >> 1)
        }
        return Tile(x: x, y: y, zoom: b.count)
    }

    /// Spherical Mercator meters (R = 6378137); rejects latitudes beyond the Mercator limit.
    public static func lonLatToMercator(_ lon: Double, _ lat: Double) throws -> MercatorPoint {
        try checkLonLat(lon, lat)
        guard abs(lat) <= maxLatitude + 1e-9 else { throw TileMathError.invalidArgument("latitude beyond the Mercator limit: \(lat)") }
        let r = lat * .pi / 180
        return MercatorPoint(x: lon * .pi / 180 * earthRadiusMeters, y: log(tan(.pi / 4 + r / 2)) * earthRadiusMeters)
    }
}
