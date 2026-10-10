// SPDX-License-Identifier: Apache-2.0
import java.math.BigDecimal
import java.math.BigInteger
import java.time.DateTimeException
import java.time.LocalDate

/** Server-side form validation against an ordered schema; returns stable error codes per field. */
object FormSchema {
    enum class Type { STRING, NUMBER, INTEGER, BOOLEAN, EMAIL, DATE }

    class Field(
        val name: String,
        val type: Type,
        val required: Boolean = false,
        val minLength: Int? = null,
        val maxLength: Int? = null,
        val min: Double? = null,
        val max: Double? = null,
        pattern: String? = null,
        val enum: List<String>? = null,
    ) {
        val pattern: Regex? = pattern?.let(::Regex)

        init { require(name.isNotEmpty()) { "field name is required" } }
    }

    private val DATE_SHAPE = Regex("[0-9]{4}-[0-9]{2}-[0-9]{2}")

    /** Returns field name to error codes, in schema order, then unknown keys in input order. */
    fun validate(schema: List<Field>, values: Map<String, Any?>, allowUnknown: Boolean = false): Map<String, List<String>> {
        val errors = LinkedHashMap<String, List<String>>()
        val known = HashSet<String>()
        for (field in schema) {
            require(known.add(field.name)) { "duplicate field: ${field.name}" }
            val codes = check(field, values[field.name])
            if (codes.isNotEmpty()) errors[field.name] = codes
        }
        if (!allowUnknown) for (key in values.keys) if (key !in known) errors[key] = listOf("unknown")
        return errors
    }

    private fun check(f: Field, value: Any?): List<String> {
        val codes = ArrayList<String>()
        if (value == null || value == "") {
            if (f.required) codes += "required"
            return codes
        }
        when (f.type) {
            Type.BOOLEAN -> { if (value !is Boolean) codes += "type"; return codes }
            Type.NUMBER, Type.INTEGER -> {
                val number = (value as? Number)?.toDouble()?.takeIf { it.isFinite() }
                if (number == null || (f.type == Type.INTEGER && !isIntegral(value as Number))) {
                    codes += "type"
                    return codes
                }
                if (f.min != null && number < f.min) codes += "min"
                if (f.max != null && number > f.max) codes += "max"
                return codes
            }
            else -> Unit
        }
        if (value !is String) { codes += "type"; return codes }
        val length = value.codePointCount(0, value.length)
        if (f.minLength != null && length < f.minLength) codes += "minLength"
        if (f.maxLength != null && length > f.maxLength) codes += "maxLength"
        if (f.pattern != null && !f.pattern.matches(value)) codes += "pattern"
        if (f.enum != null && value !in f.enum) codes += "enum"
        if (f.type == Type.EMAIL && !isEmail(value)) codes += "email"
        if (f.type == Type.DATE && !isDate(value)) codes += "date"
        return codes
    }

    private fun isIntegral(value: Number): Boolean = when (value) {
        is Int, is Long, is Short, is Byte, is BigInteger -> true
        is BigDecimal -> value.stripTrailingZeros().scale() <= 0
        else -> value.toDouble().let { it == Math.rint(it) }
    }

    private fun isEmail(s: String): Boolean {
        if (s.length > 254 || s.any { it.isWhitespace() || Character.isSpaceChar(it) }) return false
        val at = s.indexOf('@')
        return at > 0 && at == s.lastIndexOf('@') && '.' in s.substring(at + 1)
    }

    private fun isDate(s: String): Boolean {
        if (!DATE_SHAPE.matches(s)) return false
        return try {
            LocalDate.of(s.substring(0, 4).toInt(), s.substring(5, 7).toInt(), s.substring(8, 10).toInt())
            true
        } catch (e: DateTimeException) {
            false
        }
    }
}
