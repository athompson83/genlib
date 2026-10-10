// SPDX-License-Identifier: Apache-2.0
// Runs every Swift example check: `swift run GenlibSwiftChecks` (exits 1 on failure).
#if canImport(Glibc)
import Glibc
#elseif canImport(Darwin)
import Darwin
#endif
import GenlibSwift

var c = Checks()
runIdentifierValidatorChecks(&c)
runTotpChecks(&c)
runOidcPkceChecks(&c)
runRecoveryCodeChecks(&c)
runCalculatorChecks(&c)
runFormSchemaChecks(&c)
runSeoFilesChecks(&c)
runStructuredDataChecks(&c)
runUtmLinksChecks(&c)
runCsvSafeChecks(&c)
runMoneyChecks(&c)
runSignedCursorChecks(&c)
runIcsEventsChecks(&c)
print("Swift checks: \(c.passed) passed, \(c.failed) failed")
exit(c.failed == 0 ? 0 : 1)
