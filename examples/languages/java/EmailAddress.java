// SPDX-License-Identifier: Apache-2.0
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * WHATWG HTML "valid e-mail address" syntax (ASCII only), at most 254 characters with a local part of at most 64.
 * This checks syntax only: "user.@example.com" and "a@b" are valid. Ownership needs a confirmation email.
 */
public final class EmailAddress {
    private static final String LABEL = "[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?";
    private static final Pattern EMAIL = Pattern.compile("[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@" + LABEL + "(?:\\." + LABEL + ")*");

    private EmailAddress() {}

    public static boolean emailValid(String s) {
        if (s == null || s.length() > 254 || !EMAIL.matcher(s).matches()) return false;
        return s.indexOf('@') <= 64;
    }

    private static boolean asciiSpace(char c) { return c == ' ' || c == '\t' || c == '\n' || c == '\f' || c == '\r'; }

    /** Trims ASCII whitespace, validates and lowercases the domain; the local part keeps its case. */
    public static String emailNormalize(String s) {
        if (s == null) throw new IllegalArgumentException("email is required");
        int a = 0;
        int b = s.length();
        while (a < b && asciiSpace(s.charAt(a))) a++;
        while (b > a && asciiSpace(s.charAt(b - 1))) b--;
        String t = s.substring(a, b);
        if (!emailValid(t)) throw new IllegalArgumentException("invalid email address");
        int at = t.indexOf('@');
        return t.substring(0, at + 1) + t.substring(at + 1).toLowerCase(Locale.ROOT);
    }
}
