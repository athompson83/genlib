/** Strict ASCII application identifiers; not authentication or SQL sanitization. */
object IdentifierValidator {
    fun isValid(value: String?, maxLength: Int): Boolean {
        if (value.isNullOrEmpty() || maxLength < 1 || value.length > maxLength) return false
        return value.withIndex().all { (i, c) ->
            c in 'a'..'z' || c in 'A'..'Z' || c in '0'..'9' || (i > 0 && (c == '_' || c == '-'))
        }
    }
}
