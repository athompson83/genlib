fun main() {
    check(IdentifierValidator.isValid("user_1", 16))
    for (bad in listOf("", "_bad", "a/b", "a b", "é")) check(!IdentifierValidator.isValid(bad, 16))
    check(!IdentifierValidator.isValid("abcd", 3))
}
