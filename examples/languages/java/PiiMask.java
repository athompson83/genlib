// SPDX-License-Identifier: Apache-2.0

import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Display masking of personal data for logs and UIs (not anonymization): emails, phone numbers, card numbers,
 * generic middles, and free-text redaction of emails and Luhn-valid card numbers. Emails and maskMiddle work on
 * code points. Every failure throws IllegalArgumentException.
 */
public final class PiiMask {
    private static final Pattern EMAIL = Pattern.compile("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}");
    private static final Pattern CARD = Pattern.compile("(?<![0-9])[0-9](?:[ -]?[0-9]){12,18}(?![0-9])");
    private static final Pattern COUNTRY = Pattern.compile("\\+(\\d{1,3}) ", Pattern.UNICODE_CHARACTER_CLASS);
    private static final List<String> DEFAULT_KINDS = List.of("email", "card");

    private PiiMask() {}

    private static boolean asciiDigit(int c) { return c >= '0' && c <= '9'; }

    /** "jane.doe@example.com" -> "j*******@example.com" (at least 3 '*'); needs exactly one '@' and both parts. */
    public static String maskEmail(String e) {
        int at = e.indexOf('@');
        if (at < 0 || e.indexOf('@', at + 1) >= 0) throw new IllegalArgumentException("not an email address");
        String local = e.substring(0, at);
        String domain = e.substring(at + 1);
        if (local.isEmpty() || domain.isEmpty()) throw new IllegalArgumentException("not an email address");
        int first = local.codePointAt(0);
        int len = local.codePointCount(0, local.length());
        return new StringBuilder().appendCodePoint(first).append("*".repeat(Math.max(3, len - 1))).append('@').append(domain).toString();
    }

    /** Keeps the last 4 ASCII digits (and a leading "+CC " country code), masking other digits; needs 7+ digits. */
    public static String maskPhone(String p) {
        int total = 0;
        for (int i = 0; i < p.length(); i++) if (asciiDigit(p.charAt(i))) total++;
        if (total < 7) throw new IllegalArgumentException("not a phone number");
        Matcher m = COUNTRY.matcher(p);
        int keepFront = m.lookingAt() ? m.group(1).codePointCount(0, m.group(1).length()) : 0;
        StringBuilder out = new StringBuilder();
        int seen = 0;
        for (int i = 0; i < p.length(); i++) {
            char c = p.charAt(i);
            if (asciiDigit(c)) {
                out.append(seen < keepFront || seen >= total - 4 ? c : '*');
                seen++;
            } else {
                out.append(c);
            }
        }
        return out.toString();
    }

    /** Keeps the last 4 of 12-19 digits, keeping space/hyphen separators; other characters are an error. */
    public static String maskCard(String c) {
        if (!c.matches("[0-9 -]+")) throw new IllegalArgumentException("not a card number");
        int total = 0;
        for (int i = 0; i < c.length(); i++) if (asciiDigit(c.charAt(i))) total++;
        if (total < 12 || total > 19) throw new IllegalArgumentException("not a card number");
        StringBuilder out = new StringBuilder();
        int seen = 0;
        for (int i = 0; i < c.length(); i++) {
            char ch = c.charAt(i);
            if (asciiDigit(ch)) { out.append(seen >= total - 4 ? ch : '*'); seen++; }
            else out.append(ch);
        }
        return out.toString();
    }

    /** Masks all but one code point at each end with '*'. */
    public static String maskMiddle(String s) { return maskMiddle(s, 1, 1, "*"); }

    /** Keeps keepStart/keepEnd code points and masks the rest with mask (one code point); short strings are fully masked. */
    public static String maskMiddle(String s, int keepStart, int keepEnd, String mask) {
        if (keepStart < 0 || keepEnd < 0 || mask.codePointCount(0, mask.length()) != 1) throw new IllegalArgumentException("bad arguments");
        int[] cps = s.codePoints().toArray();
        if (cps.length <= keepStart + keepEnd) return mask.repeat(cps.length);
        StringBuilder out = new StringBuilder(new String(cps, 0, keepStart));
        out.append(mask.repeat(cps.length - keepStart - keepEnd));
        out.append(new String(cps, cps.length - keepEnd, keepEnd));
        return out.toString();
    }

    private static boolean luhn(String d) {
        int s = 0;
        for (int i = 0; i < d.length(); i++) {
            int n = d.charAt(d.length() - 1 - i) - '0';
            if (i % 2 == 1) n = n * 2 > 9 ? n * 2 - 9 : n * 2;
            s += n;
        }
        return s % 10 == 0;
    }

    /** Masks emails and Luhn-valid card numbers in free text. */
    public static String redact(String text) { return redact(text, DEFAULT_KINDS); }

    /** Masks the given kinds ("email", "card") in free text; phone numbers are not detected in free text. */
    public static String redact(String text, List<String> kinds) {
        for (String k : kinds) if (!k.equals("email") && !k.equals("card")) throw new IllegalArgumentException("unsupported kind");
        if (kinds.contains("card")) {
            text = CARD.matcher(text).replaceAll(r -> {
                String g = r.group();
                return Matcher.quoteReplacement(luhn(g.replaceAll("[ -]", "")) ? maskCard(g) : g);
            });
        }
        if (kinds.contains("email")) text = EMAIL.matcher(text).replaceAll(r -> Matcher.quoteReplacement(maskEmail(r.group())));
        return text;
    }
}
