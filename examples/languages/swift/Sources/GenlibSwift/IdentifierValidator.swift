// SPDX-License-Identifier: Apache-2.0
/// Strict ASCII application identifier policy. Not authentication or SQL sanitization.
public enum IdentifierValidator {
    public static func isValid(_ value: String, maxLength: Int) -> Bool {
        guard maxLength > 0, !value.isEmpty, value.utf8.count <= maxLength else { return false }
        return value.utf8.enumerated().allSatisfy { index, c in
            (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || (index > 0 && (c == 95 || c == 45))
        }
    }
}
