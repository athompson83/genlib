// SPDX-License-Identifier: Apache-2.0
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class FormSchemaTest {
    private static int passed;
    private static int failed;

    private static void eq(Object expected, Object actual, String name) {
        if (expected.equals(actual)) passed++;
        else { failed++; System.err.println("FAIL: " + name + " expected <" + expected + "> got <" + actual + ">"); }
    }

    private static Map<String, Object> values(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    private static Map<String, List<String>> errors(Object... kv) {
        Map<String, List<String>> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], List.of((String[]) kv[i + 1]));
        return m;
    }

    private static String[] codes(String... c) { return c; }

    public static void main(String[] args) {
        List<FormSchema.Field> s = List.of(
            FormSchema.Field.of("name", FormSchema.Type.STRING).required().minLength(2).maxLength(5),
            FormSchema.Field.of("age", FormSchema.Type.INTEGER).min(18).max(120),
            FormSchema.Field.of("email", FormSchema.Type.EMAIL).required(),
            FormSchema.Field.of("plan", FormSchema.Type.STRING).enumValues("free", "pro"),
            FormSchema.Field.of("code", FormSchema.Type.STRING).pattern("[A-Z]{3}-\\d{2}"),
            FormSchema.Field.of("start", FormSchema.Type.DATE));

        eq(errors(), FormSchema.validate(s, values("name", "Al", "age", 30, "email", "a@b.co", "plan", "pro",
            "code", "ABC-12", "start", "2024-02-29")), "valid submission");
        eq(errors("name", codes("required"), "email", codes("email")),
            FormSchema.validate(s, values("name", "", "email", "bad")), "required and email");
        Map<String, List<String>> many = FormSchema.validate(s, values("name", "Abcdef", "age", 17.5, "email", "a@b.co",
            "plan", "team", "code", "abc-12", "start", "2023-02-29"));
        eq(errors("name", codes("maxLength"), "age", codes("type"), "plan", codes("enum"), "code", codes("pattern"),
            "start", codes("date")), many, "multiple field errors");
        eq(List.of("name", "age", "plan", "code", "start"), List.copyOf(many.keySet()), "errors in schema order");
        eq(errors("age", codes("type")), FormSchema.validate(s, values("name", "Al", "email", "a@b.co", "age", "30")),
            "numeric string is a type error");
        eq(errors("extra", codes("unknown")), FormSchema.validate(s, values("name", "Al", "email", "a@b.co", "extra", 1)),
            "unknown key");
        eq(errors(), FormSchema.validate(s, values("name", "Al", "email", "a@b.co", "extra", 1), true), "allowUnknown");
        eq(errors("age", codes("max")), FormSchema.validate(s, values("name", "Al", "email", "a@b.co", "age", 121)), "max");
        eq(errors("name", codes("minLength")), FormSchema.validate(s, values("name", "Ā", "email", "a@b.co")),
            "length counts code points");
        eq(errors("age", codes("type")), FormSchema.validate(s, values("name", "Al", "email", "a@b.co", "age", true)),
            "boolean is not a number");

        System.out.println("FormSchemaTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
