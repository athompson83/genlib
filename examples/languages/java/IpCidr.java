// SPDX-License-Identifier: Apache-2.0
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * IP address parsing, RFC 5952 canonical text, CIDR membership and an SSRF guard (isPublicIp).
 *
 * <p>SSRF use: resolve the hostname yourself, check EVERY resolved address with isPublicIp, then
 * connect to that checked address (no second DNS lookup), and re-check after every redirect.
 * Parsing is hand-written so results do not depend on platform resolvers such as InetAddress.
 */
public final class IpCidr {
    private static final Pattern V4_PART = Pattern.compile("0|[1-9][0-9]{0,2}");
    private static final Pattern V6_CHARS = Pattern.compile("[0-9A-Fa-f:.]+");
    private static final Pattern HEX_GROUP = Pattern.compile("[0-9A-Fa-f]{1,4}");
    private static final Pattern PREFIX = Pattern.compile("0|[1-9][0-9]{0,2}");
    private static final String[] V4_SPECIAL = {"0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12",
        "192.0.0.0/24", "192.0.2.0/24", "192.88.99.0/24", "192.168.0.0/16", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4"};
    private static final String[] V6_SPECIAL = {"::/128", "::1/128", "100::/64", "2001::/23", "2001:db8::/32", "2002::/16", "fc00::/7", "fe80::/10", "ff00::/8"};

    private IpCidr() {}

    private static byte[] parseV4(String s) {
        String[] parts = s.split("\\.", -1);
        if (parts.length != 4) throw new IllegalArgumentException("invalid IPv4 address: " + s);
        byte[] out = new byte[4];
        for (int i = 0; i < 4; i++) {
            if (!V4_PART.matcher(parts[i]).matches() || Integer.parseInt(parts[i]) > 255) throw new IllegalArgumentException("invalid IPv4 address: " + s);
            out[i] = (byte) Integer.parseInt(parts[i]);
        }
        return out;
    }

    private static List<Integer> groups(String x, String original) {
        List<Integer> out = new ArrayList<>();
        if (x.isEmpty()) return out;
        for (String h : x.split(":", -1)) {
            if (!HEX_GROUP.matcher(h).matches()) throw new IllegalArgumentException("invalid IPv6 address: " + original);
            out.add(Integer.parseInt(h, 16));
        }
        return out;
    }

    private static byte[] parseV6(String original) {
        String s = original;
        int first = s.indexOf("::");
        if ((first >= 0 && s.indexOf("::", first + 1) >= 0) || !V6_CHARS.matcher(s).matches()) throw new IllegalArgumentException("invalid IPv6 address: " + original);
        byte[] tail4 = null;
        if (s.indexOf('.') >= 0) {
            int i = s.lastIndexOf(':');
            tail4 = parseV4(s.substring(i + 1));
            s = (i >= 1 && s.charAt(i - 1) == ':') ? s.substring(0, i + 1) : s.substring(0, i);
        }
        int need = tail4 == null ? 8 : 6;
        List<Integer> g;
        int dc = s.indexOf("::");
        if (dc >= 0) {
            List<Integer> a = groups(s.substring(0, dc), original);
            List<Integer> b = groups(s.substring(dc + 2), original);
            if (a.size() + b.size() > need - 1) throw new IllegalArgumentException("invalid IPv6 address: " + original);
            g = new ArrayList<>(a);
            for (int i = a.size() + b.size(); i < need; i++) g.add(0);
            g.addAll(b);
        } else {
            g = groups(s, original);
            if (g.size() != need) throw new IllegalArgumentException("invalid IPv6 address: " + original);
        }
        byte[] out = new byte[16];
        for (int i = 0; i < g.size(); i++) { out[2 * i] = (byte) (g.get(i) >> 8); out[2 * i + 1] = (byte) (int) g.get(i); }
        if (tail4 != null) System.arraycopy(tail4, 0, out, 12, 4);
        return out;
    }

    /** Parses IPv4 dotted decimal (4 bytes) or RFC 4291 IPv6 text (16 bytes); throws IllegalArgumentException otherwise. */
    public static byte[] parseIp(String text) {
        if (text == null) throw new IllegalArgumentException("ip is required");
        return text.indexOf(':') >= 0 ? parseV6(text) : parseV4(text);
    }

    private static boolean isPrefix(byte[] b, int... prefix) {
        for (int i = 0; i < prefix.length; i++) if ((b[i] & 0xff) != prefix[i]) return false;
        return true;
    }

    private static boolean isMapped(byte[] b) { return b.length == 16 && isPrefix(b, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff); }

    private static String v4Text(byte[] b, int off) {
        return (b[off] & 0xff) + "." + (b[off + 1] & 0xff) + "." + (b[off + 2] & 0xff) + "." + (b[off + 3] & 0xff);
    }

    /** RFC 5952 text for 4 or 16 address bytes. */
    public static String formatIp(byte[] b) {
        if (b == null || (b.length != 4 && b.length != 16)) throw new IllegalArgumentException("address must be 4 or 16 bytes");
        if (b.length == 4) return v4Text(b, 0);
        if (isMapped(b)) return "::ffff:" + v4Text(b, 12);
        int[] g = new int[8];
        for (int i = 0; i < 8; i++) g[i] = ((b[2 * i] & 0xff) << 8) | (b[2 * i + 1] & 0xff);
        int best = -1, bestLen = 1;
        for (int i = 0; i < 8; ) {
            if (g[i] == 0) {
                int j = i;
                while (j < 8 && g[j] == 0) j++;
                if (j - i > bestLen) { best = i; bestLen = j - i; }
                i = j;
            } else i++;
        }
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < 8; i++) {
            if (best >= 0 && i == best) { out.append("::"); i += bestLen - 1; continue; }
            if (out.length() > 0 && out.charAt(out.length() - 1) != ':') out.append(':');
            out.append(Integer.toHexString(g[i]));
        }
        return out.toString();
    }

    /** Canonical (RFC 5952) text of an IP address. */
    public static String canonicalIp(String text) { return formatIp(parseIp(text)); }

    private static boolean prefixEqual(byte[] a, byte[] b, int prefix) {
        int full = prefix / 8, rest = prefix % 8;
        for (int i = 0; i < full; i++) if (a[i] != b[i]) return false;
        if (rest == 0) return true;
        int mask = (0xff << (8 - rest)) & 0xff;
        return (a[full] & mask) == (b[full] & mask);
    }

    /** True when ip is inside cidr ("address/prefix"); different families never match. Throws on a malformed CIDR or set host bits. */
    public static boolean cidrContains(String cidr, String ip) {
        if (cidr == null) throw new IllegalArgumentException("cidr is required");
        int slash = cidr.indexOf('/');
        if (slash < 0 || cidr.indexOf('/', slash + 1) >= 0) throw new IllegalArgumentException("invalid CIDR: " + cidr);
        byte[] net = parseIp(cidr.substring(0, slash));
        String p = cidr.substring(slash + 1);
        if (!PREFIX.matcher(p).matches()) throw new IllegalArgumentException("invalid CIDR prefix: " + cidr);
        int prefix = Integer.parseInt(p);
        if (prefix > net.length * 8) throw new IllegalArgumentException("CIDR prefix too long: " + cidr);
        for (int i = prefix; i < net.length * 8; i++) if ((net[i / 8] & (0x80 >> (i % 8))) != 0) throw new IllegalArgumentException("CIDR has host bits set: " + cidr);
        byte[] x = parseIp(ip);
        if (x.length != net.length) return false;
        return prefixEqual(x, net, prefix);
    }

    /** False for loopback, private, link-local, shared, documentation, multicast, reserved and other special ranges. */
    public static boolean isPublicIp(String ip) {
        byte[] b = parseIp(ip);
        if (b.length == 16 && (isMapped(b) || isPrefix(b, 0, 0x64, 0xff, 0x9b, 0, 0, 0, 0, 0, 0, 0, 0))) return isPublicIp(v4Text(b, 12));
        String text = formatIp(b);
        for (String c : b.length == 4 ? V4_SPECIAL : V6_SPECIAL) if (cidrContains(c, text)) return false;
        return true;
    }
}
