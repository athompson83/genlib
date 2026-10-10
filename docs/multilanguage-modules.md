# Multilanguage reusable code: first validated cohort

Genlib now includes small original Apache-2.0 **application identifier policy** examples for Rust, Java, C#, Swift, Kotlin and Dart, alongside Python/Go pagination. These examples are not production authentication, database query sanitization, OAuth, or a claim of native component parity. They are not yet registered in the Genlib module installer.

## Integration contract

Input: nullable/optional string where supported, positive maximum length. Accept ASCII letters and digits at the first position, and letters, digits, underscore or hyphen thereafter. Reject empty values, Unicode characters, whitespace, path separators and strings over the maximum. This is a deliberate restrictive *application identifier* rule, not a general username or internationalized-text validator.

## Standalone verification

- Rust 1.75+: `cd examples/languages/rust && cargo test --offline`
- Java 17+: `cd examples/languages/java && javac IdentifierValidator.java IdentifierValidatorTest.java && java IdentifierValidatorTest`
- .NET 8: `dotnet run --project examples/languages/csharp/Genlib.Validation.Tests`
- Swift 5.9+: `cd examples/languages/swift && swiftc IdentifierValidator.swift IdentifierValidatorTests.swift -o /tmp/genlib-validator && /tmp/genlib-validator`
- Kotlin/JVM 1.9+: `cd examples/languages/kotlin && kotlinc IdentifierValidator.kt IdentifierValidatorTest.kt -include-runtime -d /tmp/genlib-kotlin-validator.jar && java -jar /tmp/genlib-kotlin-validator.jar`
- Dart 3+: `cd examples/languages/dart && dart run test/identifier_validator_test.dart`

The GitHub workflow provides independent verification lanes. Any language without a successful CI lane remains unverified. The code is dependency-free and uses only standard runtime libraries. Each consuming project must supply its own authorization, persistence, input normalization policies, and full integration tests. Versioned installer contracts, native UI components, authentication adapters and broader API clients remain future work.
