// SPDX-License-Identifier: Apache-2.0

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** data: URLs (RFC 2397 with the WHATWG fetch rules simplified): parse to bytes and build. Errors throw IllegalArgumentException. */
public final class DataUri {
    private DataUri() {}

    /** A parsed data: URL: lowercased media type, ordered parameters, whether it was base64 and the decoded bytes. */
    public record Parsed(String mime, LinkedHashMap<String, String> params, boolean base64, byte[] data) {}

    private static final String TOKEN = "[!#$%&'*+\\-.^_`|~0-9A-Za-z]+";
    private static final Pattern MIME = Pattern.compile(TOKEN + "/" + TOKEN);
    private static final Pattern MEDIA = Pattern.compile(TOKEN + "/" + TOKEN + "(\\s*;\\s*" + TOKEN + "=[^;,\\s]+)*", Pattern.UNICODE_CHARACTER_CLASS);
    private static final Pattern B64 = Pattern.compile(";\\s*base64\\s*$", Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CHARACTER_CLASS);
    private static final String KEEP = "-_.!~*'();/?:@&=+$,";

    /** Parses a data: URL; an empty or invalid media type becomes text/plain with charset US-ASCII. */
    public static Parsed parseDataUri(String url) {
        if (url.length() < 5 || !url.substring(0, 5).toLowerCase(Locale.ROOT).equals("data:")) throw new IllegalArgumentException("not a data: URL");
        String rest = url.substring(5);
        int comma = rest.indexOf(',');
        if (comma < 0) throw new IllegalArgumentException("missing comma");
        String header = rest.substring(0, comma).strip();
        String body = rest.substring(comma + 1);
        boolean isB64 = false;
        Matcher m = B64.matcher(header);
        if (m.find()) { isB64 = true; header = header.substring(0, m.start()); }
        String[] parts = header.split(";", -1);
        String mime = parts[0].strip().toLowerCase(Locale.ROOT);
        LinkedHashMap<String, String> params = new LinkedHashMap<>();
        for (int i = 1; i < parts.length; i++) {
            int eq = parts[i].indexOf('=');
            if (eq < 0) continue;
            String k = parts[i].substring(0, eq).strip().toLowerCase(Locale.ROOT);
            if (!k.isEmpty() && !params.containsKey(k)) params.put(k, parts[i].substring(eq + 1).strip());
        }
        if (!MIME.matcher(mime).matches()) {
            mime = "text/plain";
            if (!params.containsKey("charset")) {
                LinkedHashMap<String, String> p = new LinkedHashMap<>();
                p.put("charset", "US-ASCII");
                p.putAll(params);
                params = p;
            }
        }
        byte[] data = pct(body);
        if (isB64) {
            StringBuilder s = new StringBuilder();
            for (byte b : data) if (b != '\t' && b != '\n' && b != '\f' && b != '\r' && b != ' ') s.append((char) (b & 0xff));
            int len = s.length();
            if (len >= 2 && s.charAt(len - 1) == '=' && s.charAt(len - 2) == '=') s.setLength(len - 2);
            else if (len >= 1 && s.charAt(len - 1) == '=') s.setLength(len - 1);
            if (s.length() % 4 == 1) throw new IllegalArgumentException("invalid base64");
            for (int i = 0; i < s.length(); i++) {
                char c = s.charAt(i);
                if (!((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '+' || c == '/')) throw new IllegalArgumentException("invalid base64");
            }
            data = Base64.getDecoder().decode(s.toString());
        }
        return new Parsed(mime, params, isB64, data);
    }

    /** Builds a data: URL as application/octet-stream, choosing base64 automatically. */
    public static String buildDataUri(byte[] data) { return buildDataUri(data, "application/octet-stream", null); }

    /** Builds a data: URL for the media type, choosing base64 automatically. */
    public static String buildDataUri(byte[] data, String mime) { return buildDataUri(data, mime, null); }

    /** Builds a data: URL; base64 null picks percent-encoding only for textual types whose bytes are valid UTF-8. */
    public static String buildDataUri(byte[] data, String mime, Boolean base64) {
        if (!MEDIA.matcher(mime).matches()) throw new IllegalArgumentException("invalid media type");
        boolean useB64;
        if (base64 == null) {
            String base = mime.split(";", -1)[0].strip().toLowerCase(Locale.ROOT);
            boolean textual = base.startsWith("text/") || base.endsWith("+json") || base.endsWith("+xml")
                || base.equals("application/json") || base.equals("application/xml") || base.equals("application/javascript");
            useB64 = !(textual && validUtf8(data));
        } else useB64 = base64;
        if (useB64) return "data:" + mime + ";base64," + Base64.getEncoder().encodeToString(data);
        StringBuilder sb = new StringBuilder("data:").append(mime).append(',');
        for (byte x : data) {
            int b = x & 0xff;
            if ((b >= 'A' && b <= 'Z') || (b >= 'a' && b <= 'z') || (b >= '0' && b <= '9') || (b < 128 && KEEP.indexOf(b) >= 0)) sb.append((char) b);
            else sb.append(String.format("%%%02X", b));
        }
        return sb.toString();
    }

    private static boolean validUtf8(byte[] data) {
        try {
            StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(data));
            return true;
        } catch (CharacterCodingException e) {
            return false;
        }
    }

    private static int hex(byte b) {
        if (b >= '0' && b <= '9') return b - '0';
        if (b >= 'a' && b <= 'f') return b - 'a' + 10;
        if (b >= 'A' && b <= 'F') return b - 'A' + 10;
        return -1;
    }

    private static byte[] pct(String s) {
        byte[] b = s.getBytes(StandardCharsets.UTF_8);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        int i = 0;
        while (i < b.length) {
            if (b[i] == '%' && i + 2 < b.length && hex(b[i + 1]) >= 0 && hex(b[i + 2]) >= 0) {
                out.write(hex(b[i + 1]) * 16 + hex(b[i + 2]));
                i += 3;
            } else out.write(b[i++]);
        }
        return out.toByteArray();
    }
}
