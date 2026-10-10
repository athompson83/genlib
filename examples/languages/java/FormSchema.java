// SPDX-License-Identifier: Apache-2.0
import java.math.BigDecimal;
import java.math.BigInteger;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/** Server-side form validation against an ordered schema; returns stable error codes per field. */
public final class FormSchema {
    private FormSchema() {}

    public enum Type { STRING, NUMBER, INTEGER, BOOLEAN, EMAIL, DATE }

    /** Immutable field definition built fluently, e.g. {@code Field.of("name", Type.STRING).required().minLength(2)}. */
    public static final class Field {
        final String name;
        final Type type;
        boolean required;
        Integer minLength;
        Integer maxLength;
        Double min;
        Double max;
        Pattern pattern;
        List<String> allowed;

        private Field(String name, Type type) {
            if (name == null || name.isEmpty() || type == null) throw new IllegalArgumentException("field name and type are required");
            this.name = name;
            this.type = type;
        }

        public static Field of(String name, Type type) { return new Field(name, type); }
        public Field required() { required = true; return this; }
        public Field minLength(int n) { minLength = n; return this; }
        public Field maxLength(int n) { maxLength = n; return this; }
        public Field min(double n) { min = n; return this; }
        public Field max(double n) { max = n; return this; }
        public Field pattern(String regex) { pattern = Pattern.compile(regex); return this; }
        public Field enumValues(String... values) { allowed = List.of(values); return this; }
    }

    public static Map<String, List<String>> validate(List<Field> schema, Map<String, ?> values) {
        return validate(schema, values, false);
    }

    /** Returns field name to error codes, in schema order, then unknown keys in input order. */
    public static Map<String, List<String>> validate(List<Field> schema, Map<String, ?> values, boolean allowUnknown) {
        Map<String, List<String>> errors = new LinkedHashMap<>();
        Set<String> known = new HashSet<>();
        for (Field field : schema) {
            if (!known.add(field.name)) throw new IllegalArgumentException("duplicate field: " + field.name);
            List<String> codes = check(field, values.get(field.name));
            if (!codes.isEmpty()) errors.put(field.name, codes);
        }
        if (!allowUnknown) {
            for (String key : values.keySet()) if (!known.contains(key)) errors.put(key, List.of("unknown"));
        }
        return errors;
    }

    private static List<String> check(Field f, Object value) {
        List<String> codes = new ArrayList<>();
        if (value == null || "".equals(value)) {
            if (f.required) codes.add("required");
            return codes;
        }
        switch (f.type) {
            case BOOLEAN:
                if (!(value instanceof Boolean)) codes.add("type");
                return codes;
            case NUMBER:
            case INTEGER: {
                Double number = toFiniteDouble(value);
                if (number == null || f.type == Type.INTEGER && !isIntegral(value)) {
                    codes.add("type");
                    return codes;
                }
                if (f.min != null && number < f.min) codes.add("min");
                if (f.max != null && number > f.max) codes.add("max");
                return codes;
            }
            default:
                break;
        }
        if (!(value instanceof String)) {
            codes.add("type");
            return codes;
        }
        String s = (String) value;
        int length = s.codePointCount(0, s.length());
        if (f.minLength != null && length < f.minLength) codes.add("minLength");
        if (f.maxLength != null && length > f.maxLength) codes.add("maxLength");
        if (f.pattern != null && !f.pattern.matcher(s).matches()) codes.add("pattern");
        if (f.allowed != null && !f.allowed.contains(s)) codes.add("enum");
        if (f.type == Type.EMAIL && !isEmail(s)) codes.add("email");
        if (f.type == Type.DATE && !isDate(s)) codes.add("date");
        return codes;
    }

    private static Double toFiniteDouble(Object value) {
        if (!(value instanceof Number)) return null;
        double d = ((Number) value).doubleValue();
        return Double.isFinite(d) ? d : null;
    }

    private static boolean isIntegral(Object value) {
        if (value instanceof Integer || value instanceof Long || value instanceof Short || value instanceof Byte
                || value instanceof BigInteger) return true;
        if (value instanceof BigDecimal) return ((BigDecimal) value).stripTrailingZeros().scale() <= 0;
        double d = ((Number) value).doubleValue();
        return d == Math.rint(d);
    }

    private static boolean isEmail(String s) {
        if (s.length() > 254) return false;
        for (int i = 0; i < s.length(); i++) if (Character.isWhitespace(s.charAt(i)) || Character.isSpaceChar(s.charAt(i))) return false;
        int at = s.indexOf('@');
        if (at <= 0 || at != s.lastIndexOf('@')) return false;
        return s.substring(at + 1).indexOf('.') >= 0;
    }

    private static boolean isDate(String s) {
        if (!s.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) return false;
        try {
            LocalDate.of(Integer.parseInt(s.substring(0, 4)), Integer.parseInt(s.substring(5, 7)), Integer.parseInt(s.substring(8, 10)));
            return true;
        } catch (DateTimeException e) {
            return false;
        }
    }
}
