// SPDX-License-Identifier: Apache-2.0
import kotlin.system.exitProcess

private var passed = 0
private var failed = 0

private fun eq(expected: Any, actual: Any?, name: String) {
    if (expected == actual) passed++ else { failed++; System.err.println("FAIL: $name expected <$expected> got <$actual>") }
}

fun main() {
    val s = listOf(
        FormSchema.Field("name", FormSchema.Type.STRING, required = true, minLength = 2, maxLength = 5),
        FormSchema.Field("age", FormSchema.Type.INTEGER, min = 18.0, max = 120.0),
        FormSchema.Field("email", FormSchema.Type.EMAIL, required = true),
        FormSchema.Field("plan", FormSchema.Type.STRING, enum = listOf("free", "pro")),
        FormSchema.Field("code", FormSchema.Type.STRING, pattern = "[A-Z]{3}-\\d{2}"),
        FormSchema.Field("start", FormSchema.Type.DATE),
    )
    val none = emptyMap<String, List<String>>()

    eq(none, FormSchema.validate(s, linkedMapOf("name" to "Al", "age" to 30, "email" to "a@b.co", "plan" to "pro",
        "code" to "ABC-12", "start" to "2024-02-29")), "valid submission")
    eq(mapOf("name" to listOf("required"), "email" to listOf("email")),
        FormSchema.validate(s, linkedMapOf("name" to "", "email" to "bad")), "required and email")
    val many = FormSchema.validate(s, linkedMapOf("name" to "Abcdef", "age" to 17.5, "email" to "a@b.co",
        "plan" to "team", "code" to "abc-12", "start" to "2023-02-29"))
    eq(mapOf("name" to listOf("maxLength"), "age" to listOf("type"), "plan" to listOf("enum"), "code" to listOf("pattern"),
        "start" to listOf("date")), many, "multiple field errors")
    eq(listOf("name", "age", "plan", "code", "start"), many.keys.toList(), "errors in schema order")
    eq(mapOf("age" to listOf("type")), FormSchema.validate(s, linkedMapOf("name" to "Al", "email" to "a@b.co", "age" to "30")),
        "numeric string is a type error")
    eq(mapOf("extra" to listOf("unknown")), FormSchema.validate(s, linkedMapOf("name" to "Al", "email" to "a@b.co", "extra" to 1)),
        "unknown key")
    eq(none, FormSchema.validate(s, linkedMapOf("name" to "Al", "email" to "a@b.co", "extra" to 1), allowUnknown = true),
        "allowUnknown")
    eq(mapOf("age" to listOf("max")), FormSchema.validate(s, linkedMapOf("name" to "Al", "email" to "a@b.co", "age" to 121)), "max")
    eq(mapOf("name" to listOf("minLength")), FormSchema.validate(s, linkedMapOf("name" to "Ā", "email" to "a@b.co")),
        "length counts code points")
    eq(mapOf("age" to listOf("type")), FormSchema.validate(s, linkedMapOf("name" to "Al", "email" to "a@b.co", "age" to true)),
        "boolean is not a number")

    println("FormSchemaTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
