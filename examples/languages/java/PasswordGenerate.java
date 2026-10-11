// SPDX-License-Identifier: Apache-2.0

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.function.IntSupplier;

/**
 * Password and passphrase generation with an injected byte source (nextByte returns 0..255) so results are
 * reproducible in tests; the overloads without nextByte use java.security.SecureRandom (never java.util.Random).
 * Classes: "lower", "upper", "digits", "symbols" (!#$%&*+-=?@^_~). One character per class in class order, the rest
 * from the union, then a Fisher-Yates shuffle; indexes use unbiased rejection sampling. Bad arguments throw
 * IllegalArgumentException.
 */
public final class PasswordGenerate {
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final IntSupplier SECURE_BYTE = () -> RANDOM.nextInt(256);
    private static final List<String> ALL_CLASSES = List.of("lower", "upper", "digits", "symbols");

    private PasswordGenerate() {}

    private static String alphabet(String cls) {
        switch (cls) {
            case "lower": return "abcdefghijklmnopqrstuvwxyz";
            case "upper": return "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
            case "digits": return "0123456789";
            case "symbols": return "!#$%&*+-=?@^_~";
            default: return null;
        }
    }

    /** Unbiased index in [0, n) from big-endian bytes of nextByte by rejection sampling. */
    public static int randomIndex(int n, IntSupplier nextByte) {
        if (n < 1) throw new IllegalArgumentException("n must be positive");
        if (n == 1) return 0;
        int k = 1;
        long range = 256;
        while (range < n) { k++; range *= 256; }
        long limit = (range / n) * n;
        while (true) {
            long x = 0;
            for (int i = 0; i < k; i++) x = x * 256 + nextByte.getAsInt();
            if (x < limit) return (int) (x % n);
        }
    }

    /** A 16-character password from all four classes using SecureRandom. */
    public static String generatePassword() { return generatePassword(16, ALL_CLASSES, SECURE_BYTE, false); }

    /** A password of length from the given classes using SecureRandom. */
    public static String generatePassword(int length, List<String> classes, boolean excludeAmbiguous) {
        return generatePassword(length, classes, SECURE_BYTE, excludeAmbiguous);
    }

    /** A password with one character per class, union fill and Fisher-Yates shuffle; excludeAmbiguous drops "Il1O0o". */
    public static String generatePassword(int length, List<String> classes, IntSupplier nextByte, boolean excludeAmbiguous) {
        if (classes.isEmpty() || new HashSet<>(classes).size() != classes.size()) throw new IllegalArgumentException("bad classes");
        for (String c : classes) if (alphabet(c) == null) throw new IllegalArgumentException("bad classes");
        if (length < classes.size() || length > 1024) throw new IllegalArgumentException("bad length");
        List<String> alph = new ArrayList<>();
        for (String c : classes) {
            StringBuilder a = new StringBuilder();
            for (char ch : alphabet(c).toCharArray()) if (!(excludeAmbiguous && "Il1O0o".indexOf(ch) >= 0)) a.append(ch);
            alph.add(a.toString());
        }
        char[] out = new char[length];
        int pos = 0;
        for (String a : alph) out[pos++] = a.charAt(randomIndex(a.length(), nextByte));
        String union = String.join("", alph);
        while (pos < length) out[pos++] = union.charAt(randomIndex(union.length(), nextByte));
        for (int i = length - 1; i > 0; i--) {
            int j = randomIndex(i + 1, nextByte);
            char t = out[i];
            out[i] = out[j];
            out[j] = t;
        }
        return new String(out);
    }

    /** A passphrase of count words joined by separator using SecureRandom. */
    public static String generatePassphrase(List<String> words, int count, String separator) {
        return generatePassphrase(words, count, separator, SECURE_BYTE);
    }

    /** A passphrase of count (1..64) words picked uniformly from at least 2 distinct non-empty words. */
    public static String generatePassphrase(List<String> words, int count, String separator, IntSupplier nextByte) {
        if (count < 1 || count > 64 || new HashSet<>(words).size() < 2 || words.contains("")) throw new IllegalArgumentException("bad arguments");
        List<String> picked = new ArrayList<>();
        for (int i = 0; i < count; i++) picked.add(words.get(randomIndex(words.size(), nextByte)));
        return String.join(separator, picked);
    }

    /** length * log2(alphabetSize), rounded half-even to 2 decimals. */
    public static double entropyBits(int alphabetSize, int length) {
        double bits = length * (Math.log(alphabetSize) / Math.log(2));
        return new BigDecimal(bits).setScale(2, RoundingMode.HALF_EVEN).doubleValue();
    }
}
