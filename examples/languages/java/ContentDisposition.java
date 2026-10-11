// SPDX-License-Identifier: Apache-2.0

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Content-Disposition (RFC 6266 + RFC 8187): build a safe attachment/inline header, parse one, and sanitize file names.
 * Malformed headers throw IllegalArgumentException.
 */
public final class ContentDisposition {
    private ContentDisposition() {}

    /** A parsed header: lowercased type, sanitized file name (filename* preferred) or null, and raw parameters. */
    public record Disposition(String type, String filename, LinkedHashMap<String, String> params) {}

    private static final Pattern TYPE = Pattern.compile("\\s*([!#$%&'*+\\-.^_`|~0-9A-Za-z]+)\\s*", Pattern.UNICODE_CHARACTER_CLASS);
    private static final Pattern TOKEN = Pattern.compile("[!#$%&'*+\\-.^_`|~0-9A-Za-z]+");
    private static final Pattern UNQUOTED = Pattern.compile("[^;\\s]*", Pattern.UNICODE_CHARACTER_CLASS);
    private static final Pattern EXT = Pattern.compile("([A-Za-z0-9!#$&+\\-^_`{}~]+)'([A-Za-z0-9-]*)'(.*)", Pattern.UNIX_LINES);
    private static final Pattern BAD_PCT = Pattern.compile("%(?![0-9A-Fa-f]{2})");
    private static final String ATTR = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$&+-.^_`|~";

    /** Replaces / \ " and control characters with '_', trims spaces and dots at both ends; empty becomes "download". */
    public static String sanitizeFilename(String name) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < name.length(); i++) {
            char c = name.charAt(i);
            sb.append(c == '/' || c == '\\' || c == '"' || c < 0x20 || c == 0x7f ? '_' : c);
        }
        int a = 0;
        int b = sb.length();
        while (a < b && (sb.charAt(a) == ' ' || sb.charAt(a) == '.')) a++;
        while (b > a && (sb.charAt(b - 1) == ' ' || sb.charAt(b - 1) == '.')) b--;
        String out = sb.substring(a, b);
        return out.isEmpty() ? "download" : out;
    }

    /** Builds an attachment header for the sanitized file name. */
    public static String buildContentDisposition(String filename) { return buildContentDisposition(filename, false); }

    /** Builds an attachment (or inline) header; non-ASCII names get an ASCII fallback plus filename*=UTF-8''. */
    public static String buildContentDisposition(String filename, boolean inline) {
        String name = sanitizeFilename(filename);
        String kind = inline ? "inline" : "attachment";
        boolean ascii = true;
        for (int i = 0; i < name.length(); i++) if (name.charAt(i) < 0x20 || name.charAt(i) >= 0x7f) ascii = false;
        if (ascii) return kind + "; filename=\"" + name + "\"";
        StringBuilder fallback = new StringBuilder();
        StringBuilder enc = new StringBuilder();
        name.codePoints().forEach(cp -> {
            fallback.append(cp >= 0x20 && cp < 0x7f ? (char) cp : '_');
            if (cp < 128 && ATTR.indexOf(cp) >= 0) enc.append((char) cp);
            else for (byte x : new String(Character.toChars(cp)).getBytes(StandardCharsets.UTF_8)) enc.append(String.format("%%%02X", x & 0xff));
        });
        return kind + "; filename=\"" + fallback + "\"; filename*=UTF-8''" + enc;
    }

    /** Parses a Content-Disposition header value. */
    public static Disposition parseContentDisposition(String s) {
        Matcher m = TYPE.matcher(s);
        if (!m.lookingAt()) throw new IllegalArgumentException("missing disposition type");
        String kind = m.group(1).toLowerCase(Locale.ROOT);
        int i = m.end();
        int n = s.length();
        LinkedHashMap<String, String> params = new LinkedHashMap<>();
        while (i < n) {
            if (s.charAt(i) != ';') throw new IllegalArgumentException("expected ;");
            i++;
            while (i < n && (s.charAt(i) == ' ' || s.charAt(i) == '\t')) i++;
            if (i >= n) break;
            Matcher t = TOKEN.matcher(s).region(i, n);
            if (!t.lookingAt()) throw new IllegalArgumentException("expected parameter");
            String name = t.group().toLowerCase(Locale.ROOT);
            i = t.end();
            while (i < n && (s.charAt(i) == ' ' || s.charAt(i) == '\t')) i++;
            if (i >= n || s.charAt(i) != '=') throw new IllegalArgumentException("expected =");
            i++;
            while (i < n && (s.charAt(i) == ' ' || s.charAt(i) == '\t')) i++;
            String val;
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
            while (i < n && (s.charAt(i) == ' ' || s.charAt(i) == '\t')) i++;
            if (name.endsWith("*")) params.put(name.substring(0, name.length() - 1), extValue(val));
            else if (!params.containsKey(name)) params.put(name, val);
        }
        String fn = params.get("filename");
        return new Disposition(kind, fn == null ? null : sanitizeFilename(fn), params);
    }

    private static String extValue(String v) {
        Matcher m = EXT.matcher(v);
        if (!m.matches()) throw new IllegalArgumentException("bad extended value");
        String cs = m.group(1).toLowerCase(Locale.ROOT);
        if (!cs.equals("utf-8") && !cs.equals("iso-8859-1")) throw new IllegalArgumentException("bad extended value");
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
}
