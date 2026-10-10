// SPDX-License-Identifier: Apache-2.0
// Planar polygon and line helpers on [x, y] = [lon, lat] points: point-in-polygon (edges inclusive), signed shoelace
// area, area-weighted centroid, Douglas-Peucker simplification and the spherical ring area used by Turf/Mapbox.
#if canImport(Glibc)
import Glibc
#elseif canImport(Darwin)
import Darwin
#elseif canImport(ucrt)
import ucrt
#endif

public enum GeometryError: Error, Equatable {
    case invalidArgument(String)
}

public struct Point2D: Equatable, Sendable {
    public let x: Double, y: Double
    public init(_ x: Double, _ y: Double) { self.x = x; self.y = y }
}

public enum Geometry {
    public static let earthRadiusMeters = 6_378_137.0

    /// Validated ring without a duplicated closing point.
    private static func ring(_ r: [Point2D]) throws -> [Point2D] {
        guard r.allSatisfy({ $0.x.isFinite && $0.y.isFinite }) else { throw GeometryError.invalidArgument("coordinates must be finite") }
        let open = r.count > 1 && r.first == r.last ? Array(r.dropLast()) : r
        guard open.count >= 3 else { throw GeometryError.invalidArgument("a ring needs at least 3 distinct points") }
        return open
    }

    /// True when `point` is inside the ring or on its boundary (even-odd rule).
    public static func pointInPolygon(_ point: Point2D, _ r: [Point2D]) throws -> Bool {
        guard point.x.isFinite, point.y.isFinite else { throw GeometryError.invalidArgument("coordinates must be finite") }
        let pts = try ring(r)
        let (x, y) = (point.x, point.y)
        var inside = false
        for i in 0..<pts.count {
            let a = pts[i], b = pts[(i + 1) % pts.count]
            let cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x)
            if cross == 0 && min(a.x, b.x) <= x && x <= max(a.x, b.x) && min(a.y, b.y) <= y && y <= max(a.y, b.y) { return true }
            if (a.y > y) != (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x { inside.toggle() }
        }
        return inside
    }

    /// Shoelace area; counter-clockwise rings are positive.
    public static func signedArea(_ r: [Point2D]) throws -> Double {
        let pts = try ring(r)
        var sum = 0.0
        for i in 0..<pts.count {
            let a = pts[i], b = pts[(i + 1) % pts.count]
            sum += a.x * b.y - b.x * a.y
        }
        return sum / 2
    }

    /// Area-weighted centroid; throws for a zero-area ring.
    public static func centroid(_ r: [Point2D]) throws -> Point2D {
        let pts = try ring(r)
        let area = try signedArea(pts)
        guard area != 0 else { throw GeometryError.invalidArgument("centroid of a zero-area ring is undefined") }
        var cx = 0.0, cy = 0.0
        for i in 0..<pts.count {
            let a = pts[i], b = pts[(i + 1) % pts.count]
            let c = a.x * b.y - b.x * a.y
            cx += (a.x + b.x) * c
            cy += (a.y + b.y) * c
        }
        return Point2D(cx / (6 * area), cy / (6 * area))
    }

    private static func segmentDistance(_ p: Point2D, _ a: Point2D, _ b: Point2D) -> Double {
        let dx = b.x - a.x, dy = b.y - a.y
        if dx == 0 && dy == 0 { return hypot(p.x - a.x, p.y - a.y) }
        let t = max(0, min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)))
        return hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
    }

    /// Douglas-Peucker simplification keeping the endpoints; fewer than 3 points are returned unchanged.
    public static func simplify(_ points: [Point2D], tolerance: Double) throws -> [Point2D] {
        guard tolerance.isFinite, tolerance >= 0 else { throw GeometryError.invalidArgument("tolerance must be finite and >= 0") }
        guard points.allSatisfy({ $0.x.isFinite && $0.y.isFinite }) else { throw GeometryError.invalidArgument("coordinates must be finite") }
        guard points.count >= 3 else { return points }
        var keep = [Bool](repeating: false, count: points.count)
        keep[0] = true
        keep[points.count - 1] = true
        var stack = [(0, points.count - 1)]
        while let (first, last) = stack.popLast() {
            guard last - first >= 2 else { continue }
            var best = -1.0, index = first
            for i in (first + 1)..<last {
                let d = segmentDistance(points[i], points[first], points[last])
                if d > best { best = d; index = i }
            }
            if best > tolerance {
                keep[index] = true
                stack.append((first, index))
                stack.append((index, last))
            }
        }
        return points.indices.filter { keep[$0] }.map { points[$0] }
    }

    /// Approximate geodesic area in square meters of a [lon, lat] ring on a sphere of radius 6378137 m.
    public static func ringAreaSquareMeters(_ r: [Point2D]) throws -> Double {
        let pts = try ring(r)
        let rad = { (d: Double) in d * .pi / 180 }
        var total = 0.0
        for i in 0..<pts.count {
            let a = pts[i], b = pts[(i + 1) % pts.count]
            total += rad(b.x - a.x) * (2 + sin(rad(a.y)) + sin(rad(b.y)))
        }
        return abs(total * earthRadiusMeters * earthRadiusMeters / 2)
    }
}
