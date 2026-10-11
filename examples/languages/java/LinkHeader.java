// SPDX-License-Identifier: Apache-2.0

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * HTTP Link header (RFC 8288): parse with quoted strings and RFC 8187 extended values, find by rel, and format.
 * Malformed input throws IllegalArgumentException.
 */
public final class LinkHeader {
    private LinkHeader() {}

    /** One link: target URI and its parameters in order (names lowercased, rel lowercased and space-collapsed). */
    public record Link(String uri, LinkedHashMap<String, String> params) {}

    private static final Pattern TOKEN = Pattern.compile("[!#$%&'*+\\-.^_`|~0-9A-Za-z]+");
    private static final Pattern UNQUOTED = Pattern.compile("[^,;\\s]*", Pattern.UNICODE_CHARACTER_CLASS);
    private static final Pattern EXT = Pattern.compile("([A-Za-z0-9!#$&+\\-^_`{}~]+)'([A-Za-z0-9-]*)'(.*)", Pattern.UNIX_LINES);
    private static final Pattern BAD_PCT = Pattern.compile("%(?![0-9A-Fa-f]{2})");
    private static final String ATTR = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$&+-.^_`|~";

    private static String extValue(String v) {
        Matcher m = EXT.matcher(v);
        if (!m.matches()) throw new IllegalArgumentException("bad extended value");
        String cs = m.group(1).toLowerCase(Locale.ROOT);
        if (!cs.equals("utf-8") && !cs.equals("iso-8859-1")) throw new IllegalArgumentException("unsupported charset");
        String enc = m.group(3);
        if (BAD_PCT.matcher(enc).find()) throw new IllegalArgumentException("bad percent-encoding");
        byte[] b = enc.getBytes(StandardCharsets.UTF_8);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        for (int i = 0; i < b.length; i++) {
            if (b[i] == '%') { out.write(Integer.parseInt(new String(b, i + 1, 2, StandardCharsets.US_ASCII), 16)); i += 2; }
            else out.write(b[i]);
        }
        if (cs.equals("iso-8859-1")) return new String(out.toByteArray(), StandardCharsets.ISO_8859_1);
        try {
            return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(out.toByteArray())).toString();
        } catch (CharacterCodingException e) {
            throw new IllegalArgumentException("invalid UTF-8");
        }
    }

    /** Parses a Link header value into links in order; commas inside <...> or quotes do not split. */
    public static List<Link> parseLinkHeader(String s) {
        int i = 0;
        int n = s.length();
        List<Link> links = new ArrayList<>();
        while (true) {
            while (i < n && (s.charAt(i) == ' ' || s.charAt(i) == '\t')) i++;
            if (i >= n) break;
            if (s.charAt(i) == ',') { i++; continue; }
            if (s.charAt(i) != '<') throw new IllegalArgumentException("expected <");
            int end = s.indexOf('>', i);
            if (end < 0) throw new IllegalArgumentException("unterminated <");
            String uri = s.substring(i + 1, end);
            i = end + 1;
            LinkedHashMap<String, String> params = new LinkedHashMap<>();
            Set<String> ext = new HashSet<>();
            while (true) {
                while (i < n && (s.charAt(i) == ' ' || s.charAt(i) == '\t')) i++;
                if (i >= n || s.charAt(i) == ',') break;
                if (s.charAt(i) != ';') throw new IllegalArgumentException("expected ;");
                i++;
                while (i < n && (s.charAt(i) == ' ' || s.charAt(i) == '\t')) i++;
                Matcher m = TOKEN.matcher(s).region(i, n);
                if (!m.lookingAt()) throw new IllegalArgumentException("expected parameter name");
                String name = m.group().toLowerCase(Locale.ROOT);
                i = m.end();
                while (i < n && (s.charAt(i) == ' ' || s.charAt(i) == '\t')) i++;
                String val = "";
                if (i < n && s.charAt(i) == '=') {
                    i++;
                    while (i < n && (s.charAt(i) == ' ' || s.charAt(i) == '\t')) i++;
                    if (i < n && s.charAt(i) == '"') {
                        i++;
                        StringBuilder buf = new StringBuilder();
                        while (true) {
                            if (i >= n) throw new IllegalArgumentException("unterminated quote");
                            char c = s.charAt(i);
                            if (c == '\\' && i + 1 < n) { buf.append(s.charAt(i + 1)); i += 2; continue; }
                            if (c == '"') { i++; break; }
                            buf.append(c);
                            i++;
                        }
                        val = buf.toString();
                    } else {
                        Matcher u = UNQUOTED.matcher(s).region(i, n);
                        u.lookingAt();
                        val = u.group();
                        i = u.end();
                    }
                }
                if (name.endsWith("*")) {
                    String base = name.substring(0, name.length() - 1);
                    params.put(base, extValue(val));
                    ext.add(base);
                } else if (!ext.contains(name) && !params.containsKey(name)) params.put(name, val);
            }
            if (params.containsKey("rel")) params.put("rel", String.join(" ", words(params.get("rel").toLowerCase(Locale.ROOT))));
            links.add(new Link(uri, params));
        }
        return links;
    }

    /** First link whose rel list contains rel (case-insensitive), or null. */
    public static Link findRel(List<Link> links, String rel) {
        String want = rel.toLowerCase(Locale.ROOT);
        for (Link l : links) if (words(l.params().getOrDefault("rel", "")).contains(want)) return l;
        return null;
    }

    /** Formats links as a header value: rel always quoted, other values quoted unless tokens, non-ASCII as name*=UTF-8''. */
    public static String formatLinkHeader(List<Link> links) {
        List<String> out = new ArrayList<>();
        for (Link l : links) {
            List<String> parts = new ArrayList<>();
            parts.add("<" + l.uri() + ">");
            for (Map.Entry<String, String> e : l.params().entrySet()) {
                String k = e.getKey();
                String v = e.getValue();
                boolean plain = true;
                for (int i = 0; i < v.length(); i++) if (v.charAt(i) > 0x7e || v.charAt(i) < 0x20) plain = false;
                if (!plain) {
                    StringBuilder sb = new StringBuilder(k).append("*=UTF-8''");
                    v.codePoints().forEach(cp -> {
                        if (cp < 128 && ATTR.indexOf(cp) >= 0) sb.append((char) cp);
                        else for (byte b : new String(Character.toChars(cp)).getBytes(StandardCharsets.UTF_8)) sb.append(String.format("%%%02X", b & 0xff));
                    });
                    parts.add(sb.toString());
                } else if (TOKEN.matcher(v).matches() && !k.equals("rel")) parts.add(k + "=" + v);
                else parts.add(k + "=\"" + v.replace("\\", "\\\\").replace("\"", "\\\"") + "\"");
            }
            out.add(String.join("; ", parts));
        }
        return String.join(", ", out);
    }

    private static List<String> words(String s) {
        List<String> out = new ArrayList<>();
        for (String w : s.split("(?U)[\\s\\x1c-\\x1f]+")) if (!w.isEmpty()) out.add(w);
        return out;
    }
}
