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

// 6. SEO files
Eq("sitemap vector", "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n  <url>\n    <loc>https://example.com/</loc>\n    <lastmod>2026-10-01</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>\n  <url>\n    <loc>https://example.com/a?x=1&amp;y=2</loc>\n  </url>\n</urlset>\n",
    SeoFiles.SitemapXml(new[] { new SitemapEntry("https://example.com/", "2026-10-01", "weekly", 1), new SitemapEntry("https://example.com/a?x=1&y=2") }));
Check("sitemap escapes quotes", SeoFiles.SitemapXml(new[] { new SitemapEntry("https://ex.com/'\"<>") }).Contains("<loc>https://ex.com/&apos;&quot;&lt;&gt;</loc>"));
Check("sitemap priority one decimal", SeoFiles.SitemapXml(new[] { new SitemapEntry("https://ex.com/", Priority: 0.25) }).Contains("<priority>0.3</priority>"));
Throws<ArgumentException>("sitemap relative loc", () => SeoFiles.SitemapXml(new[] { new SitemapEntry("/a") }));
Throws<ArgumentException>("sitemap ftp loc", () => SeoFiles.SitemapXml(new[] { new SitemapEntry("ftp://ex.com/") }));
Throws<ArgumentException>("sitemap bad lastmod", () => SeoFiles.SitemapXml(new[] { new SitemapEntry("https://ex.com/", "2026-13-01") }));
Throws<ArgumentException>("sitemap bad changefreq", () => SeoFiles.SitemapXml(new[] { new SitemapEntry("https://ex.com/", Changefreq: "often") }));
Throws<ArgumentException>("sitemap priority > 1", () => SeoFiles.SitemapXml(new[] { new SitemapEntry("https://ex.com/", Priority: 1.5) }));
Throws<ArgumentException>("sitemap > 50000", () => SeoFiles.SitemapXml(Enumerable.Repeat(new SitemapEntry("https://ex.com/"), 50_001).ToList()));
var robotRules = new[] { new RobotsRule("*", Disallow: new[] { "/admin" }) };
Eq("robots vector", "User-agent: *\nDisallow: /admin\n\nUser-agent: GPTBot\nUser-agent: ChatGPT-User\nUser-agent: OAI-SearchBot\nUser-agent: ClaudeBot\nUser-agent: Claude-Web\nUser-agent: anthropic-ai\nUser-agent: Google-Extended\nUser-agent: PerplexityBot\nUser-agent: CCBot\nUser-agent: Bytespider\nUser-agent: Applebot-Extended\nUser-agent: Meta-ExternalAgent\nDisallow: /\n\nSitemap: https://example.com/sitemap.xml\n",
    SeoFiles.RobotsTxt(robotRules, AiCrawlerPolicy.Disallow, new[] { "https://example.com/sitemap.xml" }));
Eq("robots default no sitemaps", "User-agent: *\nDisallow: /admin\n", SeoFiles.RobotsTxt(robotRules, AiCrawlerPolicy.Default));
Check("robots allow AI", SeoFiles.RobotsTxt(robotRules, AiCrawlerPolicy.Allow).EndsWith("User-agent: Meta-ExternalAgent\nAllow: /\n"));
Eq("robots allow then disallow", "User-agent: Googlebot\nAllow: /public\nDisallow: /*.pdf$\n", SeoFiles.RobotsTxt(new[] { new RobotsRule("Googlebot", new[] { "/public" }, new[] { "/*.pdf$" }) }));
Throws<ArgumentException>("robots bad path", () => SeoFiles.RobotsTxt(new[] { new RobotsRule("*", Disallow: new[] { "admin" }) }));
Throws<ArgumentException>("robots newline injection", () => SeoFiles.RobotsTxt(new[] { new RobotsRule("*\nDisallow: /", Disallow: new[] { "/a" }) }));
Throws<ArgumentException>("robots path newline", () => SeoFiles.RobotsTxt(new[] { new RobotsRule("*", Disallow: new[] { "/a\r\nSitemap: x" }) }));
Throws<ArgumentException>("robots relative sitemap", () => SeoFiles.RobotsTxt(robotRules, sitemaps: new[] { "/sitemap.xml" }));
var llmsSections = new[] {
    new LlmsSection("Docs", new[] { new LlmsLink("Quickstart", "https://acme.dev/start", "Install and launch"), new LlmsLink("API [v2]", "https://acme.dev/api") }),
    new LlmsSection("Optional", new[] { new LlmsLink("Blog", "https://acme.dev/blog") }),
};
Eq("llms vector", "# Acme\n\n> Acme builds rockets.\n\n## Docs\n\n- [Quickstart](https://acme.dev/start): Install and launch\n- [API [v2\\]](https://acme.dev/api)\n\n## Optional\n\n- [Blog](https://acme.dev/blog)\n",
    SeoFiles.LlmsTxt("Acme", "Acme builds rockets.", llmsSections));
Throws<ArgumentException>("llms empty title", () => SeoFiles.LlmsTxt("", "s", llmsSections));
Throws<ArgumentException>("llms relative url", () => SeoFiles.LlmsTxt("Acme", "s", new[] { new LlmsSection("Docs", new[] { new LlmsLink("a", "/a") }) }));
Throws<ArgumentException>("llms newline", () => SeoFiles.LlmsTxt("Acme", "line1\nline2", llmsSections));

// 7. Structured data
Eq("json-ld vector", "<script type=\"application/ld+json\">{\"@context\":\"https://schema.org\",\"@type\":\"Organization\",\"name\":\"A\\u0026B \\u003c/script\\u003e\",\"url\":\"https://ab.example\",\"sameAs\":[\"https://x.com/ab\"]}</script>",
    StructuredData.JsonLdScript(new List<KeyValuePair<string, object?>> {
        new("@context", "https://schema.org"), new("@type", "Organization"), new("name", "A&B </script>"), new("url", "https://ab.example"), new("sameAs", new[] { "https://x.com/ab" }),
    }));
Eq("json-ld scalars", "<script type=\"application/ld+json\">{\"n\":3,\"f\":2.5,\"w\":2,\"t\":true,\"z\":null,\"s\":\"q\\\"\\\\\\n\\u2028\\u2029\",\"o\":{\"a\":[]}}</script>",
    StructuredData.JsonLdScript(new Dictionary<string, object?> { ["n"] = 3, ["f"] = 2.5, ["w"] = 2.0, ["t"] = true, ["z"] = null, ["s"] = "q\"\\\n\u2028\u2029", ["o"] = new Dictionary<string, object?> { ["a"] = new List<object>() } }));
Throws<ArgumentException>("json-ld NaN", () => StructuredData.JsonLdScript(new Dictionary<string, object?> { ["x"] = double.NaN }));
Throws<ArgumentException>("json-ld Infinity", () => StructuredData.JsonLdScript(new Dictionary<string, object?> { ["x"] = double.PositiveInfinity }));
Eq("meta vector", "<title>Tom &amp; &quot;Jerry&quot;</title>\n<meta name=\"description\" content=\"Cat &lt;3 mouse\">\n<link rel=\"canonical\" href=\"https://ex.com/tj\">\n<meta property=\"og:title\" content=\"Tom &amp; &quot;Jerry&quot;\">\n<meta property=\"og:description\" content=\"Cat &lt;3 mouse\">\n<meta property=\"og:url\" content=\"https://ex.com/tj\">\n<meta property=\"og:image\" content=\"https://ex.com/tj.png\">\n<meta property=\"og:site_name\" content=\"Ex\">\n<meta property=\"og:type\" content=\"website\">\n<meta name=\"twitter:card\" content=\"summary_large_image\">\n<meta name=\"twitter:title\" content=\"Tom &amp; &quot;Jerry&quot;\">\n<meta name=\"twitter:description\" content=\"Cat &lt;3 mouse\">\n<meta name=\"twitter:image\" content=\"https://ex.com/tj.png\">",
    StructuredData.MetaTags(new MetaTagOptions("Tom & \"Jerry\"", "Cat <3 mouse", "https://ex.com/tj", "https://ex.com/tj.png", "Ex")));
Eq("meta title only", "<title>T</title>\n<meta property=\"og:title\" content=\"T\">\n<meta property=\"og:type\" content=\"website\">\n<meta name=\"twitter:card\" content=\"summary_large_image\">\n<meta name=\"twitter:title\" content=\"T\">",
    StructuredData.MetaTags(new MetaTagOptions("T")));
Eq("meta title only 5 lines", 5, StructuredData.MetaTags(new MetaTagOptions("T")).Split('\n').Length);
Throws<ArgumentException>("meta http canonical", () => StructuredData.MetaTags(new MetaTagOptions("T", Canonical: "http://ex.com")));
Throws<ArgumentException>("meta bad twitter card", () => StructuredData.MetaTags(new MetaTagOptions("T", TwitterCard: "big")));
Throws<ArgumentException>("meta empty title", () => StructuredData.MetaTags(new MetaTagOptions(" ")));

// 8. UTM links
Eq("utm build vector 1", "https://ex.com/p?ref=a&utm_source=newsletter&utm_medium=email&utm_campaign=fall%20sale#top",
    UtmLinks.BuildUtmUrl("https://ex.com/p?ref=a#top", new UtmParameters("Newsletter", "email", "Fall Sale")));
Eq("utm build vector 2", "https://ex.com/?utm_source=x&utm_medium=y&utm_campaign=z&utm_content=hero%20cta",
    UtmLinks.BuildUtmUrl("https://ex.com/?utm_source=old", new UtmParameters("x", "y", "z", Content: "Hero CTA")));
Eq("utm build id first", "https://ex.com/?utm_id=c1&utm_source=a&utm_medium=b&utm_campaign=c&utm_term=t", UtmLinks.BuildUtmUrl("https://ex.com/", new UtmParameters(" A ", "b", "c", "t", Id: "C1")));
Throws<ArgumentException>("utm missing campaign", () => UtmLinks.BuildUtmUrl("https://ex.com/", new UtmParameters("a", "b", "  ")));
Throws<ArgumentException>("utm relative base", () => UtmLinks.BuildUtmUrl("/p", new UtmParameters("a", "b", "c")));
Throws<ArgumentException>("utm javascript base", () => UtmLinks.BuildUtmUrl("javascript:alert(1)", new UtmParameters("a", "b", "c")));
var parsedUtm = UtmLinks.ParseUtm("https://ex.com/?a=1&utm_campaign=fall%20sale&utm_source=news+letter&utm_source=dup");
Eq("utm parse vector", "source=news letter;campaign=fall sale", string.Join(";", parsedUtm.ToPairs().Select(p => p.Key + "=" + p.Value)));
Check("utm parse record", parsedUtm == new UtmParameters(Source: "news letter", Campaign: "fall sale"));
Eq("utm strip vector 1", "https://ex.com/p?id=7&b=2#s", UtmLinks.StripTracking("https://ex.com/p?id=7&utm_source=x&gclid=abc&b=2#s"));
Eq("utm strip vector 2", "https://ex.com/", UtmLinks.StripTracking("https://ex.com/?fbclid=1"));
Eq("utm strip keeps encoding", "https://ex.com/?q=a%20b+c", UtmLinks.StripTracking("https://ex.com/?q=a%20b+c&msclkid=9&_hsenc=x"));

// 9. CSV (RFC 4180, formula neutralization)
var csvRows = new[] {
    new[] { "id", "name", "note" }, new[] { "1", "Ada, Lovelace", "said \"hi\"" },
    new[] { "2", "=SUM(A1)", "line1\nline2" }, new[] { "3", " padded", "-5" },
};
Eq("csv write vector", "id,name,note\r\n1,\"Ada, Lovelace\",\"said \"\"hi\"\"\"\r\n2,'=SUM(A1),\"line1\nline2\"\r\n3,\" padded\",'-5\r\n", CsvSafe.WriteCsv(csvRows));
Eq("csv neutralize off", "=1\r\n", CsvSafe.WriteCsv(new[] { new[] { "=1" } }, false));
Eq("csv empty rows", "", CsvSafe.WriteCsv(Array.Empty<string[]>()));
string CsvShow(List<List<string>> rows) => string.Join("|", rows.Select(r => "[" + string.Join("¦", r) + "]"));
Eq("csv parse vector", CsvShow(new() { new() { "a", "b" }, new() { "x,1", "say \"hi\"" }, new() { "multi\nline", "" } }),
    CsvShow(CsvSafe.ParseCsv("a,b\r\n\"x,1\",\"say \"\"hi\"\"\"\n\"multi\nline\",\n")));
Eq("csv parse BOM", "[a]", CsvShow(CsvSafe.ParseCsv("﻿a\n")));
Eq("csv parse empty", 0, CsvSafe.ParseCsv("").Count);
foreach (var bad in new[] { "a,\"b", "a\"b", "\"a\"x" }) Throws<FormatException>("csv parse error " + bad, () => CsvSafe.ParseCsv(bad));
Eq("csv round trip", CsvShow(csvRows.Select(r => r.ToList()).ToList()), CsvShow(CsvSafe.ParseCsv(CsvSafe.WriteCsv(csvRows, false))));

// 10. Money (minor units)
Eq("toMinor 12.34 USD", 1234L, Money.ToMinor("12.34", "USD"));
Eq("toMinor -0.5 USD", -50L, Money.ToMinor("-0.5", "USD"));
Eq("toMinor 1000 JPY", 1000L, Money.ToMinor("1000", "JPY"));
Eq("toMinor 1.234 BHD", 1234L, Money.ToMinor("1.234", "BHD"));
Eq("toMinor 7 USD", 700L, Money.ToMinor("7", "USD"));
foreach (var (amount, cur) in new[] { ("1.5", "JPY"), ("12.345", "USD"), ("1,000.00", "USD"), (".5", "USD"), ("12", "XXX"), ("12", "usd"), ("5.", "USD"), ("1e3", "USD"), (" 1", "USD"), ("+1", "USD") })
    Throws<ArgumentException>($"toMinor error {amount} {cur}", () => Money.ToMinor(amount, cur));
Throws<OverflowException>("toMinor overflow", () => Money.ToMinor("99999999999999999999", "USD"));
Eq("format 1234 USD", "12.34", Money.FormatMinor(1234, "USD"));
Eq("format -5 USD", "-0.05", Money.FormatMinor(-5, "USD"));
Eq("format 500 JPY", "500", Money.FormatMinor(500, "JPY"));
Eq("format 1 BHD", "0.001", Money.FormatMinor(1, "BHD"));
Eq("format 0 EUR", "0.00", Money.FormatMinor(0, "EUR"));
Eq("applyRate 1999 0.0825", 165L, Money.ApplyRate(1999, "0.0825"));
Eq("applyRate 25 0.5", 12L, Money.ApplyRate(25, "0.5"));
Eq("applyRate 35 0.5", 18L, Money.ApplyRate(35, "0.5"));
Eq("applyRate -25 0.5", -12L, Money.ApplyRate(-25, "0.5"));
Eq("applyRate 1000 1.07", 1070L, Money.ApplyRate(1000, "1.07"));
Throws<ArgumentException>("applyRate 10 fraction digits", () => Money.ApplyRate(1, "0.0000000001"));
Throws<OverflowException>("applyRate overflow", () => Money.ApplyRate(long.MaxValue, "2"));
string Join(long[] a) => string.Join(",", a);
Eq("allocate 100 [1,1,1]", "34,33,33", Join(Money.Allocate(100, new long[] { 1, 1, 1 })));
Eq("allocate 5 [3,7]", "2,3", Join(Money.Allocate(5, new long[] { 3, 7 })));
Eq("allocate -100 [1,1,1]", "-34,-33,-33", Join(Money.Allocate(-100, new long[] { 1, 1, 1 })));
Eq("allocate 1000 [0,1]", "0,1000", Join(Money.Allocate(1000, new long[] { 0, 1 })));
Eq("allocate 1 [3,7]", "0,1", Join(Money.Allocate(1, new long[] { 3, 7 })));
Eq("allocate 1 [0,1,1]", "0,1,0", Join(Money.Allocate(1, new long[] { 0, 1, 1 })));
Eq("allocate 10 [1,8]", "1,9", Join(Money.Allocate(10, new long[] { 1, 8 })));
Throws<ArgumentException>("allocate empty", () => Money.Allocate(1, Array.Empty<long>()));
Throws<ArgumentException>("allocate zero sum", () => Money.Allocate(1, new long[] { 0, 0 }));
Throws<ArgumentException>("allocate negative ratio", () => Money.Allocate(1, new long[] { 2, -1 }));

// 11. Signed cursors
var cursorSecret = Ascii("0123456789abcdef0123456789abcdef");
const string cursorVector = "djEKMTc5MDAwMDAwMAoyMDI2LTEwLTAxVDEyOjAwOjAwWgo0Mg.T2z74zcZhdSIFHTOhu4Wc0MNbTN2t71UXXeQpcLoUUc";
Eq("cursor encode vector", cursorVector, SignedCursors.EncodeCursor(new[] { "2026-10-01T12:00:00Z", "42" }, cursorSecret, 1790000000));
Eq("cursor decode vector", "2026-10-01T12:00:00Z|42", string.Join("|", SignedCursors.DecodeCursor(cursorVector, cursorSecret, 1789999999)));
Throws<CursorException>("cursor expired", () => SignedCursors.DecodeCursor(cursorVector, cursorSecret, 1790000000), e => e.Kind == CursorErrorKind.Expired && e.Message.StartsWith("expired"));
const string b64url = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
int lastCharBad = 0;
foreach (char ch in b64url) {
    if (ch == cursorVector[^1]) continue;
    try { SignedCursors.DecodeCursor(cursorVector[..^1] + ch, cursorSecret, 0); }
    catch (CursorException e) when (e.Kind == CursorErrorKind.BadSignature && e.Message.StartsWith("bad signature")) { lastCharBad++; }
    catch (Exception) { }
}
Eq("cursor every last-char change is bad signature", 63, lastCharBad);
Throws<CursorException>("cursor first sig char changed", () => SignedCursors.DecodeCursor(cursorVector.Replace(".T2z", ".U2z"), cursorSecret, 0), e => e.Kind == CursorErrorKind.BadSignature);
Throws<CursorException>("cursor no dot", () => SignedCursors.DecodeCursor(cursorVector.Replace(".", ""), cursorSecret, 0), e => e.Kind == CursorErrorKind.Malformed && e.Message.StartsWith("malformed"));
Throws<CursorException>("cursor padding", () => SignedCursors.DecodeCursor(cursorVector + "=", cursorSecret, 0), e => e.Kind == CursorErrorKind.Malformed);
Throws<CursorException>("cursor empty sig", () => SignedCursors.DecodeCursor(cursorVector[..(cursorVector.IndexOf('.') + 1)], cursorSecret, 0), e => e.Kind == CursorErrorKind.Malformed);
Throws<CursorException>("cursor bad char", () => SignedCursors.DecodeCursor("dj+K." + cursorVector.Split('.')[1], cursorSecret, 0), e => e.Kind == CursorErrorKind.Malformed);
Throws<CursorException>("cursor other secret", () => SignedCursors.DecodeCursor(cursorVector, Ascii("fedcba9876543210fedcba9876543210"), 0), e => e.Kind == CursorErrorKind.BadSignature);
Throws<ArgumentException>("cursor encode 31-byte secret", () => SignedCursors.EncodeCursor(new[] { "a" }, new byte[31], 1));
Throws<ArgumentException>("cursor decode 31-byte secret", () => SignedCursors.DecodeCursor(cursorVector, new byte[31], 0));
Throws<ArgumentException>("cursor no values", () => SignedCursors.EncodeCursor(Array.Empty<string>(), cursorSecret, 1));
Throws<ArgumentException>("cursor 17 values", () => SignedCursors.EncodeCursor(Enumerable.Repeat("a", 17).ToArray(), cursorSecret, 1));
Throws<ArgumentException>("cursor newline value", () => SignedCursors.EncodeCursor(new[] { "a\nb" }, cursorSecret, 1));
Throws<ArgumentOutOfRangeException>("cursor expiresAt 0", () => SignedCursors.EncodeCursor(new[] { "a" }, cursorSecret, 0));

// 12. ICS events
var icsEvents = new[] {
    new IcsEvent("evt-1@example.com", "2026-10-10T12:00:00Z", "2026-10-20T15:00:00Z", "2026-10-20T16:30:00Z", "Office hours; Q&A, live",
        "Bring questions.\nRoom 4 \\ east wing. A folding test with café, then more words so the second line also runs past seventy-four octets and folds again.",
        "Room 4, Main St.", "https://example.com/e/1"),
    new IcsEvent("evt-2@example.com", "2026-10-10T12:00:00Z", "2026-12-24", "2026-12-25", "Holiday"),
};
string icsOut = IcsEvents.IcsCalendar(icsEvents, "-//Acme//Genlib//EN");
Eq("ics vector", "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Acme//Genlib//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nBEGIN:VEVENT\r\nUID:evt-1@example.com\r\nDTSTAMP:20261010T120000Z\r\nDTSTART:20261020T150000Z\r\nDTEND:20261020T163000Z\r\nSUMMARY:Office hours\\; Q&A\\, live\r\nDESCRIPTION:Bring questions.\\nRoom 4 \\\\ east wing. A folding test with caf\r\n é\\, then more words so the second line also runs past seventy-four octets\r\n  and folds again.\r\nLOCATION:Room 4\\, Main St.\r\nURL:https://example.com/e/1\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:evt-2@example.com\r\nDTSTAMP:20261010T120000Z\r\nDTSTART;VALUE=DATE:20261224\r\nDTEND;VALUE=DATE:20261225\r\nSUMMARY:Holiday\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n", icsOut);
Check("ics lines within 75 octets", icsOut.Split("\r\n").All(l => Encoding.UTF8.GetByteCount(l) <= 75));
var baseEvent = icsEvents[0];
Throws<ArgumentException>("ics end equals start", () => IcsEvents.IcsCalendar(new[] { baseEvent with { End = baseEvent.Start } }, "p"));
Throws<ArgumentException>("ics date start utc end", () => IcsEvents.IcsCalendar(new[] { baseEvent with { Start = "2026-10-20" } }, "p"));
Throws<ArgumentException>("ics empty uid", () => IcsEvents.IcsCalendar(new[] { baseEvent with { Uid = "" } }, "p"));
Throws<ArgumentException>("ics ftp url", () => IcsEvents.IcsCalendar(new[] { baseEvent with { Url = "ftp://x" } }, "p"));
Throws<ArgumentException>("ics date dtstamp", () => IcsEvents.IcsCalendar(new[] { baseEvent with { Dtstamp = "2026-10-10" } }, "p"));
Throws<ArgumentException>("ics invalid month", () => IcsEvents.IcsCalendar(new[] { baseEvent with { Start = "2026-13-20T15:00:00Z" } }, "p"));

// 13. IDs (UUIDv7 and ULID)
byte[] idRandom = Enumerable.Range(1, 10).Select(i => (byte)i).ToArray();
Eq("uuid7 vector", "01a0c450-6c7b-7102-8304-05060708090a", Ids.UuidV7(1790000000123, idRandom));
Eq("ulid vector", "01M3250V3V041061050R3GG28A", Ids.Ulid(1790000000123, idRandom));
Eq("uuid7 zero", "00000000-0000-7000-8000-000000000000", Ids.UuidV7(0, new byte[10]));
Eq("ulid max time", "7ZZZZZZZZZZZZZZZZZZZZZZZZZ", Ids.Ulid((1L << 48) - 1, Enumerable.Repeat((byte)0xff, 10).ToArray()));
Eq("uuid7 time", 1790000000123L, Ids.UuidV7Time("01a0c450-6c7b-7102-8304-05060708090a"));
Eq("uuid7 time upper", 1790000000123L, Ids.UuidV7Time("01A0C450-6C7B-7102-8304-05060708090A"));
Eq("uuid7 zero time", 0L, Ids.UuidV7Time("00000000-0000-7000-8000-000000000000"));
Eq("ulid time", 1790000000123L, Ids.UlidTime("01M3250V3V041061050R3GG28A"));
Eq("ulid time lower", 1790000000123L, Ids.UlidTime("01m3250v3v041061050r3gg28a"));
Eq("ulid max time parse", (1L << 48) - 1, Ids.UlidTime("7ZZZZZZZZZZZZZZZZZZZZZZZZZ"));
Throws<FormatException>("uuid7 version 4", () => Ids.UuidV7Time("01a0c450-6c7b-4102-8304-05060708090a"));
Throws<FormatException>("uuid7 bad variant", () => Ids.UuidV7Time("01a0c450-6c7b-7102-c304-05060708090a"));
Throws<FormatException>("uuid7 short", () => Ids.UuidV7Time("01a0c450-6c7b-7102-8304-05060708090"));
Throws<FormatException>("uuid7 bad char", () => Ids.UuidV7Time("01a0c450-6c7b-7102-8304-05060708090g"));
Throws<FormatException>("ulid first char 8", () => Ids.UlidTime("80000000000000000000000000"));
Throws<FormatException>("ulid bad char U", () => Ids.UlidTime("01M3250V3V041061050R3GG28U"));
Throws<FormatException>("ulid short", () => Ids.UlidTime("01M3250V3V041061050R3GG28"));
Throws<ArgumentOutOfRangeException>("uuid7 negative time", () => Ids.UuidV7(-1, idRandom));
Throws<ArgumentOutOfRangeException>("ulid time 2^48", () => Ids.Ulid(1L << 48, idRandom));
Throws<ArgumentException>("uuid7 9 random bytes", () => Ids.UuidV7(0, new byte[9]));
string u1 = Ids.NewUuidV7(), u2 = Ids.NewUuidV7();
Check("newUuidV7 format", Regex.IsMatch(u1, "^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$") && u1 != u2);
string l1 = Ids.NewUlid(), l2 = Ids.NewUlid();
Check("newUlid format", Regex.IsMatch(l1, "^[0-7][0-9A-HJKMNP-TV-Z]{25}$") && l1 != l2);

// 14. Retry backoff
Eq("backoff a0", 50L, RetryBackoff.BackoffDelay(0, 100, 10000, 0.5));
Eq("backoff a3", 799L, RetryBackoff.BackoffDelay(3, 100, 10000, 0.999));
Eq("backoff a10", 2500L, RetryBackoff.BackoffDelay(10, 100, 10000, 0.25));
Eq("backoff a3zero", 0L, RetryBackoff.BackoffDelay(3, 100, 10000, 0.0));
Eq("backoff huge attempt capped", 5000L, RetryBackoff.BackoffDelay(10_000, 100, 10000, 0.5));
Eq("backoff attempt 62 large base capped", 3000L, RetryBackoff.BackoffDelay(62, 3000, 6000, 0.5));
Eq("backoff base above shifted cap", 3001L, RetryBackoff.BackoffDelay(1, 3001, 6001, 0.5) + 1);
Throws<ArgumentOutOfRangeException>("backoff fraction 1", () => RetryBackoff.BackoffDelay(0, 100, 1000, 1.0));
Throws<ArgumentOutOfRangeException>("backoff fraction NaN", () => RetryBackoff.BackoffDelay(0, 100, 1000, double.NaN));
Throws<ArgumentOutOfRangeException>("backoff negative attempt", () => RetryBackoff.BackoffDelay(-1, 100, 1000, 0.5));
Throws<ArgumentOutOfRangeException>("backoff base 0", () => RetryBackoff.BackoffDelay(0, 0, 1000, 0.5));
Throws<ArgumentOutOfRangeException>("backoff cap < base", () => RetryBackoff.BackoffDelay(0, 100, 99, 0.5));
Eq("retry-after secs", (long?)120000, RetryBackoff.RetryAfterMs("120", 0));
Eq("retry-after date", (long?)30000, RetryBackoff.RetryAfterMs("Wed, 21 Oct 2026 07:28:00 GMT", 1792567650000));
Eq("retry-after past", (long?)0, RetryBackoff.RetryAfterMs("Wed, 21 Oct 2015 07:28:00 GMT", 1792567650000));
foreach (var bad in new[] { "", "-5", "1.5", "soon", "21 Oct 2026 07:28:00 GMT", "Wed, 21 Oct 2026 07:28:00 UTC" })
    Eq($"retry-after invalid '{bad}'", (long?)null, RetryBackoff.RetryAfterMs(bad, 0));
Throws<OverflowException>("retry-after overflow", () => RetryBackoff.RetryAfterMs("99999999999999999", 0));

// 15. Token bucket
var tbSteps = new (long Now, long Cost, bool Allowed, long TokensMilli, long RetryAfterMs)[] {
    (0, 1, true, 4000, 0), (0, 1, true, 3000, 0), (0, 1, true, 2000, 0), (0, 1, true, 1000, 0), (0, 1, true, 0, 0),
    (0, 1, false, 0, 500), (250, 1, false, 500, 250), (500, 1, true, 0, 0), (500, 2, false, 0, 1000), (3000, 5, true, 0, 0),
};
var bucket = TokenBucket.NewBucket(5, 0);
Eq("bucket starts full", 5000L, bucket.TokensMilli);
for (int i = 0; i < tbSteps.Length; i++) {
    var s = tbSteps[i];
    var r = TokenBucket.Take(bucket, s.Now, s.Cost, 5, 2);
    Check($"bucket step {i}", r.Allowed == s.Allowed && r.State.TokensMilli == s.TokensMilli && r.RetryAfterMs == s.RetryAfterMs);
    bucket = r.State;
}
var back = TokenBucket.Take(new BucketState(1000, 5000), 1000, 1, 5, 2);
Check("bucket clock backwards adds nothing", back.Allowed && back.State.TokensMilli == 0 && back.State.LastMs == 5000);
Eq("bucket huge gap refills to capacity without overflow", 4000L, TokenBucket.Take(new BucketState(0, 0), long.MaxValue, 1, 5, long.MaxValue / 1000).State.TokensMilli);
Throws<ArgumentOutOfRangeException>("bucket cost > capacity", () => TokenBucket.Take(TokenBucket.NewBucket(5, 0), 0, 6, 5, 2));
Throws<ArgumentOutOfRangeException>("bucket rate 0", () => TokenBucket.Take(TokenBucket.NewBucket(5, 0), 0, 1, 5, 0));
Throws<OverflowException>("bucket capacity overflow", () => TokenBucket.NewBucket(long.MaxValue, 0));

// 16. Semver
var semverSorted = new[] { "0.9.9", "1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-beta.2", "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0", "1.0.0+build.5", "2.0.0" };
var semverInput = new[] { "1.0.0-rc.1", "2.0.0", "1.0.0-beta.11", "1.0.0", "1.0.0-alpha.beta", "0.9.9", "1.0.0-beta", "1.0.0+build.5", "1.0.0-alpha.1", "1.0.0-beta.2", "1.0.0-alpha" };
Eq("semver sort", string.Join(" ", semverSorted),
    string.Join(" ", semverInput.OrderBy(Semver.Parse, Comparer<SemVersion>.Create(Semver.Compare))));
Eq("semver build ignored", 0, Semver.Compare("1.0.0", "1.0.0+build.5"));
Eq("semver parse round trip", "1.2.3-rc.1+b.7", Semver.Parse("1.2.3-rc.1+b.7").ToString());
foreach (var bad in new[] { "1.2", "01.2.3", "1.2.3-01", "1.2.3-", "1.2.3+", "v1.2.3", "1.2.3.4", " 1.2.3", "1.2.3-a..b", "١.2.3" })
    Throws<FormatException>($"semver invalid '{bad}'", () => Semver.Parse(bad));
var satisfiesVectors = new (string V, string R, bool E)[] {
    ("1.2.3", "^1.0.0", true), ("2.0.0", "^1.0.0", false), ("0.2.5", "^0.2.3", true), ("0.3.0", "^0.2.3", false),
    ("0.0.4", "^0.0.3", false), ("1.2.9", "~1.2.3", true), ("1.3.0", "~1.2.3", false), ("1.5.0", "1.x", true),
    ("1.5.0", ">=1.2.0 <1.5.0", false), ("1.4.9", ">=1.2.0 <1.5.0", true), ("3.1.0", "^1.0.0 || ^3.0.0", true),
    ("1.2.3-beta.2", "^1.2.3-beta.1", true), ("1.2.4-beta.1", "^1.2.3-beta.1", false), ("1.3.0-rc.1", "^1.2.0", false),
    ("1.2.0", "1.0.0 - 1.2.0", true), ("1.2.1", "1.0.0 - 1.2.0", false), ("0.0.1", "*", true), ("2.0.0", "<=1.x", false),
};
foreach (var (v, r, e) in satisfiesVectors) Eq($"satisfies {v} '{r}'", e, Semver.Satisfies(v, r));
Check("satisfies >= with space", Semver.Satisfies("1.2.3", ">= 1.2.3"));
Check("satisfies 1.2.x", Semver.Satisfies("1.2.7", "1.2.x") && !Semver.Satisfies("1.3.0", "1.2.x"));
Check("satisfies >1.x", Semver.Satisfies("2.0.0", ">1.x") && !Semver.Satisfies("1.9.9", ">1.x"));
Check("satisfies <1.2.x", Semver.Satisfies("1.1.9", "<1.2.x") && !Semver.Satisfies("1.2.0", "<1.2.x"));
Check("satisfies prerelease excluded by *", !Semver.Satisfies("1.0.0-beta", "*"));
Throws<FormatException>("satisfies bad range", () => Semver.Satisfies("1.0.0", "^1.0.0.0"));
Throws<FormatException>("satisfies bad version", () => Semver.Satisfies("1.0", "*"));

// 17. Cron next
var cronVectors = new (string Expr, string After, string Expected)[] {
    ("*/15 * * * *", "2026-10-10T12:07:30Z", "2026-10-10T12:15:00Z"),
    ("0 9 * * 1-5", "2026-10-10T12:00:00Z", "2026-10-12T09:00:00Z"),
    ("30 2 1 * *", "2026-10-10T00:00:00Z", "2026-11-01T02:30:00Z"),
    ("0 0 29 2 *", "2026-03-01T00:00:00Z", "2028-02-29T00:00:00Z"),
    ("0 12 13 * 5", "2026-10-10T00:00:00Z", "2026-10-13T12:00:00Z"),
    ("59 23 31 12 *", "2026-12-31T23:59:00Z", "2027-12-31T23:59:00Z"),
    ("0 0 * * 0", "2026-10-10T00:00:00Z", "2026-10-11T00:00:00Z"),
    ("5,10 8-9 * * *", "2026-10-10T09:10:00Z", "2026-10-11T08:05:00Z"),
};
foreach (var (expr, after, expected) in cronVectors) Eq($"cron '{expr}' after {after}", expected, CronNext.NextRun(expr, after));
Eq("cron dow 7 is Sunday", "2026-10-11T00:00:00Z", CronNext.NextRun("0 0 * * 7", "2026-10-10T00:00:00Z"));
Eq("cron N/step", "2026-10-10T00:50:00Z", CronNext.NextRun("50/5 * * * *", "2026-10-10T00:00:00Z"));
Eq("cron dom star step with dow uses AND", "2026-10-13T00:00:00Z", CronNext.NextRun("0 0 */2 * 2", "2026-10-10T00:00:00Z"));
foreach (var bad in new[] { "* * * *", "60 * * * *", "* 24 * * *", "* * 0 * *", "* * * 13 *", "* * * * 8", "*/0 * * * *", "5-1 * * * *", "MON * * * *", "? * * * *", "L * * * *" })
    Throws<ArgumentException>($"cron invalid '{bad}'", () => CronNext.NextRun(bad, "2026-10-10T00:00:00Z"));
Throws<ArgumentException>("cron bad after", () => CronNext.NextRun("* * * * *", "2026-10-10 00:00:00"));
Throws<InvalidOperationException>("cron Feb 31 gives up", () => CronNext.NextRun("0 0 31 2 *", "2026-10-10T00:00:00Z"));

// 18. WCAG contrast
Eq("wcag bw", 21.0, WcagContrast.ContrastRatio2("#000", "#fff"));
Eq("wcag grey", 4.54, WcagContrast.ContrastRatio2("#767676", "#ffffff"));
Eq("wcag blue", 4.51, WcagContrast.ContrastRatio2("#1a73e8", "#ffffff"));
Eq("wcag same", 1.0, WcagContrast.ContrastRatio2("#abc", "#aabbcc"));
Eq("wcag yellow", 1.07, WcagContrast.ContrastRatio2("#ffff00", "#ffffff"));
Check("wcag grey passes AA", WcagContrast.Passes(WcagContrast.ContrastRatio("#767676", "#ffffff"), "AA", false));
Check("wcag grey fails AAA", !WcagContrast.Passes(WcagContrast.ContrastRatio("#767676", "#ffffff"), "AAA", false));
Check("wcag yellow fails AA large", !WcagContrast.Passes(WcagContrast.ContrastRatio("#ffff00", "#ffffff"), "AA", true));
Check("wcag bw passes AAA", WcagContrast.Passes(WcagContrast.ContrastRatio("#000", "#FFF"), "AAA", false));
Check("wcag symmetric", WcagContrast.ContrastRatio("#1a73e8", "#fff") == WcagContrast.ContrastRatio("#fff", "#1a73e8"));
foreach (var bad in new[] { "000", "#00", "#0000", "#gggggg", "#1234567", "" }) Throws<FormatException>($"wcag invalid '{bad}'", () => WcagContrast.RelativeLuminance(bad));
Throws<ArgumentException>("wcag bad level", () => WcagContrast.Passes(5, "A", false));

// 19. Geo
Eq("geo london-paris", 343557.0, Math.Round(Geo.HaversineMeters(51.5074, -0.1278, 48.8566, 2.3522)));
Eq("geo same point", 0.0, Math.Round(Geo.HaversineMeters(10, 10, 10, 10)));
Eq("geo antipode", 20015114.0, Math.Round(Geo.HaversineMeters(0, 0, 0, 180)));
var ghVectors = new (double Lat, double Lon, int P, string Hash)[] { (37.7749, -122.4194, 9, "9q8yyk8yt"), (0, 0, 5, "s0000"), (-33.8688, 151.2093, 7, "r3gx2f7") };
foreach (var g in ghVectors) {
    Eq($"geohash {g.Hash}", g.Hash, Geo.GeohashEncode(g.Lat, g.Lon, g.P));
    var cell = Geo.GeohashDecode(g.Hash);
    Check($"geohash decode {g.Hash}", Math.Abs(cell.Lat - g.Lat) <= cell.LatError && Math.Abs(cell.Lon - g.Lon) <= cell.LonError);
    Check($"geohash decode upper {g.Hash}", Geo.GeohashDecode(g.Hash.ToUpperInvariant()) == cell);
}
Throws<FormatException>("geohash invalid char a", () => Geo.GeohashDecode("9q8a"));
Throws<FormatException>("geohash empty", () => Geo.GeohashDecode(""));
Throws<ArgumentOutOfRangeException>("geohash precision 13", () => Geo.GeohashEncode(0, 0, 13));
Throws<ArgumentOutOfRangeException>("geo lat 91", () => Geo.HaversineMeters(91, 0, 0, 0));
Throws<ArgumentOutOfRangeException>("geo lon -181", () => Geo.HaversineMeters(0, -181, 0, 0));
var box = Geo.BoundingBox(51.5, -0.12, 10000);
Check("bbox north", Geo.HaversineMeters(51.5, -0.12, box.MaxLat, -0.12) >= 9999);
Check("bbox south", Geo.HaversineMeters(51.5, -0.12, box.MinLat, -0.12) >= 9999);
Check("bbox east", Geo.HaversineMeters(51.5, -0.12, 51.5, box.MaxLon) >= 9999);
Check("bbox west", Geo.HaversineMeters(51.5, -0.12, 51.5, box.MinLon) >= 9999);
Check("bbox not huge", box.MaxLat - box.MinLat < 0.2 && box.MaxLon - box.MinLon < 0.4);
var polar = Geo.BoundingBox(89.99, 0, 10000);
Check("bbox near pole spans all longitudes", polar.MaxLat == 90 && polar.MinLon == -180 && polar.MaxLon == 180);
Throws<ArgumentOutOfRangeException>("bbox negative radius", () => Geo.BoundingBox(0, 0, -1));

// 20. Webhook signature
const string whSecret = "whsec_test_secret_0123456789abcd";
const string whBody = "{\"id\":\"evt_1\",\"amount\":1999}";
const long whT = 1790000000;
const string whHeader = "t=1790000000,v1=ad4e559e93bea390aff65b8c1eaec615bbdf3df1ef1d1c908b03299c20cf44a6";
Eq("webhook sign vector", whHeader, WebhookSignature.SignWebhook(whSecret, whT, whBody));
bool Verifies(string header, string body, string secret, long now) {
    try { WebhookSignature.VerifyWebhook(header, body, secret, now); return true; } catch (WebhookException) { return false; }
}
Check("webhook verifies at t", Verifies(whHeader, whBody, whSecret, whT));
Check("webhook verifies at t+300", Verifies(whHeader, whBody, whSecret, whT + 300));
Check("webhook verifies at t-300", Verifies(whHeader, whBody, whSecret, whT - 300));
void WhFails(string name, WebhookErrorKind kind, string header, string body, string secret, long now, string prefix) =>
    Throws<WebhookException>(name, () => WebhookSignature.VerifyWebhook(header, body, secret, now), e => e.Kind == kind && e.Message.StartsWith(prefix));
WhFails("webhook expired t+301", WebhookErrorKind.Expired, whHeader, whBody, whSecret, whT + 301, "expired");
WhFails("webhook expired t-301", WebhookErrorKind.Expired, whHeader, whBody, whSecret, whT - 301, "expired");
WhFails("webhook body byte changed", WebhookErrorKind.BadSignature, whHeader, whBody.Replace("1999", "1998"), whSecret, whT, "bad signature");
WhFails("webhook other secret", WebhookErrorKind.BadSignature, whHeader, whBody, whSecret + "x", whT, "bad signature");
WhFails("webhook hex digit changed", WebhookErrorKind.BadSignature, whHeader[..^1] + "7", whBody, whSecret, whT, "bad signature");
Check("webhook extra zero v1 first", Verifies("t=1790000000, v1=" + new string('0', 64) + " , v1=" + whHeader[16..], whBody, whSecret, whT));
Check("webhook ignores v0", Verifies(whHeader + ",v0=abc", whBody, whSecret, whT));
WhFails("webhook missing t", WebhookErrorKind.Malformed, whHeader[13..], whBody, whSecret, whT, "malformed");
WhFails("webhook two t", WebhookErrorKind.Malformed, "t=1790000000," + whHeader, whBody, whSecret, whT, "malformed");
WhFails("webhook non-hex v1", WebhookErrorKind.Malformed, "t=1790000000,v1=" + new string('g', 64), whBody, whSecret, whT, "malformed");
WhFails("webhook uppercase v1", WebhookErrorKind.Malformed, "t=1790000000,v1=" + whHeader[16..].ToUpperInvariant(), whBody, whSecret, whT, "malformed");
WhFails("webhook missing v1", WebhookErrorKind.Malformed, "t=1790000000", whBody, whSecret, whT, "malformed");
Throws<ArgumentException>("webhook empty secret sign", () => WebhookSignature.SignWebhook("", whT, whBody));
Throws<ArgumentException>("webhook empty secret verify", () => WebhookSignature.VerifyWebhook(whHeader, whBody, "", whT));

Console.WriteLine($"C# checks: {passed} passed, {failed} failed");
return failed == 0 ? 0 : 1;
