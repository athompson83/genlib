// SPDX-License-Identifier: Apache-2.0
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Open-redirect guard: allows same-site paths and absolute http(s) URLs whose origin is on an allowlist. */
public final class SafeRedirect {
    private static final Pattern ABSOLUTE = Pattern.compile("([hH][tT][tT][pP][sS]?)://([A-Za-z0-9.-]+)(?::([0-9]{1,5}))?(/[^?#]*)?(\\?[^#]*)?(#.*)?");

    private SafeRedirect() {}

    /** Origin "scheme://host[:port]" (lower case, default port dropped), or null when url is not an acceptable absolute URL. */
    static String originOf(String url) {
        if (url == null) return null;
        Matcher m = ABSOLUTE.matcher(url);
        if (!m.matches()) return null;
        String scheme = m.group(1).toLowerCase(Locale.ROOT);
        String host = m.group(2).toLowerCase(Locale.ROOT);
        if (host.startsWith(".") || host.endsWith(".") || host.contains("..")) return null;
        String port = m.group(3);
        if (port != null) {
            int p = Integer.parseInt(port);
            if (p < 1 || p > 65535) return null;
            port = (scheme.equals("https") && p == 443) || (scheme.equals("http") && p == 80) ? null : String.valueOf(p);
        }
        return scheme + "://" + host + (port == null ? "" : ":" + port);
    }

    public static String safeRedirect(String target, List<String> allowedOrigins) { return safeRedirect(target, allowedOrigins, "/"); }

    /** Returns target when it is a local path (not "//") or an allowed absolute URL, otherwise fallback. */
    public static String safeRedirect(String target, List<String> allowedOrigins, String fallback) {
        if (allowedOrigins == null) throw new IllegalArgumentException("allowedOrigins is required");
        if (fallback == null) throw new IllegalArgumentException("fallback is required");
        if (target == null || target.isEmpty() || target.length() > 2048) return fallback;
        for (int i = 0; i < target.length(); i++) {
            char c = target.charAt(i);
            if (c <= 0x20 || c == 0x7f || c == '\\') return fallback;
        }
        if (target.startsWith("/")) return target.startsWith("//") ? fallback : target;
        String origin = originOf(target);
        if (origin == null) return fallback;
        for (String allowed : allowedOrigins) if (origin.equals(originOf(allowed))) return target;
        return fallback;
    }
}
