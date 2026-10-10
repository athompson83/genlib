@main struct ValidatorTests {
    static func main() {
        precondition(IdentifierValidator.isValid("user_1", maxLength: 16))
        for bad in ["", "_bad", "a/b", "a b", "é"] {
            precondition(!IdentifierValidator.isValid(bad, maxLength: 16))
        }
        precondition(!IdentifierValidator.isValid("abcd", maxLength: 3))
    }
}
