// SPDX-License-Identifier: Apache-2.0

import java.util.Locale;

/**
 * Roman numerals 1..3999 in standard subtractive form. Parsing is case-insensitive and accepts only the canonical
 * form (so "IIII", "IC" and "VX" are rejected). Every failure throws IllegalArgumentException.
 */
public final class RomanNumerals {
    private static final int[] VALUES = {1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1};
    private static final String[] SYMBOLS = {"M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"};

    private RomanNumerals() {}

    /** Formats 1..3999 as an upper-case Roman numeral. */
    public static String toRoman(int n) {
        if (n < 1 || n > 3999) throw new IllegalArgumentException("out of range");
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < VALUES.length; i++) while (n >= VALUES[i]) { out.append(SYMBOLS[i]); n -= VALUES[i]; }
        return out.toString();
    }

    private static int value(char c) {
        switch (c) {
            case 'I': return 1;
            case 'V': return 5;
            case 'X': return 10;
            case 'L': return 50;
            case 'C': return 100;
            case 'D': return 500;
            case 'M': return 1000;
            default: return 0;
        }
    }

    /** Parses a canonical Roman numeral (any case) to its value. */
    public static int fromRoman(String s) {
        String u = s.toUpperCase(Locale.ROOT);
        if (u.isEmpty()) throw new IllegalArgumentException("not a roman numeral");
        for (int i = 0; i < u.length(); i++) if (value(u.charAt(i)) == 0) throw new IllegalArgumentException("not a roman numeral");
        int total = 0;
        for (int i = 0; i < u.length(); i++) {
            int v = value(u.charAt(i));
            total += i + 1 < u.length() && value(u.charAt(i + 1)) > v ? -v : v;
        }
        if (total < 1 || total > 3999 || !toRoman(total).equals(u)) throw new IllegalArgumentException("not a canonical roman numeral");
        return total;
    }
}
