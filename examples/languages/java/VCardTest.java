// SPDX-License-Identifier: Apache-2.0
// Every vector line is copied from the shared wave 7 vectors (vectors.json) used by all Genlib languages.

/** Wave 7 vectors (shared with every Genlib language) for vcard. */
public final class VCardTest {
    private static int passed;
    private static int failed;

    private static void check(boolean ok, String name) {
        if (ok) passed++; else { failed++; System.err.println("FAIL: " + name); }
    }

    private static void eq(Object expected, Object actual, String name) {
        check(java.util.Objects.equals(expected, actual), name + " expected <" + expected + "> got <" + actual + ">");
    }

    private static void throwsIae(Runnable r, String name) {
        try { r.run(); check(false, name + " did not throw"); }
        catch (IllegalArgumentException e) { check(true, name); }
    }

    public static void main(String[] args) {
        eq("BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Ada Lovelace\r\nN:Lovelace;Ada;;Countess;\r\nORG:Analytical Engines\\, Ltd.\r\nTITLE:Programmer\r\nEMAIL;TYPE=work:ada@example.com\r\nTEL;TYPE=cell:+44 20 7946 0000\r\nADR;TYPE=home:;;12 St. James's Sq;London;;SW1Y 4LB;United Kingdom\r\nURL:https://example.com/ada\r\nNOTE:First line\\nSecond\\; with\\, punctuation \\\\ backslash\r\nUID:urn:uuid:01a0c450-6c7b-7102-8304-05060708090a\r\nEND:VCARD\r\n", VCard.buildVcard(new VCard.Contact().fn("Ada Lovelace").n(new VCard.Name("Lovelace", "Ada", null, "Countess", null)).org("Analytical Engines, Ltd.").title("Programmer").email("ada@example.com", "work").phone("+44 20 7946 0000", "cell").address(new VCard.Address().type("home").street("12 St. James's Sq").locality("London").postalCode("SW1Y 4LB").country("United Kingdom")).url("https://example.com/ada").note("First line\nSecond; with, punctuation \\ backslash").uid("urn:uuid:01a0c450-6c7b-7102-8304-05060708090a")), "vcard case 0");
        eq("BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Zo\u00EB \u00C5ngstr\u00F6m\r\nEND:VCARD\r\n", VCard.buildVcard(new VCard.Contact().fn("Zo\u00EB \u00C5ngstr\u00F6m")), "vcard case 1");
        eq("BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Long Note\r\nNOTE:\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\r\n \u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\r\nEND:VCARD\r\n", VCard.buildVcard(new VCard.Contact().fn("Long Note").note("\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9")), "vcard case 2");
        throwsIae(() -> VCard.buildVcard(new VCard.Contact().fn("")), "vcard invalid 0");
        throwsIae(() -> VCard.buildVcard(new VCard.Contact().fn("   ")), "vcard invalid 1");
        throwsIae(() -> VCard.buildVcard(new VCard.Contact().fn("A").email("not an email", null)), "vcard invalid 2");
        throwsIae(() -> VCard.buildVcard(new VCard.Contact().fn("A").phone("call me", null)), "vcard invalid 3");
        throwsIae(() -> VCard.buildVcard(new VCard.Contact().fn("A").url("javascript:alert(1)")), "vcard invalid 4");
        throwsIae(() -> VCard.buildVcard(new VCard.Contact().fn("A").email("a@b.c", "Work")), "vcard invalid 5");
        throwsIae(() -> VCard.buildVcard(new VCard.Contact().fn("Tab\there")), "vcard invalid 6");

        System.out.println("VCardTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
