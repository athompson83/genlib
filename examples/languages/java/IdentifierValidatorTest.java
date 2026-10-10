public final class IdentifierValidatorTest {
    public static void main(String[] args) {
        if (!IdentifierValidator.isValid("user_1", 16)) throw new AssertionError("valid rejected");
        for (String bad : new String[]{"", "_bad", "a/b", "a b", "é"}) {
            if (IdentifierValidator.isValid(bad, 16)) throw new AssertionError("invalid accepted: " + bad);
        }
        if (IdentifierValidator.isValid("abcd", 3)) throw new AssertionError("limit ignored");
    }
}
