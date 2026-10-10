// SPDX-License-Identifier: Apache-2.0
import kotlin.system.exitProcess

private var passed = 0
private var failed = 0

private fun check(ok: Boolean, name: String) {
    if (ok) passed++ else { failed++; System.err.println("FAIL: $name") }
}

private fun eq(expected: Any, actual: Any?, name: String) = check(expected == actual, "$name expected <$expected> got <$actual>")

private fun throwsIae(name: String, block: () -> Unit) {
    try { block(); check(false, "$name did not throw") } catch (e: IllegalArgumentException) { check(true, name) }
}

fun main() {
    val org = linkedMapOf<String, Any?>(
        "@context" to "https://schema.org", "@type" to "Organization", "name" to "A&B </script>",
        "url" to "https://ab.example", "sameAs" to listOf("https://x.com/ab"),
    )
    eq("<script type=\"application/ld+json\">{\"@context\":\"https://schema.org\",\"@type\":\"Organization\",\"name\":\"A\\u0026B \\u003c/script\\u003e\",\"url\":\"https://ab.example\",\"sameAs\":[\"https://x.com/ab\"]}</script>",
        StructuredData.jsonLdScript(org), "json-ld vector")
    val types = linkedMapOf<String, Any?>(
        "n" to null, "t" to true, "i" to -3, "f" to 2.0, "g" to 4.5,
        "s" to "q\"\\\n\u0001\u2028\u2029\u00e9", "o" to mapOf("a" to emptyList<Any>()),
    )
    eq("{\"n\":null,\"t\":true,\"i\":-3,\"f\":2,\"g\":4.5,\"s\":\"q\\\"\\\\\\n\\u0001\\u2028\\u2029\u00e9\",\"o\":{\"a\":[]}}",
        StructuredData.toSafeJson(types), "json types and escapes")
    throwsIae("json NaN") { StructuredData.jsonLdScript(mapOf("x" to Double.NaN)) }
    throwsIae("json Infinity") { StructuredData.jsonLdScript(mapOf("x" to Double.POSITIVE_INFINITY)) }
    throwsIae("json-ld scalar top level") { StructuredData.jsonLdScript("x") }
    throwsIae("json unsupported type") { StructuredData.jsonLdScript(mapOf("x" to Any())) }
    var deep: Any = "x"
    repeat(100) { deep = listOf(deep) }
    throwsIae("json depth limit") { StructuredData.jsonLdScript(deep) }

    val meta = "<title>Tom &amp; &quot;Jerry&quot;</title>\n<meta name=\"description\" content=\"Cat &lt;3 mouse\">\n" +
        "<link rel=\"canonical\" href=\"https://ex.com/tj\">\n<meta property=\"og:title\" content=\"Tom &amp; &quot;Jerry&quot;\">\n" +
        "<meta property=\"og:description\" content=\"Cat &lt;3 mouse\">\n<meta property=\"og:url\" content=\"https://ex.com/tj\">\n" +
        "<meta property=\"og:image\" content=\"https://ex.com/tj.png\">\n<meta property=\"og:site_name\" content=\"Ex\">\n" +
        "<meta property=\"og:type\" content=\"website\">\n<meta name=\"twitter:card\" content=\"summary_large_image\">\n" +
        "<meta name=\"twitter:title\" content=\"Tom &amp; &quot;Jerry&quot;\">\n<meta name=\"twitter:description\" content=\"Cat &lt;3 mouse\">\n" +
        "<meta name=\"twitter:image\" content=\"https://ex.com/tj.png\">"
    eq(meta, StructuredData.metaTags("Tom & \"Jerry\"", description = "Cat <3 mouse", canonical = "https://ex.com/tj",
        image = "https://ex.com/tj.png", siteName = "Ex"), "meta vector")
    val only = StructuredData.metaTags("T")
    eq("<title>T</title>\n<meta property=\"og:title\" content=\"T\">\n<meta property=\"og:type\" content=\"website\">\n" +
        "<meta name=\"twitter:card\" content=\"summary_large_image\">\n<meta name=\"twitter:title\" content=\"T\">", only, "meta title only")
    eq(5, only.split("\n").size, "meta title only has 5 lines")
    check(StructuredData.metaTags("T", locale = "en_US")
        .contains("<meta property=\"og:type\" content=\"website\">\n<meta property=\"og:locale\" content=\"en_US\">"), "meta locale after type")
    throwsIae("meta http canonical") { StructuredData.metaTags("T", canonical = "http://ex.com") }
    throwsIae("meta relative image") { StructuredData.metaTags("T", image = "/x.png") }
    throwsIae("meta bad twitter card") { StructuredData.metaTags("T", twitterCard = "big") }
    throwsIae("meta empty title") { StructuredData.metaTags(" ") }

    println("StructuredDataTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
