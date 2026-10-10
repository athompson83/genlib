// SPDX-License-Identifier: Apache-2.0

public final class CheckDigitsTest {
    private static int passed;
    private static int failed;

    private static void check(boolean ok, String name) {
        if (ok) passed++; else { failed++; System.err.println("FAIL: " + name); }
    }

    private static void eq(Object expected, Object actual, String name) {
        check(expected.equals(actual), name + " expected <" + expected + "> got <" + actual + ">");
    }

    private static void throwsIae(Runnable r, String name) {
        try { r.run(); check(false, name + " did not throw"); }
        catch (IllegalArgumentException e) { check(true, name); }
    }

    public static void main(String[] args) {
        Object[][] luhn = {{"4539 1488 0343 6467", true}, {"79927398713", true}, {"79927398710", false}, {"0", false}, {"4539-1488-0343-6468", false}, {"12a4", false}, {"", false}};
        for (Object[] v : luhn) eq(v[1], CheckDigits.luhnValid((String) v[0]), "luhn " + v[0]);
        eq("3", CheckDigits.luhnCheckDigit("7992739871"), "luhn check digit 7992739871");
        eq("7", CheckDigits.luhnCheckDigit("453914880343646"), "luhn check digit 453914880343646");
        throwsIae(() -> CheckDigits.luhnCheckDigit("12a"), "luhn check digit non-digit");
        throwsIae(() -> CheckDigits.luhnCheckDigit(""), "luhn check digit empty");
        Object[][] iban = {{"GB82 WEST 1234 5698 7654 32", true}, {"DE89 3704 0044 0532 0130 00", true}, {"gb82west12345698765432", true}, {"GB82 WEST 1234 5698 7654 33", false}, {"GB82-WEST", false}, {"NO9386011117947", true}, {"XX00", false}};
        for (Object[] v : iban) eq(v[1], CheckDigits.ibanValid((String) v[0]), "iban " + v[0]);
        eq("GB82 WEST 1234 5698 7654 32", CheckDigits.ibanFormat("gb82west12345698765432"), "iban format GB");
        eq("NO93 8601 1117 947", CheckDigits.ibanFormat("NO9386011117947"), "iban format NO");
        throwsIae(() -> CheckDigits.ibanFormat("GB82 WEST 1234 5698 7654 33"), "iban format invalid");
        Object[][] gtin = {{"4006381333931", true}, {"036000291452", true}, {"96385074", true}, {"10614141000415", true}, {"4006381333932", false}, {"12345", false}};
        for (Object[] v : gtin) eq(v[1], CheckDigits.gtinValid((String) v[0]), "gtin " + v[0]);
        Object[][] isbn10 = {{"0-306-40615-2", true}, {"0-8044-2957-X", true}, {"0-306-40615-3", false}, {"030640615", false}};
        for (Object[] v : isbn10) eq(v[1], CheckDigits.isbn10Valid((String) v[0]), "isbn10 " + v[0]);
        Object[][] isbn13 = {{"978-0-306-40615-7", true}, {"979-10-90636-07-1", true}, {"978-0-306-40615-8", false}, {"4006381333931", false}};
        for (Object[] v : isbn13) eq(v[1], CheckDigits.isbn13Valid((String) v[0]), "isbn13 " + v[0]);
        eq("9780306406157", CheckDigits.isbn10To13("0-306-40615-2"), "isbn10 to 13 a");
        eq("9780804429573", CheckDigits.isbn10To13("080442957X"), "isbn10 to 13 X");
        throwsIae(() -> CheckDigits.isbn10To13("0-306-40615-3"), "isbn10 to 13 invalid");
        check(!CheckDigits.luhnValid(null) && !CheckDigits.ibanValid(null) && !CheckDigits.gtinValid(null), "null is invalid");

        System.out.println("CheckDigitsTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
