// SPDX-License-Identifier: Apache-2.0
import GenlibSwift

func runIdentifierValidatorChecks(_ c: inout Checks) {
    c.check("identifier valid", IdentifierValidator.isValid("user_1", maxLength: 16))
    for bad in ["", "_bad", "a/b", "a b", "é"] {
        c.check("identifier invalid \(bad)", !IdentifierValidator.isValid(bad, maxLength: 16))
    }
    c.check("identifier limit", !IdentifierValidator.isValid("abcd", maxLength: 3))
}
