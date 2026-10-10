// SPDX-License-Identifier: Apache-2.0
import GenlibSwift

private func ascii(_ s: String) -> [UInt8] { Array(s.utf8) }

private func fullMatch(_ s: String, _ pattern: String) -> Bool {
    (try? Regex(pattern).wholeMatch(in: s)) != nil
}

func runTotpChecks(_ c: inout Checks) {
    let hotpSecret = ascii("12345678901234567890")
    let hotpExpected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"]
    for (i, expected) in hotpExpected.enumerated() {
        c.eq("hotp counter \(i)", expected, try Totp.hotp(secret: hotpSecret, counter: UInt64(i)))
    }
    let sha1 = ascii("12345678901234567890")
    let sha256 = ascii("12345678901234567890123456789012")
    let sha512 = ascii("1234567890123456789012345678901234567890123456789012345678901234")
    let vectors: [(Int64, String, String, String)] = [
        (59, "94287082", "46119246", "90693936"), (1111111109, "07081804", "68084774", "25091201"),
        (1111111111, "14050471", "67062674", "99943326"), (1234567890, "89005924", "91819424", "93441116"),
        (2000000000, "69279037", "90698825", "38618901"), (20000000000, "65353130", "77737706", "47863826"),
    ]
    for (t, e1, e256, e512) in vectors {
        c.eq("totp SHA1 t=\(t)", e1, try Totp.totp(secret: sha1, unixSeconds: t, digits: 8, algorithm: .sha1))
        c.eq("totp SHA256 t=\(t)", e256, try Totp.totp(secret: sha256, unixSeconds: t, digits: 8, algorithm: .sha256))
        c.eq("totp SHA512 t=\(t)", e512, try Totp.totp(secret: sha512, unixSeconds: t, digits: 8, algorithm: .sha512))
    }
    c.eq("base32 encode", "MZXW6YTBOI", Totp.base32Encode(ascii("foobar")))
    c.eq("base32 decode", ascii("foobar"), try Totp.base32Decode("mzxw 6ytb-oi=="))
    c.throwsError("base32 invalid", { _ = try Totp.base32Decode("MZ1") }, where: { $0 as? TotpError == .invalidBase32Character("1") })
    let code59 = (try? Totp.totp(secret: sha1, unixSeconds: 59, digits: 8)) ?? ""
    c.eq("verify t=59", true, try Totp.verify(code: code59, secret: sha1, unixSeconds: 59, digits: 8))
    c.eq("verify t=89", true, try Totp.verify(code: code59, secret: sha1, unixSeconds: 89, digits: 8))
    c.eq("verify t=150 rejected", false, try Totp.verify(code: code59, secret: sha1, unixSeconds: 150, digits: 8))
    c.eq("verify non-digit rejected", false, try Totp.verify(code: "abc", secret: sha1, unixSeconds: 59, digits: 8))
    c.eq("verify wrong length rejected", false, try Totp.verify(code: "1234567", secret: sha1, unixSeconds: 59, digits: 8))
    c.eq("otpauth uri",
         "otpauth://totp/Acme%20Co:alice%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Acme%20Co&algorithm=SHA1&digits=6&period=30",
         try Totp.otpauthURI(issuer: "Acme Co", account: "alice@example.com", secretBase32: "JBSWY3DPEHPK3PXP"))
    let a = (try? Totp.generateSecret()) ?? [], b = (try? Totp.generateSecret()) ?? []
    c.check("generateSecret length/distinct", a.count == 20 && a != b)
}

func runOidcPkceChecks(_ c: inout Checks) {
    let challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    c.eq("pkce challenge", challenge, try OidcPkce.codeChallengeS256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"))
    func request(_ endpoint: String = "https://id.example.com/authorize", scope: [String] = ["openid", "email"],
                 extra: [(String, String)] = []) -> AuthorizationRequest {
        AuthorizationRequest(authorizationEndpoint: endpoint, clientId: "app 1", redirectUri: "https://app.example.com/cb", scope: scope,
                             state: "s1", nonce: "n1", codeChallenge: challenge, extraParams: extra)
    }
    c.eq("authorization url",
         "https://id.example.com/authorize?response_type=code&client_id=app%201&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcb&scope=openid%20email&state=s1&nonce=n1&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256",
         try OidcPkce.buildAuthorizationURL(request()))
    c.eq("scope string accepted", try? OidcPkce.buildAuthorizationURL(request()), try OidcPkce.buildAuthorizationURL(request(scope: ["openid email"])))
    c.throwsError("http endpoint rejected", { _ = try OidcPkce.buildAuthorizationURL(request("http://id.example.com/authorize")) })
    c.throwsError("http userinfo trick rejected", { _ = try OidcPkce.buildAuthorizationURL(request("http://localhost@evil.example/authorize")) })
    c.eq("localhost endpoint accepted", true,
         try OidcPkce.buildAuthorizationURL(request("http://localhost:8080/authorize")).hasPrefix("http://localhost:8080/authorize?response_type=code&"))
    c.eq("existing query preserved", true,
         try OidcPkce.buildAuthorizationURL(request("https://id.example.com/authorize?tenant=a")).hasPrefix("https://id.example.com/authorize?tenant=a&response_type=code&"))
    c.eq("extra params appended", true,
         try OidcPkce.buildAuthorizationURL(request(extra: [("prompt", "login")])).hasSuffix("&code_challenge_method=S256&prompt=login"))
    c.throwsError("scope without openid rejected", { _ = try OidcPkce.buildAuthorizationURL(request(scope: ["email"])) })
    c.eq("parse callback", "abc", try OidcPkce.parseCallback("https://app.example.com/cb?code=abc&state=s1", expectedState: "s1"))
    c.throwsError("state mismatch", { _ = try OidcPkce.parseCallback("https://app.example.com/cb?code=abc&state=s1", expectedState: "s2") },
                  where: { $0 as? OidcError == .callback(error: "state_mismatch", description: nil) })
    c.throwsError("callback error", {
        _ = try OidcPkce.parseCallback("https://app.example.com/cb?error=access_denied&error_description=User%20denied&state=s1", expectedState: "s1")
    }, where: { $0 as? OidcError == .callback(error: "access_denied", description: "User denied") })
    c.throwsError("missing code", { _ = try OidcPkce.parseCallback("https://app.example.com/cb?state=s1", expectedState: "s1") },
                  where: { $0 as? OidcError == .callback(error: "missing_code", description: nil) })
    c.eq("token body",
         "grant_type=authorization_code&code=c+d&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcb&client_id=app&code_verifier=v",
         try OidcPkce.tokenRequestBody(code: "c d", redirectUri: "https://app.example.com/cb", clientId: "app", codeVerifier: "v"))
    let verifier = (try? OidcPkce.generateCodeVerifier()) ?? ""
    c.check("verifier length/chars", verifier.count == 64 && fullMatch(verifier, "[A-Za-z0-9._~-]+"))
    c.throwsError("verifier 42 rejected", { _ = try OidcPkce.generateCodeVerifier(length: 42) })
    c.throwsError("verifier 129 rejected", { _ = try OidcPkce.generateCodeVerifier(length: 129) })
    let token = (try? OidcPkce.randomToken()) ?? ""
    c.check("random token", token.count == 43 && fullMatch(token, "[A-Za-z0-9_-]+"))
}

func runRecoveryCodeChecks(_ c: inout Checks) {
    c.eq("normalize spaces/case", "7K3QX9MNP2", try RecoveryCodes.normalize(" 7k3qx-9mnp2 "))
    c.eq("normalize O/I", "ABCDEFGH10", try RecoveryCodes.normalize("ABCDE-FGHIO"))
    c.throwsError("normalize U rejected", { _ = try RecoveryCodes.normalize("ABCDE-FGHIU") },
                  where: { $0 as? RecoveryCodeError == .invalidCharacter("U") })
    c.throwsError("normalize length rejected", { _ = try RecoveryCodes.normalize("ABC") },
                  where: { $0 as? RecoveryCodeError == .invalidLength(expected: 10) })
    let pepper = ascii("pepper")
    c.eq("hash vector", "b6a0f9ca8ffdc4e8e3268b490bb8beeda45f367550751b8cb151636dad869138", try RecoveryCodes.hash("7K3QX-9MNP2", key: pepper))
    let codes = (try? RecoveryCodes.generate()) ?? []
    c.check("generate count/unique", codes.count == 10 && Set(codes).count == 10)
    c.check("generate format", codes.allSatisfy { fullMatch($0, "[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}") })
    guard codes.count == 10 else { return }
    let stored = codes.prefix(3).compactMap { try? RecoveryCodes.hash($0, key: pepper) }
    c.eq("find index 2", 2, try RecoveryCodes.find(codes[2].lowercased(), storedHashes: stored, key: pepper))
    c.eq("find unknown", nil, try RecoveryCodes.find(codes[5], storedHashes: stored, key: pepper))
    c.eq("find invalid input", nil, try RecoveryCodes.find("bad", storedHashes: stored, key: pepper))
}

func runCalculatorChecks(_ c: inout Checks) {
    c.eq("2 + 3 * 4", 14, try Calculator.evaluate("2 + 3 * 4"))
    c.eq("(2+3)*4", 20, try Calculator.evaluate("(2+3)*4"))
    c.eq("2^3^2", 512, try Calculator.evaluate("2^3^2"))
    c.eq("-2^2", -4, try Calculator.evaluate("-2^2"))
    c.eq("10 % 4", 2, try Calculator.evaluate("10 % 4"))
    c.eq("-7 % 3", -1, try Calculator.evaluate("-7 % 3"))
    c.eq("1.5e2 / 3", 50, try Calculator.evaluate("1.5e2 / 3"))
    c.eq("a*2+b", 6.5, try Calculator.evaluate("a*2+b", variables: ["a": 3, "b": 0.5]))
    for bad in ["1/0", "2 % 0", "(1+2", "1+", "x+1", "", "1 + 2)", "2^9999", String(repeating: "1", count: 1001)] {
        c.throwsError("calc error '\(bad.prefix(20))'", { _ = try Calculator.evaluate(bad) }, where: { $0 is CalculatorError })
    }
    c.eq("loan 200000/6/360", 1199.10, try Calculator.loanPayment(principal: 200000, annualRatePercent: 6, months: 360))
    c.eq("loan 10000/0/10", 1000.00, try Calculator.loanPayment(principal: 10000, annualRatePercent: 0, months: 10))
    c.eq("loan 1000/12/12", 88.85, try Calculator.loanPayment(principal: 1000, annualRatePercent: 12, months: 12))
    let schedule = (try? Calculator.amortizationSchedule(principal: 1000, annualRatePercent: 12, months: 12)) ?? []
    c.eq("schedule rows", 12, schedule.count)
    guard schedule.count == 12 else { return }
    c.eq("schedule row1", AmortizationRow(period: 1, payment: 88.85, interest: 10.00, principal: 78.85, balance: 921.15), schedule[0])
    c.eq("schedule last balance", 0.0, schedule[11].balance)
    c.eq("schedule principal sum", 100000, schedule.reduce(0) { $0 + Int(($1.principal * 100).rounded()) })
    c.eq("compound 1000/5/12/10", 1647.01, try Calculator.compoundInterest(principal: 1000, annualRatePercent: 5, compoundsPerYear: 12, years: 10))
}

func runFormSchemaChecks(_ c: inout Checks) {
    let schema = [
        FormField("name", .string, required: true, minLength: 2, maxLength: 5),
        FormField("age", .integer, min: 18, max: 120),
        FormField("email", .email, required: true),
        FormField("plan", .string, allowed: ["free", "pro"]),
        FormField("code", .string, pattern: #"[A-Z]{3}-\d{2}"#),
        FormField("start", .date),
    ]
    func show(_ values: KeyValuePairs<String, FormValue>, allowUnknown: Bool = false) throws -> String {
        try FormSchema.validate(schema, values, allowUnknown: allowUnknown)
            .map { "\($0.field):[\($0.codes.joined(separator: ","))]" }.joined(separator: "; ")
    }
    c.eq("form valid", "", try show(["name": "Al", "age": 30, "email": "a@b.co", "plan": "pro", "code": "ABC-12", "start": "2024-02-29"]))
    c.eq("form required/email", "name:[required]; email:[email]", try show(["name": "", "email": "bad"]))
    c.eq("form many", "name:[maxLength]; age:[type]; plan:[enum]; code:[pattern]; start:[date]",
         try show(["name": "Abcdef", "age": 17.5, "email": "a@b.co", "plan": "team", "code": "abc-12", "start": "2023-02-29"]))
    c.eq("form numeric string", "age:[type]", try show(["name": "Al", "email": "a@b.co", "age": "30"]))
    c.eq("form unknown", "extra:[unknown]", try show(["name": "Al", "email": "a@b.co", "extra": 1]))
    c.eq("form allowUnknown", "", try show(["name": "Al", "email": "a@b.co", "extra": 1], allowUnknown: true))
    c.eq("form max", "age:[max]", try show(["name": "Al", "email": "a@b.co", "age": 121]))
    c.eq("form code points", "name:[minLength]", try show(["name": "\u{0100}", "email": "a@b.co"]))
    c.eq("form boolean not number", "age:[type]", try show(["name": "Al", "email": "a@b.co", "age": true]))
}
