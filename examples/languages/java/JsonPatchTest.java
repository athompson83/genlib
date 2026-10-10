// SPDX-License-Identifier: Apache-2.0
// Vector rows are generated from the shared wave 8 vectors (vectors.json) used by all Genlib languages.
import java.util.List;
import java.util.Map;

/** Wave 8 vectors (shared with every Genlib language) for json-patch, pointer, merge patch and the parser. */
public final class JsonPatchTest {
    private static int passed;
    private static int failed;

    private static final String[][] PARSE_INVALID = {
        {""},
        {"{"},
        {"{\"a\":1,}"},
        {"[1,]"},
        {"01"},
        {"1."},
        {".5"},
        {"+1"},
        {"{'a':1}"},
        {"{\"a\" 1}"},
        {"\"\\x\""},
        {"\"a"},
        {"tru"},
        {"nul"},
        {"[1 2]"},
        {"\"\t\""},
        {"{\"a\":1}x"},
        {"NaN"},
        {"1e"},
        {"\"\\ud800\""}
    };

    /** {text, canonical}. */
    private static final String[][] PARSE_VALID = {
        {" {\"a\" : [1, -2, 3.5e2, true, false, null, \"x\\n\\u00e9\\ud83d\\ude00\"]} ", "{\"a\":[1,-2,350,true,false,null,\"x\\n\u00e9\ud83d\ude00\"]}"},
        {"\"\\u0001\\\"\\\\/\"", "\"\\u0001\\\"\\\\/\""},
        {"[]", "[]"},
        {"{}", "{}"},
        {"-0", "0"},
        {"1E+2", "100"}
    };

    /** {doc, pointer, canonical result}. */
    private static final String[][] POINTER = {
        {"{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "", "{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}"},
        {"{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/foo", "[\"bar\",\"baz\"]"},
        {"{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/foo/0", "\"bar\""},
        {"{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/", "0"},
        {"{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/a~1b", "1"},
        {"{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/c%d", "2"},
        {"{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/e^f", "3"},
        {"{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/g|h", "4"},
        {"{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/i\\j", "5"},
        {"{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/k\"l", "6"},
        {"{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/ ", "7"},
        {"{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/m~0n", "8"}
    };

    /** Pointers that fail against {"foo":["bar","baz"],"m~n":8}. */
    private static final String[][] POINTER_INVALID = {
        {"/foo/2"},
        {"/foo/-"},
        {"/foo/01"},
        {"foo"},
        {"/nope"},
        {"/m~2n"},
        {"/foo/0/x"}
    };

    /** {doc, patch, canonical result}. */
    private static final String[][] APPLY = {
        {"{\"foo\":\"bar\"}", "[{\"op\":\"add\",\"path\":\"/baz\",\"value\":\"qux\"}]", "{\"baz\":\"qux\",\"foo\":\"bar\"}"},
        {"{\"foo\":[\"bar\",\"baz\"]}", "[{\"op\":\"add\",\"path\":\"/foo/1\",\"value\":\"qux\"}]", "{\"foo\":[\"bar\",\"qux\",\"baz\"]}"},
        {"{\"baz\":\"qux\",\"foo\":\"bar\"}", "[{\"op\":\"remove\",\"path\":\"/baz\"}]", "{\"foo\":\"bar\"}"},
        {"{\"foo\":[\"bar\",\"qux\",\"baz\"]}", "[{\"op\":\"remove\",\"path\":\"/foo/1\"}]", "{\"foo\":[\"bar\",\"baz\"]}"},
        {"{\"baz\":\"qux\",\"foo\":\"bar\"}", "[{\"op\":\"replace\",\"path\":\"/baz\",\"value\":\"boo\"}]", "{\"baz\":\"boo\",\"foo\":\"bar\"}"},
        {"{\"foo\":{\"bar\":\"baz\",\"waldo\":\"fred\"},\"qux\":{\"corge\":\"grault\"}}", "[{\"from\":\"/foo/waldo\",\"op\":\"move\",\"path\":\"/qux/thud\"}]", "{\"foo\":{\"bar\":\"baz\"},\"qux\":{\"corge\":\"grault\",\"thud\":\"fred\"}}"},
        {"{\"foo\":[\"all\",\"grass\",\"cows\",\"eat\"]}", "[{\"from\":\"/foo/1\",\"op\":\"move\",\"path\":\"/foo/3\"}]", "{\"foo\":[\"all\",\"cows\",\"eat\",\"grass\"]}"},
        {"{\"baz\":\"qux\",\"foo\":[\"a\",2,\"c\"]}", "[{\"op\":\"test\",\"path\":\"/baz\",\"value\":\"qux\"},{\"op\":\"test\",\"path\":\"/foo/1\",\"value\":2}]", "{\"baz\":\"qux\",\"foo\":[\"a\",2,\"c\"]}"},
        {"{\"foo\":\"bar\"}", "[{\"op\":\"add\",\"path\":\"/child\",\"value\":{\"grandchild\":{}}}]", "{\"child\":{\"grandchild\":{}},\"foo\":\"bar\"}"},
        {"{\"foo\":\"bar\"}", "[{\"op\":\"add\",\"path\":\"/baz\",\"value\":\"qux\",\"xyz\":123}]", "{\"baz\":\"qux\",\"foo\":\"bar\"}"},
        {"{\"foo\":[\"bar\"]}", "[{\"op\":\"add\",\"path\":\"/foo/-\",\"value\":[\"abc\",\"def\"]}]", "{\"foo\":[\"bar\",[\"abc\",\"def\"]]}"},
        {"{\"/\":9,\"~1\":10}", "[{\"op\":\"test\",\"path\":\"/~01\",\"value\":10},{\"op\":\"replace\",\"path\":\"/~1\",\"value\":1}]", "{\"/\":1,\"~1\":10}"},
        {"{\"a\":1}", "[{\"op\":\"replace\",\"path\":\"\",\"value\":[1,2]}]", "[1,2]"},
        {"{\"a\":1}", "[{\"op\":\"add\",\"path\":\"\",\"value\":\"root\"}]", "\"root\""},
        {"{\"a\":{\"b\":1}}", "[{\"from\":\"/a\",\"op\":\"copy\",\"path\":\"/c\"},{\"op\":\"replace\",\"path\":\"/c/b\",\"value\":2}]", "{\"a\":{\"b\":1},\"c\":{\"b\":2}}"},
        {"{\"a\":[1,2]}", "[{\"from\":\"/a/0\",\"op\":\"move\",\"path\":\"/a/0\"}]", "{\"a\":[1,2]}"},
        {"{\"n\":1}", "[{\"op\":\"test\",\"path\":\"/n\",\"value\":1}]", "{\"n\":1}"},
        {"{\"a\":{\"b\":[1,{\"c\":null}]}}", "[{\"op\":\"test\",\"path\":\"/a/b/1/c\",\"value\":null},{\"op\":\"remove\",\"path\":\"/a/b/0\"}]", "{\"a\":{\"b\":[{\"c\":null}]}}"}
    };

    /** {doc, patch}: each must throw. */
    private static final String[][] APPLY_INVALID = {
        {"{\"baz\":\"qux\"}", "[{\"op\":\"add\",\"path\":\"/baz/bat\",\"value\":\"qux\"}]"},
        {"{\"foo\":\"bar\"}", "[{\"op\":\"test\",\"path\":\"/baz\",\"value\":\"qux\"}]"},
        {"{\"foo\":[\"bar\"]}", "[{\"op\":\"add\",\"path\":\"/foo/2\",\"value\":1}]"},
        {"{\"foo\":[\"bar\"]}", "[{\"op\":\"add\",\"path\":\"/foo/01\",\"value\":1}]"},
        {"{\"foo\":[\"bar\"]}", "[{\"op\":\"remove\",\"path\":\"/foo/-\"}]"},
        {"{\"a\":1}", "[{\"op\":\"remove\",\"path\":\"/b\"}]"},
        {"{\"a\":1}", "[{\"op\":\"replace\",\"path\":\"/b\",\"value\":1}]"},
        {"{\"a\":{\"b\":1}}", "[{\"from\":\"/a\",\"op\":\"move\",\"path\":\"/a/b/c\"}]"},
        {"{\"a\":1}", "[{\"op\":\"frobnicate\",\"path\":\"/a\"}]"},
        {"{\"a\":1}", "[{\"op\":\"add\",\"path\":\"/b\"}]"},
        {"{\"a\":1}", "[{\"op\":\"add\",\"value\":1}]"},
        {"{\"a\":1}", "[{\"op\":\"add\",\"path\":\"a\",\"value\":1}]"},
        {"{\"a~b\":1}", "[{\"op\":\"remove\",\"path\":\"/a~b\"}]"},
        {"{\"a\":1}", "[{\"op\":\"remove\",\"path\":\"\"}]"},
        {"{\"a\":true}", "[{\"op\":\"test\",\"path\":\"/a\",\"value\":1}]"},
        {"{\"a\":1}", "[{\"op\":\"test\",\"path\":\"/a\",\"value\":\"1\"}]"},
        {"{\"a\":1}", "[{\"op\":\"add\",\"path\":\"/b\",\"value\":2},{\"op\":\"test\",\"path\":\"/b\",\"value\":3}]"},
        {"{\"a\":1}", "{\"op\":\"add\",\"path\":\"/b\",\"value\":2}"}
    };

    /** {target, merge patch, canonical result}. */
    private static final String[][] MERGE = {
        {"{\"a\":\"b\"}", "{\"a\":\"c\"}", "{\"a\":\"c\"}"},
        {"{\"a\":\"b\"}", "{\"b\":\"c\"}", "{\"a\":\"b\",\"b\":\"c\"}"},
        {"{\"a\":\"b\"}", "{\"a\":null}", "{}"},
        {"{\"a\":\"b\",\"b\":\"c\"}", "{\"a\":null}", "{\"b\":\"c\"}"},
        {"{\"a\":[\"b\"]}", "{\"a\":\"c\"}", "{\"a\":\"c\"}"},
        {"{\"a\":\"c\"}", "{\"a\":[\"b\"]}", "{\"a\":[\"b\"]}"},
        {"{\"a\":{\"b\":\"c\"}}", "{\"a\":{\"b\":\"d\",\"c\":null}}", "{\"a\":{\"b\":\"d\"}}"},
        {"{\"a\":[{\"b\":\"c\"}]}", "{\"a\":[1]}", "{\"a\":[1]}"},
        {"[\"a\",\"b\"]", "[\"c\",\"d\"]", "[\"c\",\"d\"]"},
        {"{\"a\":\"b\"}", "[\"c\"]", "[\"c\"]"},
        {"{\"a\":\"foo\"}", "null", "null"},
        {"{\"a\":\"foo\"}", "\"bar\"", "\"bar\""},
        {"{\"e\":null}", "{\"a\":1}", "{\"a\":1,\"e\":null}"},
        {"[1,2]", "{\"a\":\"b\",\"c\":null}", "{\"a\":\"b\"}"},
        {"{}", "{\"a\":{\"bb\":{\"ccc\":null}}}", "{\"a\":{\"bb\":{}}}"}
    };

    /** {a, b, canonical patch}. */
    private static final String[][] CREATE = {
        {"{\"a\":1,\"b\":[1,2,3]}", "{\"a\":2,\"b\":[1],\"c\":true}", "[{\"op\":\"replace\",\"path\":\"/a\",\"value\":2},{\"op\":\"remove\",\"path\":\"/b/2\"},{\"op\":\"remove\",\"path\":\"/b/1\"},{\"op\":\"add\",\"path\":\"/c\",\"value\":true}]"},
        {"{\"x\":{\"y\":{\"z\":1}}}", "{\"x\":{\"y\":{\"w\":[null],\"z\":1}}}", "[{\"op\":\"add\",\"path\":\"/x/y/w\",\"value\":[null]}]"},
        {"[1,2]", "[1,2,3,4]", "[{\"op\":\"add\",\"path\":\"/2\",\"value\":3},{\"op\":\"add\",\"path\":\"/3\",\"value\":4}]"},
        {"{\"a/b\":1,\"m~n\":2}", "{\"a/b\":3}", "[{\"op\":\"replace\",\"path\":\"/a~1b\",\"value\":3},{\"op\":\"remove\",\"path\":\"/m~0n\"}]"},
        {"\"s\"", "{\"k\":\"s\"}", "[{\"op\":\"replace\",\"path\":\"\",\"value\":{\"k\":\"s\"}}]"},
        {"{\"k\":[1,{\"q\":1}]}", "{\"k\":[2,{\"q\":2}]}", "[{\"op\":\"replace\",\"path\":\"/k/0\",\"value\":2},{\"op\":\"replace\",\"path\":\"/k/1/q\",\"value\":2}]"},
        {"{\"same\":1}", "{\"same\":1}", "[]"},
        {"null", "false", "[{\"op\":\"replace\",\"path\":\"\",\"value\":false}]"},
        {"{\"Z\":3,\"a\":2,\"b\":1,\"\u00e9\":4}", "{}", "[{\"op\":\"remove\",\"path\":\"/Z\"},{\"op\":\"remove\",\"path\":\"/a\"},{\"op\":\"remove\",\"path\":\"/b\"},{\"op\":\"remove\",\"path\":\"/\u00e9\"}]"},
        {"[]", "[[]]", "[{\"op\":\"add\",\"path\":\"/0\",\"value\":[]}]"},
        {"{\"n\":[1,2,3]}", "{\"n\":[3,2,1]}", "[{\"op\":\"replace\",\"path\":\"/n/0\",\"value\":3},{\"op\":\"replace\",\"path\":\"/n/2\",\"value\":1}]"}
    };

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

    private static Object p(String text) { return JsonPatch.parse(text); }

    private static String c(Object v) { return JsonPatch.canonical(v); }

    public static void main(String[] args) {
        for (int k = 0; k < PARSE_INVALID.length; k++) {
            String text = PARSE_INVALID[k][0];
            throwsIae(() -> JsonPatch.parse(text), "parse_invalid " + k);
        }
        for (int k = 0; k < PARSE_VALID.length; k++) eq(PARSE_VALID[k][1], c(p(PARSE_VALID[k][0])), "parse_valid " + k);
        for (int k = 0; k < POINTER.length; k++) {
            String[] v = POINTER[k];
            eq(v[2], c(JsonPatch.getPointer(p(v[0]), v[1])), "pointer " + k);
        }
        Object pdoc = p("{\"foo\":[\"bar\",\"baz\"],\"m~n\":8}");
        for (int k = 0; k < POINTER_INVALID.length; k++) {
            String ptr = POINTER_INVALID[k][0];
            throwsIae(() -> JsonPatch.getPointer(pdoc, ptr), "pointer_invalid " + k);
        }
        for (int k = 0; k < APPLY.length; k++) {
            String[] v = APPLY[k];
            Object doc = p(v[0]);
            String before = c(doc);
            eq(v[2], c(JsonPatch.applyPatch(doc, p(v[1]))), "apply " + k);
            eq(before, c(doc), "apply " + k + " leaves the input unchanged");
        }
        for (int k = 0; k < APPLY_INVALID.length; k++) {
            String[] v = APPLY_INVALID[k];
            Object doc = p(v[0]);
            String before = c(doc);
            throwsIae(() -> JsonPatch.applyPatch(doc, p(v[1])), "apply_invalid " + k);
            eq(before, c(doc), "apply_invalid " + k + " leaves the input unchanged");
        }
        for (int k = 0; k < MERGE.length; k++) {
            String[] v = MERGE[k];
            Object target = p(v[0]);
            String before = c(target);
            eq(v[2], c(JsonPatch.mergePatch(target, p(v[1]))), "merge " + k);
            eq(before, c(target), "merge " + k + " leaves the target unchanged");
        }
        for (int k = 0; k < CREATE.length; k++) {
            String[] v = CREATE[k];
            Object a = p(v[0]);
            Object b = p(v[1]);
            List<Object> patch = JsonPatch.createPatch(a, b);
            eq(v[2], c(patch), "create " + k);
            check(JsonPatch.equal(JsonPatch.applyPatch(a, patch), b), "create " + k + " round trip");
        }

        check(JsonPatch.equal(1L, 1.0), "1 equals 1.0");
        check(!JsonPatch.equal(Boolean.TRUE, 1L), "true is not 1");
        check(JsonPatch.equal(p("{\"a\":1,\"b\":2}"), p("{\"b\":2,\"a\":1}")), "key order ignored");
        check(!JsonPatch.equal(p("[1,2]"), p("[2,1]")), "array order matters");
        eq("1", c(1.0), "whole double prints as an integer");
        eq("2.5", c(2.5), "fraction keeps its decimal point");
        eq("\"\\u0001\\b\\f\\n\\r\\t\\\"\\\\/\u00e9\"", c("\u0001\b\f\n\r\t\"\\/\u00e9"), "string escapes");
        eq("{\"\\uffff\":1,\"\\ud83d\\ude00\":2}".replace("\\uffff", "\uffff").replace("\\ud83d\\ude00", "\ud83d\ude00"),
            c(p("{\"\\ud83d\\ude00\":2,\"\\uffff\":1}")), "keys sorted by code point, not UTF-16 unit");
        eq(Long.valueOf(12345678901L), p("12345678901"), "integers parse as Long");
        eq(Double.valueOf(0.5), p("0.5"), "fractions parse as Double");
        eq("[1,2]", c(JsonPatch.applyPatch(Map.of("a", 1L), List.of(Map.of("op", "replace", "path", "", "value", List.of(1L, 2L))))), "immutable inputs are copied");
        throwsIae(() -> JsonPatch.parse("1e999"), "infinite number rejected");
        throwsIae(() -> JsonPatch.parse("[".repeat(2000) + "]".repeat(2000)), "deep nesting rejected");

        System.out.println("JsonPatchTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
