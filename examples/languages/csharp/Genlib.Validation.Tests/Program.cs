// SPDX-License-Identifier: Apache-2.0
using System.Text;
using System.Text.RegularExpressions;
using Genlib.Validation;

int passed = 0, failed = 0;
void Check(string name, bool condition) {
    if (condition) passed++; else { failed++; Console.Error.WriteLine("FAIL: " + name); }
}
void Eq<T>(string name, T expected, T actual) {
    bool ok = EqualityComparer<T>.Default.Equals(expected, actual);
    if (!ok) Console.Error.WriteLine($"  expected <{expected}> got <{actual}>");
    Check(name, ok);
}
void Throws<TEx>(string name, Action action, Func<TEx, bool>? predicate = null) where TEx : Exception {
    try { action(); Check(name + " (no exception)", false); }
    catch (TEx ex) { Check(name, predicate?.Invoke(ex) ?? true); }
    catch (Exception ex) { Console.Error.WriteLine($"  unexpected {ex.GetType().Name}: {ex.Message}"); Check(name, false); }
}
byte[] Ascii(string s) => Encoding.ASCII.GetBytes(s);

// Identifier validation (existing checks)
Check("identifier valid", IdentifierValidator.IsValid("user_1", 16));
foreach (var bad in new[] { "", "_bad", "a/b", "a b", "é" }) Check("identifier invalid " + bad, !IdentifierValidator.IsValid(bad, 16));
Check("identifier limit", !IdentifierValidator.IsValid("abcd", 3));

// 1. TOTP
var hotpSecret = Ascii("12345678901234567890");
var hotpExpected = new[] { "755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489" };
for (int i = 0; i < hotpExpected.Length; i++) Eq($"hotp counter {i}", hotpExpected[i], Totp.Hotp(hotpSecret, (ulong)i));
var secrets = new Dictionary<string, byte[]> {
    ["SHA1"] = Ascii("12345678901234567890"),
    ["SHA256"] = Ascii("12345678901234567890123456789012"),
    ["SHA512"] = Ascii("1234567890123456789012345678901234567890123456789012345678901234"),
};
var totpVectors = new (long T, string Sha1, string Sha256, string Sha512)[] {
    (59, "94287082", "46119246", "90693936"), (1111111109, "07081804", "68084774", "25091201"),
    (1111111111, "14050471", "67062674", "99943326"), (1234567890, "89005924", "91819424", "93441116"),
    (2000000000, "69279037", "90698825", "38618901"), (20000000000, "65353130", "77737706", "47863826"),
};
foreach (var v in totpVectors) {
    Eq($"totp SHA1 t={v.T}", v.Sha1, Totp.Generate(secrets["SHA1"], v.T, digits: 8, algorithm: "SHA1"));
    Eq($"totp SHA256 t={v.T}", v.Sha256, Totp.Generate(secrets["SHA256"], v.T, digits: 8, algorithm: "SHA256"));
    Eq($"totp SHA512 t={v.T}", v.Sha512, Totp.Generate(secrets["SHA512"], v.T, digits: 8, algorithm: "SHA512"));
}
Eq("base32 encode", "MZXW6YTBOI", Totp.Base32Encode(Ascii("foobar")));
Eq("base32 decode", "foobar", Encoding.ASCII.GetString(Totp.Base32Decode("mzxw 6ytb-oi==")));
Throws<FormatException>("base32 invalid", () => Totp.Base32Decode("MZ1"));
string code59 = Totp.Generate(secrets["SHA1"], 59, digits: 8);
Check("verify t=59", Totp.Verify(code59, secrets["SHA1"], 59, digits: 8));
Check("verify t=89", Totp.Verify(code59, secrets["SHA1"], 89, digits: 8));
Check("verify t=150 rejected", !Totp.Verify(code59, secrets["SHA1"], 150, digits: 8));
Check("verify non-digit rejected", !Totp.Verify("abc", secrets["SHA1"], 59, digits: 8));
Check("verify wrong length rejected", !Totp.Verify("1234567", secrets["SHA1"], 59, digits: 8));
Eq("otpauth uri", "otpauth://totp/Acme%20Co:alice%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Acme%20Co&algorithm=SHA1&digits=6&period=30",
    Totp.OtpauthUri("Acme Co", "alice@example.com", "JBSWY3DPEHPK3PXP"));
var s1 = Totp.GenerateSecret(); var s2 = Totp.GenerateSecret();
Check("generateSecret length", s1.Length == 20 && !s1.SequenceEqual(s2));

// 2. OIDC PKCE
Eq("pkce challenge", "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", OidcPkce.CodeChallengeS256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"));
var req = new AuthorizationRequest("https://id.example.com/authorize", "app 1", "https://app.example.com/cb", new[] { "openid", "email" },
    "s1", "n1", "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
Eq("authorization url", "https://id.example.com/authorize?response_type=code&client_id=app%201&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcb&scope=openid%20email&state=s1&nonce=n1&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256",
    OidcPkce.BuildAuthorizationUrl(req));
Throws<ArgumentException>("http endpoint rejected", () => OidcPkce.BuildAuthorizationUrl(req with { AuthorizationEndpoint = "http://id.example.com/authorize" }));
Check("localhost endpoint accepted", OidcPkce.BuildAuthorizationUrl(req with { AuthorizationEndpoint = "http://localhost:8080/authorize" }).StartsWith("http://localhost:8080/authorize?response_type=code&"));
Check("existing query preserved", OidcPkce.BuildAuthorizationUrl(req with { AuthorizationEndpoint = "https://id.example.com/authorize?tenant=a", ExtraParams = new[] { KeyValuePair.Create("prompt", "login") } })
    .StartsWith("https://id.example.com/authorize?tenant=a&response_type=code&") );
Check("extra params appended", OidcPkce.BuildAuthorizationUrl(req with { ExtraParams = new[] { KeyValuePair.Create("prompt", "login") } }).EndsWith("&code_challenge_method=S256&prompt=login"));
Throws<ArgumentException>("scope without openid rejected", () => OidcPkce.BuildAuthorizationUrl(req with { Scope = new[] { "email" } }));
Eq("parse callback", "abc", OidcPkce.ParseCallback("https://app.example.com/cb?code=abc&state=s1", "s1"));
Throws<OidcCallbackException>("state mismatch", () => OidcPkce.ParseCallback("https://app.example.com/cb?code=abc&state=s1", "s2"), e => e.Error == "state_mismatch");
Throws<OidcCallbackException>("callback error", () => OidcPkce.ParseCallback("https://app.example.com/cb?error=access_denied&error_description=User%20denied&state=s1", "s1"),
    e => e.Error == "access_denied" && e.ErrorDescription == "User denied");
Throws<OidcCallbackException>("missing code", () => OidcPkce.ParseCallback("https://app.example.com/cb?state=s1", "s1"), e => e.Error == "missing_code");
Eq("token body", "grant_type=authorization_code&code=c+d&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcb&client_id=app&code_verifier=v",
    OidcPkce.TokenRequestBody("c d", "https://app.example.com/cb", "app", "v"));
var verifier = OidcPkce.GenerateCodeVerifier();
Check("verifier length/chars", verifier.Length == 64 && Regex.IsMatch(verifier, "^[A-Za-z0-9._~-]+$"));
Throws<ArgumentOutOfRangeException>("verifier 42 rejected", () => OidcPkce.GenerateCodeVerifier(42));
Throws<ArgumentOutOfRangeException>("verifier 129 rejected", () => OidcPkce.GenerateCodeVerifier(129));
var token = OidcPkce.RandomToken();
Check("random token", token.Length == 43 && Regex.IsMatch(token, "^[A-Za-z0-9_-]+$"));

// 3. Recovery codes
Eq("normalize spaces/case", "7K3QX9MNP2", RecoveryCodes.Normalize(" 7k3qx-9mnp2 "));
Eq("normalize O/I", "ABCDEFGH10", RecoveryCodes.Normalize("ABCDE-FGHIO"));
Throws<FormatException>("normalize U rejected", () => RecoveryCodes.Normalize("ABCDE-FGHIU"));
Throws<FormatException>("normalize length rejected", () => RecoveryCodes.Normalize("ABC"));
var pepper = Ascii("pepper");
Eq("hash vector", "b6a0f9ca8ffdc4e8e3268b490bb8beeda45f367550751b8cb151636dad869138", RecoveryCodes.Hash("7K3QX-9MNP2", pepper));
var generated = RecoveryCodes.Generate();
Check("generate count/unique", generated.Count == 10 && generated.Distinct().Count() == 10);
Check("generate format", generated.All(c => Regex.IsMatch(c, "^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$")));
var stored = generated.Take(3).Select(c => RecoveryCodes.Hash(c, pepper)).ToList();
Eq("find index 2", 2, RecoveryCodes.Find(generated[2].ToLowerInvariant(), stored, pepper));
Eq("find unknown", -1, RecoveryCodes.Find(generated[5], stored, pepper));
Eq("find invalid input", -1, RecoveryCodes.Find("bad", stored, pepper));

// 4. Calculator
Eq("2 + 3 * 4", 14.0, Calculator.Evaluate("2 + 3 * 4"));
Eq("(2+3)*4", 20.0, Calculator.Evaluate("(2+3)*4"));
Eq("2^3^2", 512.0, Calculator.Evaluate("2^3^2"));
Eq("-2^2", -4.0, Calculator.Evaluate("-2^2"));
Eq("10 % 4", 2.0, Calculator.Evaluate("10 % 4"));
Eq("-7 % 3", -1.0, Calculator.Evaluate("-7 % 3"));
Eq("1.5e2 / 3", 50.0, Calculator.Evaluate("1.5e2 / 3"));
Eq("a*2+b", 6.5, Calculator.Evaluate("a*2+b", new Dictionary<string, double> { ["a"] = 3, ["b"] = 0.5 }));
foreach (var bad in new[] { "1/0", "2 % 0", "(1+2", "1+", "x+1", "", "1 + 2)", "2^9999", new string('1', 1001) })
    Throws<CalculatorException>("calc error '" + (bad.Length > 20 ? bad[..20] + "..." : bad) + "'", () => Calculator.Evaluate(bad));
Eq("loan 200000/6/360", 1199.10, Calculator.LoanPayment(200000, 6, 360));
Eq("loan 10000/0/10", 1000.00, Calculator.LoanPayment(10000, 0, 10));
Eq("loan 1000/12/12", 88.85, Calculator.LoanPayment(1000, 12, 12));
var schedule = Calculator.AmortizationSchedule(1000, 12, 12);
Eq("schedule rows", 12, schedule.Count);
Check("schedule row1", schedule[0] == new AmortizationRow(1, 88.85, 10.00, 78.85, 921.15));
Eq("schedule last balance", 0.0, schedule[^1].Balance);
Eq("schedule principal sum", 100000L, schedule.Sum(r => (long)Math.Round(r.Principal * 100)));
Eq("compound 1000/5/12/10", 1647.01, Calculator.CompoundInterest(1000, 5, 12, 10));

// 5. Form schema
var schema = new[] {
    new FormField("name", FieldType.String, Required: true, MinLength: 2, MaxLength: 5),
    new FormField("age", FieldType.Integer, Min: 18, Max: 120),
    new FormField("email", FieldType.Email, Required: true),
    new FormField("plan", FieldType.String, Enum: new[] { "free", "pro" }),
    new FormField("code", FieldType.String, Pattern: @"[A-Z]{3}-\d{2}"),
    new FormField("start", FieldType.Date),
};
string Show(IReadOnlyList<FieldErrors> errors) => string.Join("; ", errors.Select(e => e.Field + ":[" + string.Join(",", e.Codes) + "]"));
IEnumerable<KeyValuePair<string, object?>> V(params (string, object?)[] pairs) => pairs.Select(p => KeyValuePair.Create(p.Item1, p.Item2));
Eq("form valid", "", Show(FormSchema.Validate(schema, V(("name", "Al"), ("age", 30), ("email", "a@b.co"), ("plan", "pro"), ("code", "ABC-12"), ("start", "2024-02-29")))));
Eq("form required/email", "name:[required]; email:[email]", Show(FormSchema.Validate(schema, V(("name", ""), ("email", "bad")))));
Eq("form many", "name:[maxLength]; age:[type]; plan:[enum]; code:[pattern]; start:[date]",
    Show(FormSchema.Validate(schema, V(("name", "Abcdef"), ("age", 17.5), ("email", "a@b.co"), ("plan", "team"), ("code", "abc-12"), ("start", "2023-02-29")))));
Eq("form numeric string", "age:[type]", Show(FormSchema.Validate(schema, V(("name", "Al"), ("email", "a@b.co"), ("age", "30")))));
Eq("form unknown", "extra:[unknown]", Show(FormSchema.Validate(schema, V(("name", "Al"), ("email", "a@b.co"), ("extra", 1)))));
Eq("form allowUnknown", "", Show(FormSchema.Validate(schema, V(("name", "Al"), ("email", "a@b.co"), ("extra", 1)), allowUnknown: true)));
Eq("form max", "age:[max]", Show(FormSchema.Validate(schema, V(("name", "Al"), ("email", "a@b.co"), ("age", 121)))));
Eq("form code points", "name:[minLength]", Show(FormSchema.Validate(schema, V(("name", "Ā"), ("email", "a@b.co")))));
Eq("form boolean not number", "age:[type]", Show(FormSchema.Validate(schema, V(("name", "Al"), ("email", "a@b.co"), ("age", true)))));

Console.WriteLine($"C# checks: {passed} passed, {failed} failed");
return failed == 0 ? 0 : 1;
