// SPDX-License-Identifier: Apache-2.0
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Campaign (UTM) links: build, parse and strip click-tracking parameters. No network access. */
public final class UtmLinks {
    /** UTM keys (without utm_) in output order. */
    public static final List<String> UTM_KEYS = List.of("id", "source", "medium", "campaign", "term", "content");
    /** Non-UTM click identifiers removed by stripTracking. */
    public static final List<String> TRACKING_PARAMS = List.of("gclid", "gbraid", "wbraid", "fbclid", "msclkid", "ttclid",
        "twclid", "li_fat_id", "mc_cid", "mc_eid", "_hsenc", "_hsmi", "yclid", "igshid");

    private UtmLinks() {}

    /** Campaign values; source, medium and campaign are required, the others may be null. */
    public record Utm(String source, String medium, String campaign, String term, String content, String id) {
        public static Utm of(String source, String medium, String campaign) { return new Utm(source, medium, campaign, null, null, null); }
    }

    private static final class Parts {
        final String base;
        final String query;
        final String fragment;

        Parts(String url) {
            int hash = url.indexOf('#');
            String rest = hash < 0 ? url : url.substring(0, hash);
            fragment = hash < 0 ? null : url.substring(hash + 1);
            int q = rest.indexOf('?');
            base = q < 0 ? rest : rest.substring(0, q);
            query = q < 0 ? null : rest.substring(q + 1);
        }

        List<String> params() {
            List<String> out = new ArrayList<>();
            if (query != null) for (String p : query.split("&", -1)) if (!p.isEmpty()) out.add(p);
            return out;
        }

        String join(List<String> params) {
            StringBuilder out = new StringBuilder(base);
            if (!params.isEmpty()) out.append('?').append(String.join("&", params));
            if (fragment != null) out.append('#').append(fragment);
            return out.toString();
        }
    }

    private static String rawKey(String param) {
        int eq = param.indexOf('=');
        return eq < 0 ? param : param.substring(0, eq);
    }

    /** Percent-encodes UTF-8, keeping RFC 3986 unreserved characters. */
    public static String percentEncode(String value) {
        StringBuilder out = new StringBuilder();
        for (byte b : value.getBytes(StandardCharsets.UTF_8)) {
            int c = b & 0xff;
            if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' || c == '.' || c == '_' || c == '~')
                out.append((char) c);
            else out.append(String.format(Locale.ROOT, "%%%02X", c));
        }
        return out.toString();
    }

    /** Decodes %XX and + (as space) into UTF-8; malformed input throws. */
    public static String percentDecode(String value) {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c == '+') bytes.write(' ');
            else if (c == '%') {
                int hi = i + 1 < value.length() ? Character.digit(value.charAt(i + 1), 16) : -1;
                int lo = i + 2 < value.length() ? Character.digit(value.charAt(i + 2), 16) : -1;
                if (hi < 0 || lo < 0) throw new IllegalArgumentException("malformed percent-encoding in " + value);
                bytes.write(hi * 16 + lo);
                i += 2;
            } else {
                byte[] enc = String.valueOf(c).getBytes(StandardCharsets.UTF_8);
                if (Character.isHighSurrogate(c) && i + 1 < value.length()) { enc = value.substring(i, i + 2).getBytes(StandardCharsets.UTF_8); i++; }
                bytes.write(enc, 0, enc.length);
            }
        }
        try {
            return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes.toByteArray())).toString();
        } catch (CharacterCodingException e) {
            throw new IllegalArgumentException("percent-encoded value is not UTF-8: " + value, e);
        }
    }

    private static void validateBase(String url) {
        boolean ok = url != null;
        if (ok) {
            String lower = url.toLowerCase(Locale.ROOT);
            String rest = lower.startsWith("https://") ? lower.substring(8) : lower.startsWith("http://") ? lower.substring(7) : null;
            ok = rest != null && !rest.isEmpty() && "/?#".indexOf(rest.charAt(0)) < 0;
            for (int i = 0; ok && i < url.length(); i++)
                if (Character.isWhitespace(url.charAt(i)) || Character.isISOControl(url.charAt(i))) ok = false;
        }
        if (!ok) throw new IllegalArgumentException("base URL must be an absolute http(s) URL: " + url);
    }

    /** Appends, or replaces in place, utm_* parameters (trimmed, lowercased), keeping the fragment last. */
    public static String buildUtmUrl(String baseUrl, Utm utm) {
        validateBase(baseUrl);
        if (utm == null) throw new IllegalArgumentException("utm is required");
        String[][] required = {{"source", utm.source()}, {"medium", utm.medium()}, {"campaign", utm.campaign()}};
        for (String[] r : required)
            if (r[1] == null || r[1].trim().isEmpty()) throw new IllegalArgumentException(r[0] + " is required");
        String[] values = {utm.id(), utm.source(), utm.medium(), utm.campaign(), utm.term(), utm.content()};
        Parts parts = new Parts(baseUrl);
        List<String> out = parts.params();
        for (int k = 0; k < values.length; k++) {
            if (values[k] == null || values[k].trim().isEmpty()) continue;
            String key = "utm_" + UTM_KEYS.get(k);
            String param = key + "=" + percentEncode(values[k].trim().toLowerCase(Locale.ROOT));
            int pos = -1;
            for (int i = 0; i < out.size(); i++) if (rawKey(out.get(i)).equals(key)) { pos = i; break; }
            if (pos < 0) { out.add(param); continue; }
            out.set(pos, param);
            for (int i = out.size() - 1; i > pos; i--) if (rawKey(out.get(i)).equals(key)) out.remove(i);
        }
        return parts.join(out);
    }

    /** Present UTM values keyed without utm_, in id, source, medium, campaign, term, content order; first wins. */
    public static Map<String, String> parseUtm(String url) {
        if (url == null) throw new IllegalArgumentException("url is required");
        String[] found = new String[UTM_KEYS.size()];
        for (String p : new Parts(url).params()) {
            int eq = p.indexOf('=');
            String key = percentDecode(eq < 0 ? p : p.substring(0, eq));
            if (!key.startsWith("utm_")) continue;
            int slot = UTM_KEYS.indexOf(key.substring(4));
            if (slot >= 0 && found[slot] == null) found[slot] = percentDecode(eq < 0 ? "" : p.substring(eq + 1));
        }
        Map<String, String> out = new LinkedHashMap<>();
        for (int i = 0; i < found.length; i++) if (found[i] != null) out.put(UTM_KEYS.get(i), found[i]);
        return out;
    }

    /** Removes utm_* and known click identifiers, keeping other parameters in order and the fragment. */
    public static String stripTracking(String url) {
        if (url == null) throw new IllegalArgumentException("url is required");
        Parts parts = new Parts(url);
        List<String> kept = new ArrayList<>();
        for (String p : parts.params()) {
            String k = rawKey(p);
            if (!k.startsWith("utm_") && !TRACKING_PARAMS.contains(k)) kept.add(p);
        }
        return parts.join(kept);
    }
}
