// SPDX-License-Identifier: Apache-2.0
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** RFC 3986 section 6 normalization for http/https URLs (hand-parsed; no java.net.URI). */
public final class UrlNormalize {
    private static final Pattern URL = Pattern.compile("([A-Za-z][A-Za-z0-9+.-]*)://([^/?#]*)([^?#]*)(\\?[^#]*)?(#.*)?", Pattern.DOTALL);
    private static final Pattern AUTHORITY = Pattern.compile("(\\[[0-9A-Fa-f:.]+\\]|[A-Za-z0-9.-]+)(?::([0-9]*))?");
    private static final String UNRESERVED = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

    private UrlNormalize() {}

    /** RFC 3986 5.2.4 remove_dot_segments. */
    public static String removeDotSegments(String path) {
        if (path == null) throw new IllegalArgumentException("path is required");
        String in = path;
        StringBuilder out = new StringBuilder();
        while (!in.isEmpty()) {
            if (in.startsWith("../")) in = in.substring(3);
            else if (in.startsWith("./")) in = in.substring(2);
            else if (in.startsWith("/./")) in = "/" + in.substring(3);
            else if (in.equals("/.")) in = "/";
            else if (in.startsWith("/../") || in.equals("/..")) {
                in = "/" + in.substring(in.equals("/..") ? 3 : 4);
                int i = out.lastIndexOf("/");
                out.setLength(Math.max(i, 0));
            } else if (in.equals(".") || in.equals("..")) in = "";
            else {
                int i = in.indexOf('/', in.startsWith("/") ? 1 : 0);
                if (i < 0) { out.append(in); in = ""; }
                else { out.append(in, 0, i); in = in.substring(i); }
            }
        }
        return out.toString();
    }

    private static int hex(char c) {
        if (c >= '0' && c <= '9') return c - '0';
        if (c >= 'a' && c <= 'f') return c - 'a' + 10;
        if (c >= 'A' && c <= 'F') return c - 'A' + 10;
        return -1;
    }

    private static String normalizePercent(String s) {
        StringBuilder out = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c != '%') { out.append(c); continue; }
            if (i + 2 >= s.length()) throw new IllegalArgumentException("invalid percent-encoding");
            int hi = hex(s.charAt(i + 1)), lo = hex(s.charAt(i + 2));
            if (hi < 0 || lo < 0) throw new IllegalArgumentException("invalid percent-encoding");
            char decoded = (char) (hi * 16 + lo);
            if (UNRESERVED.indexOf(decoded) >= 0) out.append(decoded);
            else out.append('%').append(s.substring(i + 1, i + 3).toUpperCase(Locale.ROOT));
            i += 2;
        }
        return out.toString();
    }

    /** Normalized http(s) URL: lower-case scheme/host, default port removed, percent-encoding normalized, dot segments removed, fragment dropped. */
    public static String normalizeUrl(String text) {
        if (text == null) throw new IllegalArgumentException("url is required");
        for (int i = 0; i < text.length(); i++) if (text.charAt(i) <= 0x20 || text.charAt(i) == 0x7f) throw new IllegalArgumentException("url contains whitespace or control characters");
        Matcher m = URL.matcher(text);
        if (!m.matches()) throw new IllegalArgumentException("url must be scheme://authority...");
        String scheme = m.group(1).toLowerCase(Locale.ROOT);
        String auth = m.group(2);
        if (!scheme.equals("http") && !scheme.equals("https")) throw new IllegalArgumentException("scheme must be http or https");
        if (auth.indexOf('@') >= 0) throw new IllegalArgumentException("userinfo is not allowed");
        Matcher hm = AUTHORITY.matcher(auth);
        if (!hm.matches()) throw new IllegalArgumentException("invalid host");
        String host = hm.group(1).toLowerCase(Locale.ROOT);
        if (host.startsWith("[")) host = "[" + IpCidr.canonicalIp(host.substring(1, host.length() - 1)) + "]";
        String port = hm.group(2);
        if (port != null && port.isEmpty()) port = null;
        if (port != null) {
            String digits = port.replaceFirst("^0+(?=.)", "");
            if (digits.length() > 5 || Integer.parseInt(digits) > 65535) throw new IllegalArgumentException("port out of range");
            int p = Integer.parseInt(digits);
            port = (scheme.equals("http") && p == 80) || (scheme.equals("https") && p == 443) ? null : String.valueOf(p);
        }
        String path = removeDotSegments(normalizePercent(m.group(3)));
        if (path.isEmpty()) path = "/";
        String query = m.group(4) == null ? "" : normalizePercent(m.group(4));
        if (query.equals("?")) query = "";
        return scheme + "://" + host + (port == null ? "" : ":" + port) + path + query;
    }
}
