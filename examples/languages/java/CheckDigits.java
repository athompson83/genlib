// SPDX-License-Identifier: Apache-2.0
import java.util.Locale;

/** Check-digit validators: Luhn (payment cards), IBAN (ISO 13616 mod 97), GTIN/EAN/UPC and ISBN-10/13. */
public final class CheckDigits {
    private CheckDigits() {}

    private static String strip(String s) {
        StringBuilder out = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c != ' ' && c != '-') out.append(c);
        }
        return out.toString();
    }

    private static boolean allDigits(String t) {
        if (t.isEmpty()) return false;
        for (int i = 0; i < t.length(); i++) if (t.charAt(i) < '0' || t.charAt(i) > '9') return false;
        return true;
    }

    /** True when s (spaces and hyphens ignored) is at least 2 ASCII digits passing the Luhn check. */
    public static boolean luhnValid(String s) {
        if (s == null) return false;
        String t = strip(s);
        if (!allDigits(t) || t.length() < 2) return false;
        int total = 0;
        for (int i = 0; i < t.length(); i++) {
            int d = t.charAt(t.length() - 1 - i) - '0';
            if (i % 2 == 1) { d *= 2; if (d > 9) d -= 9; }
            total += d;
        }
        return total % 10 == 0;
    }

    /** The digit that makes payload + digit pass the Luhn check. */
    public static String luhnCheckDigit(String payload) {
        if (payload == null) throw new IllegalArgumentException("payload is required");
        String t = strip(payload);
        if (!allDigits(t)) throw new IllegalArgumentException("payload must contain only digits, spaces and hyphens");
        for (char d = '0'; d <= '9'; d++) if (luhnValid(t + d)) return String.valueOf(d);
        throw new IllegalStateException("unreachable");
    }

    private static String compactIban(String s) { return s.replace(" ", "").toUpperCase(Locale.ROOT); }

    /** True when s (spaces ignored, any case) is a structurally valid IBAN whose mod-97 remainder is 1. */
    public static boolean ibanValid(String s) {
        if (s == null) return false;
        String t = compactIban(s);
        if (!t.matches("[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}")) return false;
        String r = t.substring(4) + t.substring(0, 4);
        int rem = 0;
        for (int i = 0; i < r.length(); i++) {
            char c = r.charAt(i);
            int v = c <= '9' ? c - '0' : c - 'A' + 10;
            rem = (rem * (v > 9 ? 100 : 10) + v) % 97;
        }
        return rem == 1;
    }

    /** A valid IBAN in upper case, in groups of four separated by single spaces. */
    public static String ibanFormat(String s) {
        if (!ibanValid(s)) throw new IllegalArgumentException("invalid IBAN");
        String t = compactIban(s);
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < t.length(); i += 4) {
            if (i > 0) out.append(' ');
            out.append(t, i, Math.min(t.length(), i + 4));
        }
        return out.toString();
    }

    /** True for a GTIN-8/12/13/14 (EAN/UPC) with a correct check digit; spaces and hyphens ignored. */
    public static boolean gtinValid(String s) {
        if (s == null) return false;
        String t = strip(s);
        int n = t.length();
        if (!allDigits(t) || (n != 8 && n != 12 && n != 13 && n != 14)) return false;
        int total = 0;
        for (int i = 0; i < n; i++) total += (t.charAt(n - 1 - i) - '0') * (i % 2 == 1 ? 3 : 1);
        return total % 10 == 0;
    }

    /** True for an ISBN-10 (9 digits then a digit or X) with a correct check digit; spaces and hyphens ignored. */
    public static boolean isbn10Valid(String s) {
        if (s == null) return false;
        String t = strip(s).toUpperCase(Locale.ROOT);
        if (!t.matches("[0-9]{9}[0-9X]")) return false;
        int total = 0;
        for (int i = 0; i < 10; i++) {
            char c = t.charAt(i);
            total += (10 - i) * (c == 'X' ? 10 : c - '0');
        }
        return total % 11 == 0;
    }

    /** True for a 13-digit ISBN with prefix 978 or 979 and a correct GTIN check digit. */
    public static boolean isbn13Valid(String s) {
        if (s == null) return false;
        String t = strip(s);
        return t.length() == 13 && (t.startsWith("978") || t.startsWith("979")) && gtinValid(t);
    }

    /** Converts a valid ISBN-10 to its 978-prefixed ISBN-13 (digits only). */
    public static String isbn10To13(String s) {
        if (!isbn10Valid(s)) throw new IllegalArgumentException("invalid ISBN-10");
        String body = "978" + strip(s).substring(0, 9);
        for (char d = '0'; d <= '9'; d++) if (gtinValid(body + d)) return body + d;
        throw new IllegalStateException("unreachable");
    }
}
