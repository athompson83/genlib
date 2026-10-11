// SPDX-License-Identifier: Apache-2.0

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

/**
 * English number words in US style without "and" ("one hundred five", "forty-two", "one million one"), ordinal words
 * ("twenty-first"), numeric ordinal suffixes ("112th") and money amounts ("one dollar and one cent"). Out-of-range
 * input throws IllegalArgumentException.
 */
public final class NumberWords {
    private static final String[] ONES = {"zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
        "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"};
    private static final String[] TENS = {"", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"};
    private static final String[] SCALES = {"", "thousand", "million", "billion", "trillion"};
    private static final Map<String, String> IRREGULAR = Map.of("one", "first", "two", "second", "three", "third",
        "five", "fifth", "eight", "eighth", "nine", "ninth", "twelve", "twelfth");
    private static final long LIMIT = 1_000_000_000_000_000L;

    private NumberWords() {}

    private static String under1000(int n) {
        List<String> parts = new ArrayList<>();
        if (n >= 100) { parts.add(ONES[n / 100] + " hundred"); n %= 100; }
        if (n >= 20) parts.add(TENS[n / 10] + (n % 10 != 0 ? "-" + ONES[n % 10] : ""));
        else if (n > 0) parts.add(ONES[n]);
        return String.join(" ", parts);
    }

    /** Cardinal words for |n| < 10^15 ("negative " prefix for negatives). */
    public static String numberToWords(long n) {
        if (n <= -LIMIT || n >= LIMIT) throw new IllegalArgumentException("range");
        if (n == 0) return "zero";
        if (n < 0) return "negative " + numberToWords(-n);
        List<String> groups = new ArrayList<>();
        int i = 0;
        while (n > 0) {
            int g = (int) (n % 1000);
            if (g != 0) groups.add(0, under1000(g) + (SCALES[i].isEmpty() ? "" : " " + SCALES[i]));
            n /= 1000;
            i++;
        }
        return String.join(" ", groups);
    }

    private static String ordinal(String w) {
        String irr = IRREGULAR.get(w);
        if (irr != null) return irr;
        if (w.endsWith("y")) return w.substring(0, w.length() - 1) + "ieth";
        return w + "th";
    }

    /** Ordinal words for n >= 0 ("zeroth", "twenty-first", "one hundredth"). */
    public static String ordinalWords(long n) {
        if (n < 0) throw new IllegalArgumentException("range");
        List<String> words = new ArrayList<>(Arrays.asList(numberToWords(n).split(" ")));
        String last = words.get(words.size() - 1);
        int dash = last.indexOf('-');
        last = dash >= 0 ? last.substring(0, dash + 1) + ordinal(last.substring(dash + 1)) : ordinal(last);
        words.set(words.size() - 1, last);
        return String.join(" ", words);
    }

    /** The number followed by st/nd/rd/th ("1st", "11th", "-22nd"). */
    public static String ordinalSuffix(long n) {
        long a = Math.abs(n % 100);
        String s;
        if (a >= 11 && a <= 13) s = "th";
        else s = switch ((int) (a % 10)) { case 1 -> "st"; case 2 -> "nd"; case 3 -> "rd"; default -> "th"; };
        return n + s;
    }

    /** Words for an amount in minor units ("one dollar and one cent"); exponent 0..3, 0 meaning no minor unit. */
    public static String moneyWords(long minor, String major, String minorName, int exponent) {
        if (minor < 0 || exponent < 0 || exponent > 3) throw new IllegalArgumentException("bad");
        long unit = (long) Math.pow(10, exponent);
        long whole = minor / unit;
        long frac = minor % unit;
        String out = numberToWords(whole) + " " + major + (whole == 1 ? "" : "s");
        if (exponent != 0 && frac != 0) out += " and " + numberToWords(frac) + " " + minorName + (frac == 1 ? "" : "s");
        return out;
    }
}
