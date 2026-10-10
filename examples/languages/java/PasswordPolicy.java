// SPDX-License-Identifier: Apache-2.0
import java.util.ArrayList;
import java.util.List;

/**
 * NIST SP 800-63B style password checks without composition rules. Use a large breached-password list as the
 * blocklist, allow every printable character (spaces and emoji included), never truncate, and rate-limit attempts.
 */
public final class PasswordPolicy {
    private static final String ALNUM = "0123456789abcdefghijklmnopqrstuvwxyz";
    private static final String ALNUM_REVERSED = new StringBuilder(ALNUM).reverse().toString();

    private PasswordPolicy() {}

    /** Check options. Build with the fluent setters. */
    public static final class Options {
        int minLength = 15;
        int maxLength = 64;
        final List<String> blocklist = new ArrayList<>();
        final List<String> context = new ArrayList<>();

        public Options minLength(int v) { minLength = v; return this; }
        public Options maxLength(int v) { maxLength = v; return this; }
        public Options blocklist(List<String> v) { blocklist.addAll(v); return this; }
        /** User-specific words (name, email local part, service name); entries shorter than 4 characters are ignored. */
        public Options context(List<String> v) { context.addAll(v); return this; }
    }

    /** ok is true when failures is empty; failures are in a fixed order. */
    public record Result(boolean ok, List<String> failures) {}

    private static String asciiLower(String s) {
        StringBuilder out = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            out.append(c >= 'A' && c <= 'Z' ? (char) (c + 32) : c);
        }
        return out.toString();
    }

    private static boolean isControl(int cp) { return cp < 0x20 || (cp >= 0x7f && cp <= 0x9f); }

    public static Result checkPassword(String password) { return checkPassword(password, new Options()); }

    /** Failures: too-short, too-long, control-characters, blocklisted, contains-context, repetitive (lengths in code points). */
    public static Result checkPassword(String password, Options o) {
        if (o.minLength < 1 || o.maxLength < o.minLength) throw new IllegalArgumentException("need 1 <= minLength <= maxLength");
        int[] cps = password.codePoints().toArray();
        List<String> fails = new ArrayList<>();
        if (cps.length < o.minLength) fails.add("too-short");
        if (cps.length > o.maxLength) fails.add("too-long");
        for (int cp : cps) if (isControl(cp)) { fails.add("control-characters"); break; }
        String low = asciiLower(password);
        for (String b : o.blocklist) if (low.equals(asciiLower(b))) { fails.add("blocklisted"); break; }
        for (String c : o.context) {
            if (c.codePointCount(0, c.length()) >= 4 && low.contains(asciiLower(c))) { fails.add("contains-context"); break; }
        }
        if (repetitive(cps)) fails.add("repetitive");
        return new Result(fails.isEmpty(), List.copyOf(fails));
    }

    private static boolean repetitive(int[] cps) {
        for (int i = 0; i + 4 <= cps.length; i++) {
            if (cps[i] == cps[i + 1] && cps[i] == cps[i + 2] && cps[i] == cps[i + 3]) return true;
            StringBuilder w = new StringBuilder();
            boolean alnum = true;
            for (int k = i; k < i + 4; k++) {
                int c = cps[k] >= 'A' && cps[k] <= 'Z' ? cps[k] + 32 : cps[k];
                if (c > 0x7f || ALNUM.indexOf(c) < 0) { alnum = false; break; }
                w.append((char) c);
            }
            if (alnum && (ALNUM.contains(w) || ALNUM_REVERSED.contains(w))) return true;
        }
        return false;
    }
}
