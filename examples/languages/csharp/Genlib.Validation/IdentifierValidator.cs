namespace Genlib.Validation;
/// <summary>Strict ASCII application identifiers; not authorization or SQL sanitization.</summary>
public static class IdentifierValidator {
    public static bool IsValid(string? value, int maxLength) {
        if (string.IsNullOrEmpty(value) || maxLength < 1 || value.Length > maxLength) return false;
        for (int i = 0; i < value.Length; i++) {
            char c = value[i];
            bool alpha = c is >= 'a' and <= 'z' or >= 'A' and <= 'Z';
            bool digit = c is >= '0' and <= '9';
            if (!(alpha || digit || (i > 0 && (c == '_' || c == '-')))) return false;
        }
        return true;
    }
}
