// SPDX-License-Identifier: Apache-2.0
// Vector rows are generated from the shared wave 8 vectors (vectors.json) used by all Genlib languages.
import kotlin.system.exitProcess

// Wave 8 vectors (shared with every Genlib language) for json-patch, pointer, merge patch and the parser.
private var passed = 0
private var failed = 0

private fun check(ok: Boolean, name: String) {
    if (ok) passed++ else { failed++; System.err.println("FAIL: $name") }
}

private fun eq(expected: Any?, actual: Any?, name: String) = check(expected == actual, "$name expected <$expected> got <$actual>")

private fun throwsIae(name: String, block: () -> Unit) {
    try { block(); check(false, "$name did not throw") } catch (e: IllegalArgumentException) { check(true, name) }
}

private val PARSE_INVALID = arrayOf(
        arrayOf(""),
        arrayOf("{"),
        arrayOf("{\"a\":1,}"),
        arrayOf("[1,]"),
        arrayOf("01"),
        arrayOf("1."),
        arrayOf(".5"),
        arrayOf("+1"),
        arrayOf("{'a':1}"),
        arrayOf("{\"a\" 1}"),
        arrayOf("\"\\x\""),
        arrayOf("\"a"),
        arrayOf("tru"),
        arrayOf("nul"),
        arrayOf("[1 2]"),
        arrayOf("\"\t\""),
        arrayOf("{\"a\":1}x"),
        arrayOf("NaN"),
        arrayOf("1e"),
        arrayOf("\"\\ud800\"")
)

/** {text, canonical}. */
private val PARSE_VALID = arrayOf(
        arrayOf(" {\"a\" : [1, -2, 3.5e2, true, false, null, \"x\\n\\u00e9\\ud83d\\ude00\"]} ", "{\"a\":[1,-2,350,true,false,null,\"x\\n\u00e9\ud83d\ude00\"]}"),
        arrayOf("\"\\u0001\\\"\\\\/\"", "\"\\u0001\\\"\\\\/\""),
        arrayOf("[]", "[]"),
        arrayOf("{}", "{}"),
        arrayOf("-0", "0"),
        arrayOf("1E+2", "100")
)

/** {doc, pointer, canonical result}. */
private val POINTER = arrayOf(
        arrayOf("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "", "{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}"),
        arrayOf("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/foo", "[\"bar\",\"baz\"]"),
        arrayOf("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/foo/0", "\"bar\""),
        arrayOf("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/", "0"),
        arrayOf("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/a~1b", "1"),
        arrayOf("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/c%d", "2"),
        arrayOf("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/e^f", "3"),
        arrayOf("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/g|h", "4"),
        arrayOf("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/i\\j", "5"),
        arrayOf("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/k\"l", "6"),
        arrayOf("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/ ", "7"),
        arrayOf("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/m~0n", "8")
)

/** Pointers that fail against {"foo":["bar","baz"],"m~n":8}. */
private val POINTER_INVALID = arrayOf(
        arrayOf("/foo/2"),
        arrayOf("/foo/-"),
        arrayOf("/foo/01"),
        arrayOf("foo"),
        arrayOf("/nope"),
        arrayOf("/m~2n"),
        arrayOf("/foo/0/x")
)

/** {doc, patch, canonical result}. */
private val APPLY = arrayOf(
        arrayOf("{\"foo\":\"bar\"}", "[{\"op\":\"add\",\"path\":\"/baz\",\"value\":\"qux\"}]", "{\"baz\":\"qux\",\"foo\":\"bar\"}"),
        arrayOf("{\"foo\":[\"bar\",\"baz\"]}", "[{\"op\":\"add\",\"path\":\"/foo/1\",\"value\":\"qux\"}]", "{\"foo\":[\"bar\",\"qux\",\"baz\"]}"),
        arrayOf("{\"baz\":\"qux\",\"foo\":\"bar\"}", "[{\"op\":\"remove\",\"path\":\"/baz\"}]", "{\"foo\":\"bar\"}"),
        arrayOf("{\"foo\":[\"bar\",\"qux\",\"baz\"]}", "[{\"op\":\"remove\",\"path\":\"/foo/1\"}]", "{\"foo\":[\"bar\",\"baz\"]}"),
        arrayOf("{\"baz\":\"qux\",\"foo\":\"bar\"}", "[{\"op\":\"replace\",\"path\":\"/baz\",\"value\":\"boo\"}]", "{\"baz\":\"boo\",\"foo\":\"bar\"}"),
        arrayOf("{\"foo\":{\"bar\":\"baz\",\"waldo\":\"fred\"},\"qux\":{\"corge\":\"grault\"}}", "[{\"from\":\"/foo/waldo\",\"op\":\"move\",\"path\":\"/qux/thud\"}]", "{\"foo\":{\"bar\":\"baz\"},\"qux\":{\"corge\":\"grault\",\"thud\":\"fred\"}}"),
        arrayOf("{\"foo\":[\"all\",\"grass\",\"cows\",\"eat\"]}", "[{\"from\":\"/foo/1\",\"op\":\"move\",\"path\":\"/foo/3\"}]", "{\"foo\":[\"all\",\"cows\",\"eat\",\"grass\"]}"),
        arrayOf("{\"baz\":\"qux\",\"foo\":[\"a\",2,\"c\"]}", "[{\"op\":\"test\",\"path\":\"/baz\",\"value\":\"qux\"},{\"op\":\"test\",\"path\":\"/foo/1\",\"value\":2}]", "{\"baz\":\"qux\",\"foo\":[\"a\",2,\"c\"]}"),
        arrayOf("{\"foo\":\"bar\"}", "[{\"op\":\"add\",\"path\":\"/child\",\"value\":{\"grandchild\":{}}}]", "{\"child\":{\"grandchild\":{}},\"foo\":\"bar\"}"),
        arrayOf("{\"foo\":\"bar\"}", "[{\"op\":\"add\",\"path\":\"/baz\",\"value\":\"qux\",\"xyz\":123}]", "{\"baz\":\"qux\",\"foo\":\"bar\"}"),
        arrayOf("{\"foo\":[\"bar\"]}", "[{\"op\":\"add\",\"path\":\"/foo/-\",\"value\":[\"abc\",\"def\"]}]", "{\"foo\":[\"bar\",[\"abc\",\"def\"]]}"),
        arrayOf("{\"/\":9,\"~1\":10}", "[{\"op\":\"test\",\"path\":\"/~01\",\"value\":10},{\"op\":\"replace\",\"path\":\"/~1\",\"value\":1}]", "{\"/\":1,\"~1\":10}"),
        arrayOf("{\"a\":1}", "[{\"op\":\"replace\",\"path\":\"\",\"value\":[1,2]}]", "[1,2]"),
        arrayOf("{\"a\":1}", "[{\"op\":\"add\",\"path\":\"\",\"value\":\"root\"}]", "\"root\""),
        arrayOf("{\"a\":{\"b\":1}}", "[{\"from\":\"/a\",\"op\":\"copy\",\"path\":\"/c\"},{\"op\":\"replace\",\"path\":\"/c/b\",\"value\":2}]", "{\"a\":{\"b\":1},\"c\":{\"b\":2}}"),
        arrayOf("{\"a\":[1,2]}", "[{\"from\":\"/a/0\",\"op\":\"move\",\"path\":\"/a/0\"}]", "{\"a\":[1,2]}"),
        arrayOf("{\"n\":1}", "[{\"op\":\"test\",\"path\":\"/n\",\"value\":1}]", "{\"n\":1}"),
        arrayOf("{\"a\":{\"b\":[1,{\"c\":null}]}}", "[{\"op\":\"test\",\"path\":\"/a/b/1/c\",\"value\":null},{\"op\":\"remove\",\"path\":\"/a/b/0\"}]", "{\"a\":{\"b\":[{\"c\":null}]}}")
)

/** {doc, patch}: each must throw. */
private val APPLY_INVALID = arrayOf(
        arrayOf("{\"baz\":\"qux\"}", "[{\"op\":\"add\",\"path\":\"/baz/bat\",\"value\":\"qux\"}]"),
        arrayOf("{\"foo\":\"bar\"}", "[{\"op\":\"test\",\"path\":\"/baz\",\"value\":\"qux\"}]"),
        arrayOf("{\"foo\":[\"bar\"]}", "[{\"op\":\"add\",\"path\":\"/foo/2\",\"value\":1}]"),
        arrayOf("{\"foo\":[\"bar\"]}", "[{\"op\":\"add\",\"path\":\"/foo/01\",\"value\":1}]"),
        arrayOf("{\"foo\":[\"bar\"]}", "[{\"op\":\"remove\",\"path\":\"/foo/-\"}]"),
        arrayOf("{\"a\":1}", "[{\"op\":\"remove\",\"path\":\"/b\"}]"),
        arrayOf("{\"a\":1}", "[{\"op\":\"replace\",\"path\":\"/b\",\"value\":1}]"),
        arrayOf("{\"a\":{\"b\":1}}", "[{\"from\":\"/a\",\"op\":\"move\",\"path\":\"/a/b/c\"}]"),
        arrayOf("{\"a\":1}", "[{\"op\":\"frobnicate\",\"path\":\"/a\"}]"),
        arrayOf("{\"a\":1}", "[{\"op\":\"add\",\"path\":\"/b\"}]"),
        arrayOf("{\"a\":1}", "[{\"op\":\"add\",\"value\":1}]"),
        arrayOf("{\"a\":1}", "[{\"op\":\"add\",\"path\":\"a\",\"value\":1}]"),
        arrayOf("{\"a~b\":1}", "[{\"op\":\"remove\",\"path\":\"/a~b\"}]"),
        arrayOf("{\"a\":1}", "[{\"op\":\"remove\",\"path\":\"\"}]"),
        arrayOf("{\"a\":true}", "[{\"op\":\"test\",\"path\":\"/a\",\"value\":1}]"),
        arrayOf("{\"a\":1}", "[{\"op\":\"test\",\"path\":\"/a\",\"value\":\"1\"}]"),
        arrayOf("{\"a\":1}", "[{\"op\":\"add\",\"path\":\"/b\",\"value\":2},{\"op\":\"test\",\"path\":\"/b\",\"value\":3}]"),
        arrayOf("{\"a\":1}", "{\"op\":\"add\",\"path\":\"/b\",\"value\":2}")
)

/** {target, merge patch, canonical result}. */
private val MERGE = arrayOf(
        arrayOf("{\"a\":\"b\"}", "{\"a\":\"c\"}", "{\"a\":\"c\"}"),
        arrayOf("{\"a\":\"b\"}", "{\"b\":\"c\"}", "{\"a\":\"b\",\"b\":\"c\"}"),
        arrayOf("{\"a\":\"b\"}", "{\"a\":null}", "{}"),
        arrayOf("{\"a\":\"b\",\"b\":\"c\"}", "{\"a\":null}", "{\"b\":\"c\"}"),
        arrayOf("{\"a\":[\"b\"]}", "{\"a\":\"c\"}", "{\"a\":\"c\"}"),
        arrayOf("{\"a\":\"c\"}", "{\"a\":[\"b\"]}", "{\"a\":[\"b\"]}"),
        arrayOf("{\"a\":{\"b\":\"c\"}}", "{\"a\":{\"b\":\"d\",\"c\":null}}", "{\"a\":{\"b\":\"d\"}}"),
        arrayOf("{\"a\":[{\"b\":\"c\"}]}", "{\"a\":[1]}", "{\"a\":[1]}"),
        arrayOf("[\"a\",\"b\"]", "[\"c\",\"d\"]", "[\"c\",\"d\"]"),
        arrayOf("{\"a\":\"b\"}", "[\"c\"]", "[\"c\"]"),
        arrayOf("{\"a\":\"foo\"}", "null", "null"),
        arrayOf("{\"a\":\"foo\"}", "\"bar\"", "\"bar\""),
        arrayOf("{\"e\":null}", "{\"a\":1}", "{\"a\":1,\"e\":null}"),
        arrayOf("[1,2]", "{\"a\":\"b\",\"c\":null}", "{\"a\":\"b\"}"),
        arrayOf("{}", "{\"a\":{\"bb\":{\"ccc\":null}}}", "{\"a\":{\"bb\":{}}}")
)

/** {a, b, canonical patch}. */
private val CREATE = arrayOf(
        arrayOf("{\"a\":1,\"b\":[1,2,3]}", "{\"a\":2,\"b\":[1],\"c\":true}", "[{\"op\":\"replace\",\"path\":\"/a\",\"value\":2},{\"op\":\"remove\",\"path\":\"/b/2\"},{\"op\":\"remove\",\"path\":\"/b/1\"},{\"op\":\"add\",\"path\":\"/c\",\"value\":true}]"),
        arrayOf("{\"x\":{\"y\":{\"z\":1}}}", "{\"x\":{\"y\":{\"w\":[null],\"z\":1}}}", "[{\"op\":\"add\",\"path\":\"/x/y/w\",\"value\":[null]}]"),
        arrayOf("[1,2]", "[1,2,3,4]", "[{\"op\":\"add\",\"path\":\"/2\",\"value\":3},{\"op\":\"add\",\"path\":\"/3\",\"value\":4}]"),
        arrayOf("{\"a/b\":1,\"m~n\":2}", "{\"a/b\":3}", "[{\"op\":\"replace\",\"path\":\"/a~1b\",\"value\":3},{\"op\":\"remove\",\"path\":\"/m~0n\"}]"),
        arrayOf("\"s\"", "{\"k\":\"s\"}", "[{\"op\":\"replace\",\"path\":\"\",\"value\":{\"k\":\"s\"}}]"),
        arrayOf("{\"k\":[1,{\"q\":1}]}", "{\"k\":[2,{\"q\":2}]}", "[{\"op\":\"replace\",\"path\":\"/k/0\",\"value\":2},{\"op\":\"replace\",\"path\":\"/k/1/q\",\"value\":2}]"),
        arrayOf("{\"same\":1}", "{\"same\":1}", "[]"),
        arrayOf("null", "false", "[{\"op\":\"replace\",\"path\":\"\",\"value\":false}]"),
        arrayOf("{\"Z\":3,\"a\":2,\"b\":1,\"\u00e9\":4}", "{}", "[{\"op\":\"remove\",\"path\":\"/Z\"},{\"op\":\"remove\",\"path\":\"/a\"},{\"op\":\"remove\",\"path\":\"/b\"},{\"op\":\"remove\",\"path\":\"/\u00e9\"}]"),
        arrayOf("[]", "[[]]", "[{\"op\":\"add\",\"path\":\"/0\",\"value\":[]}]"),
        arrayOf("{\"n\":[1,2,3]}", "{\"n\":[3,2,1]}", "[{\"op\":\"replace\",\"path\":\"/n/0\",\"value\":3},{\"op\":\"replace\",\"path\":\"/n/2\",\"value\":1}]")
)

private fun p(text: String) = JsonPatch.parse(text)

private fun c(v: Any?) = JsonPatch.canonical(v)

fun main() {
    PARSE_INVALID.forEachIndexed { k, v -> throwsIae("parse_invalid $k") { JsonPatch.parse(v[0]) } }
    PARSE_VALID.forEachIndexed { k, v -> eq(v[1], c(p(v[0])), "parse_valid $k") }
    POINTER.forEachIndexed { k, v -> eq(v[2], c(JsonPatch.getPointer(p(v[0]), v[1])), "pointer $k") }
    val pdoc = p("{\"foo\":[\"bar\",\"baz\"],\"m~n\":8}")
    POINTER_INVALID.forEachIndexed { k, v -> throwsIae("pointer_invalid $k") { JsonPatch.getPointer(pdoc, v[0]) } }
    APPLY.forEachIndexed { k, v ->
        val doc = p(v[0])
        val before = c(doc)
        eq(v[2], c(JsonPatch.applyPatch(doc, p(v[1]))), "apply $k")
        eq(before, c(doc), "apply $k leaves the input unchanged")
    }
    APPLY_INVALID.forEachIndexed { k, v ->
        val doc = p(v[0])
        val before = c(doc)
        throwsIae("apply_invalid $k") { JsonPatch.applyPatch(doc, p(v[1])) }
        eq(before, c(doc), "apply_invalid $k leaves the input unchanged")
    }
    MERGE.forEachIndexed { k, v ->
        val target = p(v[0])
        val before = c(target)
        eq(v[2], c(JsonPatch.mergePatch(target, p(v[1]))), "merge $k")
        eq(before, c(target), "merge $k leaves the target unchanged")
    }
    CREATE.forEachIndexed { k, v ->
        val a = p(v[0])
        val b = p(v[1])
        val patch = JsonPatch.createPatch(a, b)
        eq(v[2], c(patch), "create $k")
        check(JsonPatch.equal(JsonPatch.applyPatch(a, patch), b), "create $k round trip")
    }

    check(JsonPatch.equal(1L, 1.0), "1 equals 1.0")
    check(!JsonPatch.equal(true, 1L), "true is not 1")
    check(JsonPatch.equal(p("{\"a\":1,\"b\":2}"), p("{\"b\":2,\"a\":1}")), "key order ignored")
    check(!JsonPatch.equal(p("[1,2]"), p("[2,1]")), "array order matters")
    eq("1", c(1.0), "whole double prints as an integer")
    eq("2.5", c(2.5), "fraction keeps its decimal point")
    eq("\"\\u0001\\b\\f\\n\\r\\t\\\"\\\\/\u00e9\"", c("\u0001\b\u000c\n\r\t\"\\/\u00e9"), "string escapes")
    eq("{\"\uffff\":1,\"\ud83d\ude00\":2}", c(p("{\"\\ud83d\\ude00\":2,\"\\uffff\":1}")), "keys sorted by code point, not UTF-16 unit")
    eq(12345678901L, p("12345678901"), "integers parse as Long")
    eq(0.5, p("0.5"), "fractions parse as Double")
    eq("[1,2]", c(JsonPatch.applyPatch(mapOf("a" to 1L), listOf(mapOf("op" to "replace", "path" to "", "value" to listOf(1L, 2L))))), "immutable inputs are copied")
    throwsIae("infinite number rejected") { JsonPatch.parse("1e999") }
    throwsIae("deep nesting rejected") { JsonPatch.parse("[".repeat(2000) + "]".repeat(2000)) }

    println("JsonPatchTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
