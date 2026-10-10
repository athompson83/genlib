// SPDX-License-Identifier: Apache-2.0
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/** RFC 6350 vCard 4.0 export with TEXT escaping, validated EMAIL/TEL/URL values and 75-octet line folding. */
public final class VCard {
    private static final Pattern CONTROL = Pattern.compile("[\\x00-\\x09\\x0b-\\x1f\\x7f]");
    private static final Pattern TYPE = Pattern.compile("[a-z][a-z0-9-]*");
    private static final Pattern EMAIL = Pattern.compile("[^\\s@]+@[^\\s@]+", Pattern.UNICODE_CHARACTER_CLASS);
    private static final Pattern TEL = Pattern.compile("\\+?[0-9][0-9 ().-]{1,30}");
    private static final Pattern URL = Pattern.compile("https?://\\S+", Pattern.UNICODE_CHARACTER_CLASS);

    private VCard() {}

    /** One typed value (EMAIL or TEL); type may be null. */
    public record Typed(String value, String type) {}

    /** Structured name (N); null components are written empty. */
    public record Name(String family, String given, String additional, String prefix, String suffix) {}

    /** ADR components; type may be null and null components are written empty. Build with the fluent setters. */
    public static final class Address {
        String type;
        String poBox;
        String extended;
        String street;
        String locality;
        String region;
        String postalCode;
        String country;

        public Address type(String v) { type = v; return this; }
        public Address poBox(String v) { poBox = v; return this; }
        public Address extended(String v) { extended = v; return this; }
        public Address street(String v) { street = v; return this; }
        public Address locality(String v) { locality = v; return this; }
        public Address region(String v) { region = v; return this; }
        public Address postalCode(String v) { postalCode = v; return this; }
        public Address country(String v) { country = v; return this; }
    }

    /** A contact; fn is required. Build with the fluent setters. */
    public static final class Contact {
        String fn;
        Name n;
        String org;
        String title;
        final List<Typed> emails = new ArrayList<>();
        final List<Typed> phones = new ArrayList<>();
        Address address;
        final List<String> urls = new ArrayList<>();
        String note;
        String uid;

        public Contact fn(String v) { fn = v; return this; }
        public Contact n(Name v) { n = v; return this; }
        public Contact org(String v) { org = v; return this; }
        public Contact title(String v) { title = v; return this; }
        public Contact email(String value, String type) { emails.add(new Typed(value, type)); return this; }
        public Contact phone(String value, String type) { phones.add(new Typed(value, type)); return this; }
        public Contact address(Address v) { address = v; return this; }
        public Contact url(String v) { urls.add(v); return this; }
        public Contact note(String v) { note = v; return this; }
        public Contact uid(String v) { uid = v; return this; }
    }

    private static String esc(String s) {
        if (s == null) return "";
        if (CONTROL.matcher(s).find()) throw new IllegalArgumentException("control characters are not allowed in vCard text");
        return s.replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;").replace("\n", "\\n");
    }

    private static String type(String t) {
        if (t == null) return "";
        if (!TYPE.matcher(t).matches()) throw new IllegalArgumentException("TYPE must match [a-z][a-z0-9-]*");
        return ";TYPE=" + t;
    }

    private static boolean present(String s) { return s != null && !s.isEmpty(); }

    /** Folds a content line at 75 octets (74 after the leading space) without splitting a UTF-8 character; adds CRLF. */
    static String fold(String line) {
        StringBuilder out = new StringBuilder();
        int used = 0;
        int limit = 75;
        for (int i = 0; i < line.length(); ) {
            int cp = line.codePointAt(i);
            String ch = new String(Character.toChars(cp));
            int size = ch.getBytes(StandardCharsets.UTF_8).length;
            if (used + size > limit) { out.append("\r\n "); used = 0; limit = 74; }
            out.append(ch);
            used += size;
            i += Character.charCount(cp);
        }
        return out.append("\r\n").toString();
    }

    /** The vCard text (CRLF line endings); throws IllegalArgumentException for a blank fn or an invalid field. */
    public static String buildVcard(Contact c) {
        if (c == null || c.fn == null || c.fn.isBlank()) throw new IllegalArgumentException("fn is required");
        List<String> lines = new ArrayList<>();
        lines.add("BEGIN:VCARD");
        lines.add("VERSION:4.0");
        lines.add("FN:" + esc(c.fn));
        if (c.n != null) lines.add("N:" + String.join(";", esc(c.n.family()), esc(c.n.given()), esc(c.n.additional()), esc(c.n.prefix()), esc(c.n.suffix())));
        if (present(c.org)) lines.add("ORG:" + esc(c.org));
        if (present(c.title)) lines.add("TITLE:" + esc(c.title));
        for (Typed e : c.emails) {
            if (e.value() == null || !EMAIL.matcher(e.value()).matches()) throw new IllegalArgumentException("invalid email");
            lines.add("EMAIL" + type(e.type()) + ":" + esc(e.value()));
        }
        for (Typed p : c.phones) {
            if (p.value() == null || !TEL.matcher(p.value()).matches()) throw new IllegalArgumentException("invalid phone number");
            lines.add("TEL" + type(p.type()) + ":" + p.value());
        }
        if (c.address != null) {
            Address a = c.address;
            lines.add("ADR" + type(a.type) + ":" + String.join(";", esc(a.poBox), esc(a.extended), esc(a.street), esc(a.locality), esc(a.region), esc(a.postalCode), esc(a.country)));
        }
        for (String u : c.urls) {
            if (u == null || !URL.matcher(u).matches()) throw new IllegalArgumentException("URL must be http(s) without whitespace");
            lines.add("URL:" + u);
        }
        if (present(c.note)) lines.add("NOTE:" + esc(c.note));
        if (present(c.uid)) lines.add("UID:" + esc(c.uid));
        lines.add("END:VCARD");
        StringBuilder out = new StringBuilder();
        for (String l : lines) out.append(fold(l));
        return out.toString();
    }
}
