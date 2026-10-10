/** Strict ASCII application identifier policy; not an authentication or SQL defense. */
public final class IdentifierValidator {
    private IdentifierValidator() {}
    public static boolean isValid(String value, int maxLength) {
        if (value == null || value.isEmpty() || maxLength < 1 || value.length() > maxLength) return false;
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            boolean alpha = c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z';
            boolean digit = c >= '0' && c <= '9';
            if (!(alpha || digit || i > 0 && (c == '_' || c == '-'))) return false;
        }
        return true;
    }
}
