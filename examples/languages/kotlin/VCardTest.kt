// SPDX-License-Identifier: Apache-2.0
// Every vector line is copied from the shared wave 7 vectors (vectors.json) used by all Genlib languages.
import kotlin.system.exitProcess

// Wave 7 vectors (shared with every Genlib language) for vcard.
private var passed = 0
private var failed = 0

private fun check(ok: Boolean, name: String) {
    if (ok) passed++ else { failed++; System.err.println("FAIL: $name") }
}

private fun eq(expected: Any?, actual: Any?, name: String) = check(expected == actual, "$name expected <$expected> got <$actual>")

private fun throwsIae(name: String, block: () -> Unit) {
    try { block(); check(false, "$name did not throw") } catch (e: IllegalArgumentException) { check(true, name) }
}

fun main() {
    eq("BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Ada Lovelace\r\nN:Lovelace;Ada;;Countess;\r\nORG:Analytical Engines\\, Ltd.\r\nTITLE:Programmer\r\nEMAIL;TYPE=work:ada@example.com\r\nTEL;TYPE=cell:+44 20 7946 0000\r\nADR;TYPE=home:;;12 St. James's Sq;London;;SW1Y 4LB;United Kingdom\r\nURL:https://example.com/ada\r\nNOTE:First line\\nSecond\\; with\\, punctuation \\\\ backslash\r\nUID:urn:uuid:01a0c450-6c7b-7102-8304-05060708090a\r\nEND:VCARD\r\n", VCard.buildVcard(VCard.Contact(fn = "Ada Lovelace", n = VCard.Name(family = "Lovelace", given = "Ada", prefix = "Countess"), org = "Analytical Engines, Ltd.", title = "Programmer", note = "First line\nSecond; with, punctuation \\ backslash", uid = "urn:uuid:01a0c450-6c7b-7102-8304-05060708090a", emails = listOf(VCard.Typed("ada@example.com", "work")), phones = listOf(VCard.Typed("+44 20 7946 0000", "cell")), address = VCard.Address(type = "home", street = "12 St. James's Sq", locality = "London", postalCode = "SW1Y 4LB", country = "United Kingdom"), urls = listOf("https://example.com/ada"))), "vcard case 0")
    eq("BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Zo\u00EB \u00C5ngstr\u00F6m\r\nEND:VCARD\r\n", VCard.buildVcard(VCard.Contact(fn = "Zo\u00EB \u00C5ngstr\u00F6m")), "vcard case 1")
    eq("BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Long Note\r\nNOTE:\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\r\n \u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\r\nEND:VCARD\r\n", VCard.buildVcard(VCard.Contact(fn = "Long Note", note = "\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9")), "vcard case 2")
    throwsIae("vcard invalid 0") { VCard.buildVcard(VCard.Contact(fn = "")) }
    throwsIae("vcard invalid 1") { VCard.buildVcard(VCard.Contact(fn = "   ")) }
    throwsIae("vcard invalid 2") { VCard.buildVcard(VCard.Contact(fn = "A", emails = listOf(VCard.Typed("not an email", null)))) }
    throwsIae("vcard invalid 3") { VCard.buildVcard(VCard.Contact(fn = "A", phones = listOf(VCard.Typed("call me", null)))) }
    throwsIae("vcard invalid 4") { VCard.buildVcard(VCard.Contact(fn = "A", urls = listOf("javascript:alert(1)"))) }
    throwsIae("vcard invalid 5") { VCard.buildVcard(VCard.Contact(fn = "A", emails = listOf(VCard.Typed("a@b.c", "Work")))) }
    throwsIae("vcard invalid 6") { VCard.buildVcard(VCard.Contact(fn = "Tab\there")) }

    println("VCardTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
