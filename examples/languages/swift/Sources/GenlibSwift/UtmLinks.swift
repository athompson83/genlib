// SPDX-License-Identifier: Apache-2.0
// Builds, parses and cleans campaign-tagged URLs without touching unrelated query parameters.

public enum UtmError: Error, Equatable {
    case invalidArgument(String)
}

/// UTM campaign parameters; nil means absent.
public struct UtmParameters: Equatable, Sendable {
    public var source: String?, medium: String?, campaign: String?, term: String?, content: String?, id: String?
    public init(source: String? = nil, medium: String? = nil, campaign: String? = nil, term: String? = nil,
                content: String? = nil, id: String? = nil) {
        self.source = source; self.medium = medium; self.campaign = campaign; self.term = term; self.content = content; self.id = id
    }

    /// Present parameters as (name without "utm_", value) in the order id, source, medium, campaign, term, content.
    public var pairs: [(key: String, value: String)] {
        [("id", id), ("source", source), ("medium", medium), ("campaign", campaign), ("term", term), ("content", content)]
            .compactMap { k, v in v.map { (key: k, value: $0) } }
    }
}

public enum UtmLinks {
    private static let keys = ["id", "source", "medium", "campaign", "term", "content"]
    private static let trackingParams: Set<String> = [
        "gclid", "gbraid", "wbraid", "fbclid", "msclkid", "ttclid", "twclid", "li_fat_id", "mc_cid", "mc_eid", "_hsenc", "_hsmi", "yclid", "igshid",
    ]

    /// Appends utm_id, utm_source, utm_medium, utm_campaign, utm_term and utm_content (trimmed, lowercased, RFC 3986 encoded)
    /// after existing parameters; an existing utm_* of the same name is replaced in place. Blank optional values are skipped.
    public static func buildUtmURL(_ baseURL: String, _ utm: UtmParameters) throws -> String {
        guard isAbsoluteHTTPURL(baseURL) else { throw UtmError.invalidArgument("baseUrl must be an absolute http(s) URL: \(baseURL)") }
        func required(_ v: String?, _ name: String) throws -> String {
            let t = trimmed(v ?? "")
            guard !t.isEmpty else { throw UtmError.invalidArgument("\(name) is required") }
            return t.lowercased()
        }
        func optional(_ v: String?) -> String? {
            let t = trimmed(v ?? "")
            return t.isEmpty ? nil : t.lowercased()
        }
        let normalized = UtmParameters(source: try required(utm.source, "source"), medium: try required(utm.medium, "medium"),
                                       campaign: try required(utm.campaign, "campaign"), term: optional(utm.term),
                                       content: optional(utm.content), id: optional(utm.id))
        let parts = splitURL(baseURL)
        var segments = querySegments(parts.query)
        for (key, value) in normalized.pairs {
            let name = "utm_" + key
            let segment = name + "=" + percentEncode(value)
            guard let index = segments.firstIndex(where: { paramName($0) == name }) else { segments.append(segment); continue }
            segments[index] = segment
            var i = segments.count - 1
            while i > index { if paramName(segments[i]) == name { segments.remove(at: i) }; i -= 1 }
        }
        return joinURL(parts.head, segments, parts.fragment)
    }

    /// Reads utm_* parameters (first occurrence wins, '+' is a space, percent-decoded).
    public static func parseUtm(_ url: String) throws -> UtmParameters {
        guard isAbsoluteHTTPURL(url) else { throw UtmError.invalidArgument("url must be an absolute http(s) URL: \(url)") }
        var found: [String: String] = [:]
        for segment in querySegments(splitURL(url).query) {
            let eq = segment.firstIndex(of: "=")
            guard let name = formDecode(String(eq.map { segment[..<$0] } ?? Substring(segment))) else {
                throw UtmError.invalidArgument("malformed percent-encoding in query")
            }
            guard name.hasPrefix("utm_") else { continue }
            let key = String(name.dropFirst(4))
            guard keys.contains(key), found[key] == nil else { continue }
            guard let value = formDecode(eq.map { String(segment[segment.index(after: $0)...]) } ?? "") else {
                throw UtmError.invalidArgument("malformed percent-encoding in query")
            }
            found[key] = value
        }
        return UtmParameters(source: found["source"], medium: found["medium"], campaign: found["campaign"],
                             term: found["term"], content: found["content"], id: found["id"])
    }

    /// Removes utm_* and known click identifiers, keeping other parameters (order and encoding) and the fragment.
    public static func stripTracking(_ url: String) throws -> String {
        guard isAbsoluteHTTPURL(url) else { throw UtmError.invalidArgument("url must be an absolute http(s) URL: \(url)") }
        let parts = splitURL(url)
        let kept = querySegments(parts.query).filter {
            let name = paramName($0)
            return !name.hasPrefix("utm_") && !trackingParams.contains(name)
        }
        return joinURL(parts.head, kept, parts.fragment)
    }
}
