// SPDX-License-Identifier: Apache-2.0
// Google encoded polyline algorithm: values scaled by 10^precision (rounded half away from zero), delta-encoded,
// zigzagged and written as 5-bit chunks with a 0x20 continuation bit, offset by 63.
#if canImport(Glibc)
import Glibc
#elseif canImport(Darwin)
import Darwin
#elseif canImport(ucrt)
import ucrt
#endif

public enum PolylineError: Error, Equatable {
    case invalidArgument(String)
}

public enum Polyline {
    private static func factor(_ precision: Int) throws -> Double {
        guard (0...10).contains(precision) else { throw PolylineError.invalidArgument("precision must be 0 to 10") }
        return pow(10, Double(precision))
    }

    private static func scaled(_ v: Double, _ f: Double) throws -> Int64 {
        let x = v * f
        guard x.isFinite, abs(x) < 1e15 else { throw PolylineError.invalidArgument("coordinate out of range: \(v)") }
        let r = (abs(x) + 0.5).rounded(.down)
        return Int64(x >= 0 ? r : -r)
    }

    /// Encodes (lat, lon) pairs.
    public static func encodePolyline(_ points: [(lat: Double, lon: Double)], precision: Int = 5) throws -> String {
        let f = try factor(precision)
        var out: [UInt8] = []
        var prevLat: Int64 = 0, prevLon: Int64 = 0
        for p in points {
            let lat = try scaled(p.lat, f), lon = try scaled(p.lon, f)
            for d in [lat - prevLat, lon - prevLon] {
                var v = d < 0 ? ~(d << 1) : d << 1
                while v >= 0x20 {
                    out.append(UInt8((0x20 | (v & 0x1f)) + 63))
                    v >>= 5
                }
                out.append(UInt8(v + 63))
            }
            (prevLat, prevLon) = (lat, lon)
        }
        return String(decoding: out, as: UTF8.self)
    }

    /// Decodes an encoded polyline; rejects characters outside 63...126, truncated and overlong input.
    public static func decodePolyline(_ text: String, precision: Int = 5) throws -> [(lat: Double, lon: Double)] {
        let f = try factor(precision)
        let b = Array(text.utf8)
        var i = 0
        func value() throws -> Int64 {
            var result: Int64 = 0, shift: Int64 = 0
            while true {
                guard i < b.count else { throw PolylineError.invalidArgument("truncated polyline") }
                let c = b[i]
                guard c >= 63 && c <= 126 else { throw PolylineError.invalidArgument("invalid polyline character at \(i)") }
                guard shift <= 55 else { throw PolylineError.invalidArgument("polyline value too long") }
                let chunk = Int64(c - 63)
                result |= (chunk & 0x1f) << shift
                shift += 5
                i += 1
                if chunk < 0x20 { break }
            }
            return (result & 1) != 0 ? ~(result >> 1) : result >> 1
        }
        var out: [(lat: Double, lon: Double)] = []
        var lat: Int64 = 0, lon: Int64 = 0
        while i < b.count {
            let dLat = try value(), dLon = try value()
            let (nLat, o1) = lat.addingReportingOverflow(dLat), (nLon, o2) = lon.addingReportingOverflow(dLon)
            guard !o1, !o2 else { throw PolylineError.invalidArgument("polyline value overflow") }
            (lat, lon) = (nLat, nLon)
            out.append((Double(lat) / f, Double(lon) / f))
        }
        return out
    }
}
