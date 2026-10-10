// SPDX-License-Identifier: Apache-2.0
using System.Globalization;
using System.Text;

namespace Genlib.Validation;

/// <summary>
/// Hand-parsed IPv4/IPv6 addresses, CIDR membership and an SSRF guard (<see cref="IsPublicIp"/>). Identical rules in every
/// Genlib language; no platform address parser is used.
/// </summary>
/// <remarks>
/// SSRF use: resolve the hostname yourself, check EVERY resolved address with <see cref="IsPublicIp"/>, then connect to that
/// checked address (no second DNS lookup), and re-check after every redirect.
/// </remarks>
public static class IpCidr {
    private static readonly (byte[] Net, int Prefix)[] V4Special = Ranges(
        "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24",
        "192.88.99.0/24", "192.168.0.0/16", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4");
    private static readonly (byte[] Net, int Prefix)[] V6Special = Ranges(
        "::/128", "::1/128", "100::/64", "2001::/23", "2001:db8::/32", "2002::/16", "fc00::/7", "fe80::/10", "ff00::/8");
    private static readonly byte[] Nat64Prefix = { 0, 0x64, 0xff, 0x9b, 0, 0, 0, 0, 0, 0, 0, 0 };

    /// <summary>
    /// Parses dotted IPv4 (four decimal parts 0-255, no leading zeros) to 4 bytes or RFC 4291 IPv6 text to 16 bytes.
    /// Zone ids, brackets, whitespace and CIDR suffixes are rejected with <see cref="FormatException"/>.
    /// </summary>
    public static byte[] ParseIp(string text) {
        ArgumentNullException.ThrowIfNull(text);
        return (text.Contains(':') ? ParseV6(text) : ParseV4(text)) ?? throw new FormatException("invalid IP address: '" + text + "'");
    }

    /// <summary>RFC 5952 text: lowercase, no leading zeros, longest zero run as "::"; IPv4-mapped as ::ffff:a.b.c.d.</summary>
    public static string CanonicalIp(string text) => Format(ParseIp(text));

    /// <summary>
    /// True when <paramref name="ip"/> is inside <paramref name="cidr"/> ("address/prefix"). Different families never match.
    /// Throws <see cref="FormatException"/> for a malformed CIDR, a CIDR with host bits set, or a malformed address.
    /// </summary>
    public static bool CidrContains(string cidr, string ip) {
        var (net, prefix) = ParseCidr(cidr);
        byte[] x = ParseIp(ip);
        return x.Length == net.Length && PrefixEqual(net, x, prefix);
    }

    /// <summary>
    /// False for loopback, private, link-local, shared, documentation, multicast, reserved and other special ranges.
    /// IPv4-mapped (::ffff:0:0/96) and NAT64 (64:ff9b::/96) addresses are judged by their embedded IPv4 address.
    /// Throws <see cref="FormatException"/> for a malformed address.
    /// </summary>
    public static bool IsPublicIp(string ip) {
        byte[] b = ParseIp(ip);
        if (b.Length == 16 && (IsMapped(b) || b.AsSpan(0, 12).SequenceEqual(Nat64Prefix))) b = b[12..];
        foreach (var (net, prefix) in b.Length == 4 ? V4Special : V6Special) if (PrefixEqual(net, b, prefix)) return false;
        return true;
    }

    private static (byte[] Net, int Prefix) ParseCidr(string cidr) {
        ArgumentNullException.ThrowIfNull(cidr);
        int slash = cidr.IndexOf('/');
        if (slash < 0 || cidr.IndexOf('/', slash + 1) >= 0) throw new FormatException("CIDR must be address/prefix: '" + cidr + "'");
        byte[] net = ParseIp(cidr[..slash]);
        string p = cidr[(slash + 1)..];
        if (p.Length == 0 || p.Length > 3 || !p.All(c => c is >= '0' and <= '9') || (p.Length > 1 && p[0] == '0'))
            throw new FormatException("invalid CIDR prefix: '" + cidr + "'");
        int prefix = int.Parse(p, CultureInfo.InvariantCulture);
        if (prefix > net.Length * 8) throw new FormatException("CIDR prefix too long: '" + cidr + "'");
        for (int bit = prefix; bit < net.Length * 8; bit++)
            if ((net[bit / 8] & (0x80 >> (bit % 8))) != 0) throw new FormatException("CIDR has host bits set: '" + cidr + "'");
        return (net, prefix);
    }

    private static bool PrefixEqual(byte[] a, byte[] b, int prefix) {
        if (a.Length != b.Length) return false;
        for (int bit = 0; bit < prefix; bit++) {
            int mask = 0x80 >> (bit % 8);
            if ((a[bit / 8] & mask) != (b[bit / 8] & mask)) return false;
        }
        return true;
    }

    private static bool IsMapped(byte[] b) {
        for (int i = 0; i < 10; i++) if (b[i] != 0) return false;
        return b[10] == 0xff && b[11] == 0xff;
    }

    private static byte[]? ParseV4(string s) {
        string[] parts = s.Split('.');
        if (parts.Length != 4) return null;
        var o = new byte[4];
        for (int i = 0; i < 4; i++) {
            string p = parts[i];
            if (p.Length is 0 or > 3 || !p.All(c => c is >= '0' and <= '9') || (p.Length > 1 && p[0] == '0')) return null;
            int v = int.Parse(p, CultureInfo.InvariantCulture);
            if (v > 255) return null;
            o[i] = (byte)v;
        }
        return o;
    }

    private static byte[]? ParseV6(string s) {
        int doubles = 0;
        for (int i = s.IndexOf("::", StringComparison.Ordinal); i >= 0; i = s.IndexOf("::", i + 2, StringComparison.Ordinal)) doubles++;
        if (doubles > 1 || s.Length == 0) return null;
        foreach (char c in s) if (!(Uri.IsHexDigit(c) || c == ':' || c == '.')) return null;
        byte[] tail = Array.Empty<byte>();
        if (s.Contains('.')) {
            int i = s.LastIndexOf(':');
            byte[]? v4 = ParseV4(s[(i + 1)..]);
            if (v4 is null) return null;
            tail = v4;
            s = i >= 1 && s[i - 1] == ':' ? s[..(i + 1)] : s[..i];
        }
        int need = tail.Length > 0 ? 6 : 8;
        List<int>? groups;
        int dc = s.IndexOf("::", StringComparison.Ordinal);
        if (dc >= 0) {
            List<int>? a = Groups(s[..dc]), b = Groups(s[(dc + 2)..]);
            if (a is null || b is null || a.Count + b.Count > need - 1) return null;
            groups = new List<int>(a);
            groups.AddRange(Enumerable.Repeat(0, need - a.Count - b.Count));
            groups.AddRange(b);
        } else {
            groups = Groups(s);
            if (groups is null || groups.Count != need) return null;
        }
        var o = new byte[16];
        for (int i = 0; i < groups.Count; i++) { o[2 * i] = (byte)(groups[i] >> 8); o[2 * i + 1] = (byte)groups[i]; }
        tail.CopyTo(o, 12);
        return o;
    }

    private static List<int>? Groups(string x) {
        var result = new List<int>();
        if (x.Length == 0) return result;
        foreach (string h in x.Split(':')) {
            if (h.Length is 0 or > 4 || !h.All(Uri.IsHexDigit)) return null;
            result.Add(int.Parse(h, NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture));
        }
        return result;
    }

    private static string Format(byte[] b) {
        if (b.Length == 4) return string.Join('.', b.Select(x => x.ToString(CultureInfo.InvariantCulture)));
        if (IsMapped(b)) return "::ffff:" + string.Join('.', b[12..].Select(x => x.ToString(CultureInfo.InvariantCulture)));
        var g = new int[8];
        for (int i = 0; i < 8; i++) g[i] = (b[2 * i] << 8) | b[2 * i + 1];
        int best = -1, bestLen = 1;
        for (int i = 0; i < 8;) {
            if (g[i] != 0) { i++; continue; }
            int j = i;
            while (j < 8 && g[j] == 0) j++;
            if (j - i > bestLen) { best = i; bestLen = j - i; }
            i = j;
        }
        string Hex(IEnumerable<int> xs) => string.Join(':', xs.Select(x => x.ToString("x", CultureInfo.InvariantCulture)));
        if (best < 0) return Hex(g);
        return Hex(g[..best]) + "::" + Hex(g[(best + bestLen)..]);
    }

    private static (byte[], int)[] Ranges(params string[] cidrs) => cidrs.Select(ParseCidr).ToArray();
}
