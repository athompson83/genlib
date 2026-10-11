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

// Wave 5 capability checks; every vector comes from the shared wave 5 reference vectors.
bool Near(double a, double b, double eps) => Math.Abs(a - b) <= eps;

// 21. Check digits
foreach (var (s, e) in new[] { ("4539 1488 0343 6467", true), ("79927398713", true), ("79927398710", false), ("0", false), ("4539-1488-0343-6468", false), ("12a4", false), ("", false) })
    Eq($"luhn '{s}'", e, CheckDigits.LuhnValid(s));
Eq("luhn check digit 7992739871", "3", CheckDigits.LuhnCheckDigit("7992739871"));
Eq("luhn check digit 453914880343646", "7", CheckDigits.LuhnCheckDigit("453914880343646"));
Throws<FormatException>("luhn check digit non-digit", () => CheckDigits.LuhnCheckDigit("12a"));
Throws<FormatException>("luhn check digit empty", () => CheckDigits.LuhnCheckDigit(""));
foreach (var (s, e) in new[] { ("GB82 WEST 1234 5698 7654 32", true), ("DE89 3704 0044 0532 0130 00", true), ("gb82west12345698765432", true),
    ("GB82 WEST 1234 5698 7654 33", false), ("GB82-WEST", false), ("NO9386011117947", true), ("XX00", false) })
    Eq($"iban '{s}'", e, CheckDigits.IbanValid(s));
Eq("iban format gb", "GB82 WEST 1234 5698 7654 32", CheckDigits.IbanFormat("gb82west12345698765432"));
Eq("iban format no", "NO93 8601 1117 947", CheckDigits.IbanFormat("NO9386011117947"));
Throws<FormatException>("iban format invalid", () => CheckDigits.IbanFormat("GB82 WEST 1234 5698 7654 33"));
foreach (var (s, e) in new[] { ("4006381333931", true), ("036000291452", true), ("96385074", true), ("10614141000415", true), ("4006381333932", false), ("12345", false) })
    Eq($"gtin '{s}'", e, CheckDigits.GtinValid(s));
foreach (var (s, e) in new[] { ("0-306-40615-2", true), ("0-8044-2957-X", true), ("0-306-40615-3", false), ("030640615", false) })
    Eq($"isbn10 '{s}'", e, CheckDigits.Isbn10Valid(s));
foreach (var (s, e) in new[] { ("978-0-306-40615-7", true), ("979-10-90636-07-1", true), ("978-0-306-40615-8", false), ("4006381333931", false) })
    Eq($"isbn13 '{s}'", e, CheckDigits.Isbn13Valid(s));
Eq("isbn10 to 13 a", "9780306406157", CheckDigits.Isbn10To13("0-306-40615-2"));
Eq("isbn10 to 13 X", "9780804429573", CheckDigits.Isbn10To13("080442957X"));
Throws<FormatException>("isbn10 to 13 invalid", () => CheckDigits.Isbn10To13("0-306-40615-3"));

// 22. Signed URLs
const string suSecret = "url-signing-secret";
var suCases = new (string Target, long Expires, string Signed)[] {
    ("/files/report.pdf?user=42", 1790000000, "/files/report.pdf?user=42&expires=1790000000&signature=OBOJTlNq3AuDbND_6J4njKkDIXDMxhx0l0PmWaRbfaU"),
    ("/download/a%20b.zip", 1790003600, "/download/a%20b.zip?expires=1790003600&signature=SafK5ZH-apLeaJ-c1dhzp-kyiS3doOR7ywgvr8WDJOo"),
};
void SuFails(string name, SignedUrlErrorKind kind, string signed, string secret, long now, string prefix) =>
    Throws<SignedUrlException>(name, () => SignedUrls.VerifyUrl(signed, secret, now), e => e.Kind == kind && e.Message.StartsWith(prefix));
foreach (var (target, expires, signed) in suCases) {
    Eq($"sign {target}", signed, SignedUrls.SignUrl(target, suSecret, expires));
    bool ok = true;
    try { SignedUrls.VerifyUrl(signed, suSecret, expires); } catch (SignedUrlException) { ok = false; }
    Check($"verify {target} at expires", ok);
    SuFails($"expired {target}", SignedUrlErrorKind.Expired, signed, suSecret, expires + 1, "expired");
    SuFails($"path changed {target}", SignedUrlErrorKind.BadSignature, "/x" + signed[1..], suSecret, expires, "bad signature");
    SuFails($"other secret {target}", SignedUrlErrorKind.BadSignature, signed, suSecret + "x", expires, "bad signature");
    SuFails($"signature char changed {target}", SignedUrlErrorKind.BadSignature, signed[..^1] + (signed[^1] == 'A' ? "B" : "A"), suSecret, expires, "bad signature");
    int at = signed.LastIndexOf("&signature=", StringComparison.Ordinal);
    SuFails($"signature removed {target}", SignedUrlErrorKind.Malformed, signed[..at], suSecret, expires, "malformed");
    SuFails($"duplicate expires {target}", SignedUrlErrorKind.Malformed, signed[..at] + "&expires=1" + signed[at..], suSecret, expires, "malformed");
    SuFails($"non-decimal expires {target}", SignedUrlErrorKind.Malformed, signed.Replace($"expires={expires}", $"expires={expires}x"), suSecret, expires, "malformed");
}
SuFails("short signature", SignedUrlErrorKind.Malformed, "/a?expires=1&signature=abc", suSecret, 0, "malformed");
Throws<ArgumentException>("sign empty secret", () => SignedUrls.SignUrl("/a", "", 1));
Throws<ArgumentException>("sign existing expires", () => SignedUrls.SignUrl("/a?expires=5", suSecret, 1));
Throws<ArgumentException>("sign existing signature", () => SignedUrls.SignUrl("/a?x=1&signature", suSecret, 1));
Throws<ArgumentException>("sign fragment", () => SignedUrls.SignUrl("/a#b", suSecret, 1));
Throws<ArgumentException>("sign absolute", () => SignedUrls.SignUrl("https://ex.com/a", suSecret, 1));
Throws<ArgumentException>("verify empty secret", () => SignedUrls.VerifyUrl(suCases[0].Signed, "", 0));

// 23. Polyline
var plGoogle = new[] { (38.5, -120.2), (40.7, -120.95), (43.252, -126.453) };
var plP6 = new[] { (47.6062, -122.3321), (47.6205, -122.3493) };
Eq("polyline google", "_p~iF~ps|U_ulLnnqC_mqNvxq`@", Polyline.EncodePolyline(plGoogle));
Eq("polyline precision 6", "ozsxyAf{pihFw|Z~q`@", Polyline.EncodePolyline(plP6, 6));
Eq("polyline empty encode", "", Polyline.EncodePolyline(Array.Empty<(double, double)>()));
Eq("polyline empty decode", 0, Polyline.DecodePolyline("").Count);
foreach (var (pts, text, precision) in new[] { (plGoogle, "_p~iF~ps|U_ulLnnqC_mqNvxq`@", 5), (plP6, "ozsxyAf{pihFw|Z~q`@", 6) }) {
    var decoded = Polyline.DecodePolyline(text, precision);
    var rt = Polyline.DecodePolyline(Polyline.EncodePolyline(pts, precision), precision);
    double eps = 0.5 * Math.Pow(10, -precision) + 1e-12;
    bool ok = decoded.Count == pts.Length && rt.Count == pts.Length;
    for (int i = 0; ok && i < pts.Length; i++)
        ok = Near(decoded[i].Lat, pts[i].Item1, eps) && Near(decoded[i].Lon, pts[i].Item2, eps) && Near(rt[i].Lat, pts[i].Item1, eps) && Near(rt[i].Lon, pts[i].Item2, eps);
    Check($"polyline decode/round trip {text}", ok);
}
Eq("polyline halves round away from zero", "A@CB", Polyline.EncodePolyline(new[] { (0.5, -0.5), (2.5, -2.5) }, 0));
Throws<FormatException>("polyline bad char", () => Polyline.DecodePolyline("_p~iF ps|U"));
Throws<FormatException>("polyline truncated chunk", () => Polyline.DecodePolyline("_p~iF~ps|"));
Throws<FormatException>("polyline lat without lon", () => Polyline.DecodePolyline("_p~iF"));
Throws<ArgumentOutOfRangeException>("polyline lat 91", () => Polyline.EncodePolyline(new[] { (91.0, 0.0) }));
Throws<ArgumentOutOfRangeException>("polyline precision 11", () => Polyline.EncodePolyline(plGoogle, 11));

// 24. Tile math
foreach (var (lon, lat, z, x, y) in new[] { (-122.4194, 37.7749, 12, 655, 1583), (0.0, 0.0, 0, 0, 0), (2.3522, 48.8566, 15, 16598, 11273), (179.9999, -89.9, 3, 7, 7), (-180.0, 85.1, 2, 0, 0) })
    Eq($"tile {lon},{lat} z{z}", (x, y), TileMath.LonLatToTile(lon, lat, z));
foreach (var (x, y, z, e) in new[] {
    (0, 0, 0, new[] { -180.0, -85.0511287798066, 180.0, 85.0511287798066 }),
    (655, 1583, 12, new[] { -122.431640625, 37.718590325588146, -122.34375, 37.78808138412046 }),
    (1, 1, 1, new[] { 0.0, -85.0511287798066, 180.0, 0.0 }) }) {
    var b = TileMath.TileBounds(x, y, z);
    Check($"bounds {x}/{y}/{z}", Near(b.West, e[0], 1e-9) && Near(b.South, e[1], 1e-9) && Near(b.East, e[2], 1e-9) && Near(b.North, e[3], 1e-9));
}
foreach (var (x, y, z, key) in new[] { (3, 5, 3, "213"), (655, 1583, 12, "023010203333"), (0, 0, 1, "0") }) {
    Eq($"quadkey {x}/{y}/{z}", key, TileMath.TileToQuadkey(x, y, z));
    Eq($"quadkey round trip {key}", (x, y, z), TileMath.QuadkeyToTile(key));
}
Eq("quadkey empty is zoom 0", (0, 0, 0), TileMath.QuadkeyToTile(""));
foreach (var (lon, lat, x, y) in new[] { (0.0, 0.0, 0.0, -7.081154551613622e-10), (-122.4194, 37.7749, -13627665.271218073, 4547675.354340557), (180.0, 85.05112877980659, 20037508.342789244, 20037508.342789244) }) {
    var m = TileMath.LonLatToMercator(lon, lat);
    Check($"mercator {lon},{lat}", Near(m.X, x, 1e-6) && Near(m.Y, y, 1e-6));
}
Throws<ArgumentOutOfRangeException>("tile zoom 25", () => TileMath.LonLatToTile(0, 0, 25));
Throws<ArgumentOutOfRangeException>("tile zoom -1", () => TileMath.LonLatToTile(0, 0, -1));
Throws<ArgumentOutOfRangeException>("tile lon NaN", () => TileMath.LonLatToTile(double.NaN, 0, 1));
Throws<ArgumentOutOfRangeException>("tile lon 181", () => TileMath.LonLatToTile(181, 0, 1));
Throws<ArgumentOutOfRangeException>("bounds x out of range", () => TileMath.TileBounds(2, 0, 1));
Throws<ArgumentOutOfRangeException>("bounds y negative", () => TileMath.TileBounds(0, -1, 1));
Throws<FormatException>("quadkey digit 4", () => TileMath.QuadkeyToTile("0124"));
Throws<ArgumentOutOfRangeException>("mercator lat 86", () => TileMath.LonLatToMercator(0, 86));

// 25. Email address
string a63 = new('a', 63);
foreach (var (s, e) in new[] {
    ("user@example.com", true), ("first.last+tag@sub.Example.CO.uk", true), ("o'brien@example.ie", true), ("a@b", true),
    ("user@-example.com", false), ("user@example-.com", false), ("user@exa_mple.com", false), ("user example@example.com", false),
    ("user@@example.com", false), ("@example.com", false), ("user@", false), ("user@example..com", false), ("user.@example.com", true),
    ("ünïcode@example.com", false), (new string('x', 64) + "@example.com", true), (new string('x', 65) + "@example.com", false),
    ($"u@{a63}.{a63}.{a63}." + new string('b', 59), true), ($"u@{a63}.{a63}.{a63}." + new string('b', 61), false), ("user@" + new string('a', 64) + ".com", false) })
    Eq($"email '{(s.Length > 40 ? s[..40] + "...(" + s.Length + ")" : s)}'", e, EmailAddress.EmailValid(s));
Eq("email trailing newline rejected", false, EmailAddress.EmailValid("user@example.com\n"));
Eq("email normalize", "Mixed.Case@example.com", EmailAddress.EmailNormalize("  Mixed.Case@Example.COM "));
Throws<FormatException>("email normalize invalid", () => EmailAddress.EmailNormalize("not an email"));

// 26. ISO 8601 durations
foreach (var (s, e) in new[] {
    ("P1Y2M3DT4H5M6S", new DurationParts(Years: 1, Months: 2, Days: 3, Hours: 4, Minutes: 5, Milliseconds: 6000)),
    ("PT1H30M", new DurationParts(Hours: 1, Minutes: 30)), ("P2W", new DurationParts(Weeks: 2)), ("PT0.5S", new DurationParts(Milliseconds: 500)),
    ("PT36H", new DurationParts(Hours: 36)), ("P0D", new DurationParts()), ("PT1.250S", new DurationParts(Milliseconds: 1250)) })
    Eq($"duration parse {s}", e, IsoDuration.ParseDuration(s));
foreach (var bad in new[] { "P", "PT", "1D", "P1H", "PT1D", "P-1D", "PT1.2345S", "P1.5D", "p1d", "P1DT", "" })
    Throws<FormatException>($"duration invalid '{bad}'", () => IsoDuration.ParseDuration(bad));
Throws<FormatException>("duration overflow", () => IsoDuration.ParseDuration("P99999999999999999999D"));
foreach (var (s, e) in new[] { ("PT1H30M", 5400000L), ("P2W", 1209600000L), ("P1DT0.5S", 86400500L), ("PT36H", 129600000L) })
    Eq($"duration ms {s}", e, IsoDuration.DurationMilliseconds(IsoDuration.ParseDuration(s)));
foreach (var s in new[] { "P1Y", "P1M" })
    Throws<ArgumentException>($"duration not exact {s}", () => IsoDuration.DurationMilliseconds(IsoDuration.ParseDuration(s)), ex => ex is not ArgumentOutOfRangeException);
Throws<ArgumentOutOfRangeException>("duration ms overflow", () => IsoDuration.DurationMilliseconds(IsoDuration.ParseDuration("P9999999999999999W")));
foreach (var (n, e) in new[] { (0L, "PT0S"), (5400000L, "PT1H30M"), (90061001L, "P1DT1H1M1.001S"), (500L, "PT0.5S"), (129600000L, "P1DT12H"), (1209600000L, "P14D") })
    Eq($"duration format {n}", e, IsoDuration.FormatDuration(n));
Eq("duration format trims zeros", "PT1.25S", IsoDuration.FormatDuration(1250));
Throws<ArgumentOutOfRangeException>("duration format negative", () => IsoDuration.FormatDuration(-1));

// 27. Geometry
var square = new[] { (0.0, 0.0), (4.0, 0.0), (4.0, 4.0), (0.0, 4.0) };
var concave = new[] { (0.0, 0.0), (6.0, 0.0), (6.0, 6.0), (3.0, 3.0), (0.0, 6.0) };
foreach (var (ring, p, e) in new[] {
    (square, (2.0, 2.0), true), (square, (5.0, 2.0), false), (square, (4.0, 2.0), true), (square, (0.0, 0.0), true),
    (square, (2.0, 4.000001), false), (concave, (3.0, 4.0), false), (concave, (3.0, 2.0), true), (concave, (1.0, 5.0), true), (concave, (3.0, 3.0), true) })
    Eq($"pip {ring.Length} {p}", e, Geometry.PointInPolygon(p, ring));
Eq("pip closed ring", true, Geometry.PointInPolygon((2.0, 2.0), square.Append(square[0]).ToArray()));
Eq("area square", 16.0, Geometry.SignedArea(square));
Eq("area reversed", -16.0, Geometry.SignedArea(square.Reverse().ToArray()));
Eq("area concave", 27.0, Geometry.SignedArea(concave));
var cSq = Geometry.Centroid(square); var cCc = Geometry.Centroid(concave);
Check("centroid square", Near(cSq.X, 2.0, 1e-9) && Near(cSq.Y, 2.0, 1e-9));
Check("centroid concave", Near(cCc.X, 3.0, 1e-9) && Near(cCc.Y, 2.3333333333333335, 1e-9));
Throws<ArgumentException>("centroid zero area", () => Geometry.Centroid(new[] { (0.0, 0.0), (1.0, 1.0), (2.0, 2.0) }));
Throws<ArgumentException>("ring too short", () => Geometry.SignedArea(new[] { (0.0, 0.0), (1.0, 1.0) }));
var gLine = new[] { (0.0, 0.0), (1.0, 0.1), (2.0, -0.1), (3.0, 5.0), (4.0, 6.0), (5.0, 7.0), (6.0, 8.1), (7.0, 9.0), (8.0, 9.0), (9.0, 9.0) };
foreach (var (pts, tol, e) in new[] {
    (gLine, 1.0, new[] { (0.0, 0.0), (2.0, -0.1), (3.0, 5.0), (7.0, 9.0), (9.0, 9.0) }),
    (gLine, 0.05, new[] { (0.0, 0.0), (1.0, 0.1), (2.0, -0.1), (3.0, 5.0), (6.0, 8.1), (7.0, 9.0), (9.0, 9.0) }),
    (new[] { (0.0, 0.0), (5.0, 5.0) }, 1.0, new[] { (0.0, 0.0), (5.0, 5.0) }) }) {
    var got = Geometry.Simplify(pts, tol);
    Check($"simplify {pts.Length} tol {tol}", got.Count == e.Length && got.Zip(e).All(z => z.First == z.Second));
}
Throws<ArgumentOutOfRangeException>("simplify negative tolerance", () => Geometry.Simplify(gLine, -1));
foreach (var (ring, e) in new[] {
    (new[] { (0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0) }, 12391399902.070992),
    (new[] { (-0.13, 51.5), (-0.12, 51.5), (-0.12, 51.51), (-0.13, 51.51) }, 771337.3090775362) })
    Check($"ring area {e}", Math.Abs((Geometry.RingAreaSquareMeters(ring) - e) / e) <= 1e-9);

// 28. Safe redirect
var srAllowed = new[] { "https://app.example.com", "https://accounts.example.com:8443" };
foreach (var (target, e) in new[] {
    ("/dashboard?tab=1#top", "/dashboard?tab=1#top"), ("//evil.com/x", "/"), ("/\\evil.com", "/"),
    ("https://app.example.com/settings", "https://app.example.com/settings"), ("HTTPS://APP.EXAMPLE.COM:443/a", "HTTPS://APP.EXAMPLE.COM:443/a"),
    ("https://app.example.com.evil.com/", "/"), ("https://user@app.example.com/", "/"), ("http://app.example.com/", "/"),
    ("https://accounts.example.com:8443/login", "https://accounts.example.com:8443/login"), ("https://accounts.example.com/login", "/"),
    ("javascript:alert(1)", "/"), ("/ok path", "/"), ("dashboard", "/"), ("", "/"), ("/\t/evil.com", "/"), ("https://app.example.com:99999/", "/") })
    Eq($"redirect '{target}'", e, SafeRedirects.SafeRedirect(target, srAllowed));
Eq("redirect custom fallback", "/home", SafeRedirects.SafeRedirect("//evil.com", srAllowed, "/home"));
Eq("redirect too long", "/", SafeRedirects.SafeRedirect("/" + new string('a', 2048), srAllowed));
Eq("redirect DEL", "/", SafeRedirects.SafeRedirect("/a\u007Fb", srAllowed));
Eq("redirect null", "/", SafeRedirects.SafeRedirect(null, srAllowed));
Eq("redirect double dot host", "/", SafeRedirects.SafeRedirect("https://app..example.com/", new[] { "https://app..example.com" }));

// 29. IP / CIDR (SSRF guard)
foreach (var (text, e) in new[] { ("192.168.1.1", "192.168.1.1"), ("2001:DB8:0:0:0:0:0:1", "2001:db8::1"), ("2001:db8::0:1", "2001:db8::1"), ("::", "::"), ("::1", "::1"), ("2001:db8:0:0:1:0:0:1", "2001:db8::1:0:0:1"), ("2001:0db8:0000:0000:0000:ff00:0042:8329", "2001:db8::ff00:42:8329"), ("fe80::1:0:0:0", "fe80::1:0:0:0"), ("::ffff:192.0.2.128", "::ffff:192.0.2.128"), ("::ffff:c000:280", "::ffff:192.0.2.128"), ("1:0:0:2:0:0:0:3", "1:0:0:2::3"), ("64:ff9b::198.51.100.7", "64:ff9b::c633:6407") })
    Eq($"ip canonical {text}", e, IpCidr.CanonicalIp(text));
foreach (var bad in new[] { "256.1.1.1", "01.2.3.4", "1.2.3", "1.2.3.4.5", "1:2:3:4:5:6:7:8:9", "1::2::3", "::g", "fe80::1%eth0", "[::1]", "", " 1.2.3.4", "1.2.3.4/24", "12345::" })
    Throws<FormatException>($"ip invalid '{bad}'", () => IpCidr.ParseIp(bad));
Eq("ip parse v4 length", 4, IpCidr.ParseIp("192.168.1.1").Length);
Eq("ip parse v6 length", 16, IpCidr.ParseIp("::1").Length);
foreach (var (cidr, ip, e) in new[] { ("10.0.0.0/8", "10.255.1.2", true), ("10.0.0.0/8", "11.0.0.1", false), ("192.168.1.0/24", "192.168.1.255", true), ("0.0.0.0/0", "8.8.8.8", true), ("2001:db8::/32", "2001:db8:ffff::1", true), ("2001:db8::/32", "2001:db9::1", false), ("10.0.0.0/8", "::ffff:10.0.0.1", false), ("::/0", "::1", true), ("192.168.1.1/32", "192.168.1.1", true) })
    Eq($"cidr {cidr} contains {ip}", e, IpCidr.CidrContains(cidr, ip));
foreach (var bad in new[] { "10.0.0.1/8", "10.0.0.0/33", "10.0.0.0", "10.0.0.0/08", "2001:db8::/129" })
    Throws<FormatException>($"cidr invalid '{bad}'", () => IpCidr.CidrContains(bad, "10.0.0.1"));
foreach (var (ip, e) in new[] { ("8.8.8.8", true), ("10.1.2.3", false), ("127.0.0.1", false), ("169.254.169.254", false), ("100.64.0.1", false), ("172.31.255.255", false), ("172.32.0.1", true), ("192.168.0.10", false), ("0.0.0.0", false), ("255.255.255.255", false), ("224.0.0.1", false), ("2606:4700:4700::1111", true), ("::1", false), ("fd00::1", false), ("fe80::1", false), ("::ffff:127.0.0.1", false), ("::ffff:8.8.8.8", true), ("64:ff9b::a00:1", false), ("2001:db8::1", false), ("ff02::1", false) })
    Eq($"public {ip}", e, IpCidr.IsPublicIp(ip));

// 30. HTTP Range
string RangeText(RangeResult r) => r.Kind switch {
    RangeKind.None => "none", RangeKind.Unsatisfiable => "unsatisfiable " + r.ContentRange,
    _ => "ranges " + string.Join(" ", r.Ranges.Select(x => $"{x.Start}-{x.End}")) };
foreach (var (h, e) in new (string?, string)[] { ("bytes=0-499", "ranges 0-499"), ("bytes=500-999", "ranges 500-999"), ("bytes=-500", "ranges 9500-9999"), ("bytes=9500-", "ranges 9500-9999"), ("bytes=0-0,-1", "ranges 0-0 9999-9999"), ("bytes= 0-1 , 5-6", "ranges 0-1 5-6"), ("BYTES=0-99", "ranges 0-99"), ("bytes=9999-20000", "ranges 9999-9999"), ("bytes=10000-", "unsatisfiable bytes */10000"), ("bytes=-0", "unsatisfiable bytes */10000"), ("bytes=-20000", "ranges 0-9999"), ("bytes=500-400", "none"), ("items=0-1", "none"), ("bytes=", "none"), ("bytes=0-1,", "none"), ("bytes=abc", "none"), ("bytes=1-2-3", "none"), (null, "none"), ("bytes=10000-10001,20000-", "unsatisfiable bytes */10000") })
    Eq($"range '{h ?? "null"}'", e, RangeText(HttpRange.ParseRange(h, 10000)));
foreach (var (h, e) in new[] { ("bytes=0-", "unsatisfiable bytes */0"), ("bytes=-5", "unsatisfiable bytes */0") })
    Eq($"range empty file '{h}'", e, RangeText(HttpRange.ParseRange(h, 0)));
Eq("content range", "bytes 0-499/10000", HttpRange.ContentRange(0, 499, 10000));
Eq("range 101 specs", "none", RangeText(HttpRange.ParseRange("bytes=" + string.Join(",", Enumerable.Repeat("0-0", 101)), 10)));
Eq("range 100 specs", 100, HttpRange.ParseRange("bytes=" + string.Join(",", Enumerable.Repeat("0-0", 100)), 10).Ranges.Count);
Eq("range huge size", "ranges 9223372036854775806-9223372036854775806", RangeText(HttpRange.ParseRange("bytes=-1", long.MaxValue)));

// 31. Content negotiation
var mediaAvailable = new[] { "application/json", "text/html", "text/csv" };
foreach (var (h, e) in new (string?, string?)[] { ("application/json", "application/json"), ("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "text/html"), ("text/*;q=0.5, application/json;q=0.4", "text/html"), ("*/*", "application/json"), ("text/csv;q=0, text/*", "text/html"), ("image/png", null), ("application/json;q=0", null), ("TEXT/HTML", "text/html"), ("text/html;q=1.5, text/csv", "text/csv"), (null, "application/json"), ("", "application/json"), ("application/*;q=0.2, */*;q=0.1", "application/json"), ("text/html;level=1;q=0.7, text/csv;q=0.7", "text/html") })
    Eq($"media '{h ?? "null"}'", e, ContentNegotiation.NegotiateMediaType(h, mediaAvailable));
var languageAvailable = new[] { "en", "en-GB", "fr", "pt-BR" };
foreach (var (h, e) in new (string?, string?)[] { ("fr-CH, fr;q=0.9, en;q=0.8, de;q=0.7, *;q=0.5", "fr"), ("en-GB", "en-GB"), ("en-US,en;q=0.9", "en"), ("pt", "pt-BR"), ("de", null), ("de, *;q=0.1", "en"), ("en;q=0, *", "fr"), ("PT-br", "pt-BR"), (null, "en"), ("zh-Hant-TW", null) })
    Eq($"language '{h ?? "null"}'", e, ContentNegotiation.NegotiateLanguage(h, languageAvailable));

// 32. HTTP conditional requests
foreach (var (h, e) in new[] { ("\"a\", W/\"b\" ,\"c\"", "\"a\"|W/\"b\"|\"c\""), ("*", "*"), (" * ", "*"), ("W/\"x\", bogus, \"y\"", "W/\"x\"|\"y\""), ("\"\"", "\"\"") }) {
    var tags = HttpConditional.ParseEtags(h);
    Eq($"etag parse '{h}'", e, tags.IsWildcard ? "*" : string.Join("|", tags.Tags));
}
var conditionalCases = new (ConditionalRequest Request, int Status)[] {
    (new ConditionalRequest { Method = "GET", Etag = "\"v2\"", IfNoneMatch = "\"v2\"" }, 304),
    (new ConditionalRequest { Method = "GET", Etag = "\"v2\"", IfNoneMatch = "W/\"v2\"" }, 304),
    (new ConditionalRequest { Method = "GET", Etag = "W/\"v2\"", IfNoneMatch = "\"v1\", \"v2\"" }, 304),
    (new ConditionalRequest { Method = "GET", Etag = "\"v2\"", IfNoneMatch = "\"v1\"" }, 200),
    (new ConditionalRequest { Method = "HEAD", Etag = "\"v2\"", IfNoneMatch = "*" }, 304),
    (new ConditionalRequest { Method = "PUT", Etag = "\"v2\"", IfNoneMatch = "*" }, 412),
    (new ConditionalRequest { Method = "PUT", IfNoneMatch = "*" }, 200),
    (new ConditionalRequest { Method = "PUT", Etag = "\"v2\"", IfMatch = "\"v2\"" }, 200),
    (new ConditionalRequest { Method = "PUT", Etag = "\"v2\"", IfMatch = "\"v1\"" }, 412),
    (new ConditionalRequest { Method = "PUT", Etag = "W/\"v2\"", IfMatch = "W/\"v2\"" }, 412),
    (new ConditionalRequest { Method = "DELETE", IfMatch = "*" }, 412),
    (new ConditionalRequest { Method = "DELETE", Etag = "\"a\"", IfMatch = "*" }, 200),
    (new ConditionalRequest { Method = "GET", Etag = "\"v2\"", LastModified = 1792567680, IfModifiedSince = "Wed, 21 Oct 2026 07:28:00 GMT" }, 304),
    (new ConditionalRequest { Method = "GET", Etag = "\"v2\"", LastModified = 1792567680, IfModifiedSince = "Tue, 20 Oct 2026 07:28:00 GMT" }, 200),
    (new ConditionalRequest { Method = "GET", Etag = "\"v2\"", LastModified = 1792567680, IfNoneMatch = "\"v1\"", IfModifiedSince = "Wed, 21 Oct 2026 07:28:00 GMT" }, 200),
    (new ConditionalRequest { Method = "POST", LastModified = 1792567680, IfModifiedSince = "Wed, 21 Oct 2026 07:28:00 GMT" }, 200),
    (new ConditionalRequest { Method = "PUT", LastModified = 1792567680, IfUnmodifiedSince = "Tue, 20 Oct 2026 07:28:00 GMT" }, 412),
    (new ConditionalRequest { Method = "PUT", LastModified = 1792567680, IfUnmodifiedSince = "Wed, 21 Oct 2026 07:28:00 GMT" }, 200),
    (new ConditionalRequest { Method = "GET", LastModified = 1792567680, IfModifiedSince = "Wednesday, 21-Oct-26 07:28:00 GMT" }, 200),
    (new ConditionalRequest { Method = "GET", Etag = "\"v2\"", IfNoneMatch = "v2" }, 200),
    (new ConditionalRequest { Method = "PUT", Etag = "\"v2\"", IfMatch = "\"v2\"", IfUnmodifiedSince = "Tue, 20 Oct 2026 07:28:00 GMT" }, 200),
};
for (int i = 0; i < conditionalCases.Length; i++)
    Eq($"conditional case {i} {conditionalCases[i].Request}", conditionalCases[i].Status, HttpConditional.EvaluateConditional(conditionalCases[i].Request));
Eq("http date format", "Wed, 21 Oct 2026 07:28:00 GMT", HttpConditional.FormatHttpDate(1792567680));
Eq("http date parse", (long?)1792567680, HttpConditional.ParseHttpDate("Wed, 21 Oct 2026 07:28:00 GMT"));
Eq("http date wrong weekday", (long?)null, HttpConditional.ParseHttpDate("Thu, 21 Oct 2026 07:28:00 GMT"));
Eq("http date epoch", "Thu, 01 Jan 1970 00:00:00 GMT", HttpConditional.FormatHttpDate(0));

// 33. Cookies
foreach (var (name, value, options, e) in new (string, string, CookieOptions, string)[] {
    ("sid", "abc123", new CookieOptions { Path = "/", Secure = true, HttpOnly = true, SameSite = "Lax" }, "sid=abc123; Path=/; Secure; HttpOnly; SameSite=Lax"),
    ("__Host-session", "x.y.z", new CookieOptions { Path = "/", Secure = true, HttpOnly = true, SameSite = "Strict", MaxAge = 3600 }, "__Host-session=x.y.z; Max-Age=3600; Path=/; Secure; HttpOnly; SameSite=Strict"),
    ("theme", "dark", new CookieOptions { MaxAge = 0, Expires = 1792567680, Domain = "Example.COM", Path = "/app" }, "theme=dark; Max-Age=0; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Domain=example.com; Path=/app"),
    ("embed", "1", new CookieOptions { Secure = true, SameSite = "None", Partitioned = true }, "embed=1; Secure; SameSite=None; Partitioned"),
    ("empty", "", new CookieOptions {  }, "empty="),
})
    Eq($"cookie serialize {name}", e, Cookies.SerializeCookie(name, value, options));
Eq("cookie serialize no options", "a=b", Cookies.SerializeCookie("a", "b"));
var invalidCookies = new (string Name, string Value, CookieOptions Options)[] {
    ("bad name", "v", new CookieOptions {  }),
    ("n", "a;b", new CookieOptions {  }),
    ("n", "a b", new CookieOptions {  }),
    ("n", "a\"b", new CookieOptions {  }),
    ("n", "v", new CookieOptions { SameSite = "None" }),
    ("__Secure-x", "v", new CookieOptions {  }),
    ("__Host-x", "v", new CookieOptions { Secure = true, Path = "/a" }),
    ("__Host-x", "v", new CookieOptions { Secure = true, Path = "/", Domain = "example.com" }),
    ("n", "v", new CookieOptions { Path = "relative" }),
    ("n", "v", new CookieOptions { SameSite = "lax" }),
    ("n", "v", new CookieOptions { Partitioned = true }),
    ("n", "v", new CookieOptions { MaxAge = -1 }),
    ("", "v", new CookieOptions {  }),
};
for (int i = 0; i < invalidCookies.Length; i++) {
    var bad = invalidCookies[i];
    Throws<ArgumentException>($"cookie invalid {i} '{bad.Name}'", () => Cookies.SerializeCookie(bad.Name, bad.Value, bad.Options));
}
foreach (var (h, e) in new[] {
    ("sid=abc; theme=dark", new (string, string)[] { ("sid", "abc"), ("theme", "dark") }),
    (" a = 1 ;b=2;; c=\"quoted value\" ;flag;d==x", new (string, string)[] { ("a", "1"), ("b", "2"), ("c", "quoted value"), ("d", "=x") }),
    ("a=1; a=2", new (string, string)[] { ("a", "1"), ("a", "2") }),
    ("", new (string, string)[] {  }),
})
    Check($"cookie parse '{h}'", Cookies.ParseCookieHeader(h).SequenceEqual(e));

// 34. URL normalization
foreach (var (p, e) in new[] { ("/a/b/c/./../../g", "/a/g"), ("mid/content=5/../6", "mid/6"), ("/../a", "/a"), ("/a/./b/.", "/a/b/"), ("/a/b/..", "/a/"), (".", ""), ("../x", "x"), ("/a//b/../c", "/a//c") })
    Eq($"remove dot segments {p}", e, UrlNormalize.RemoveDotSegments(p));
foreach (var (u, e) in new[] { ("HTTP://Example.COM:80/%7Euser/./a/../b?q=%2f", "http://example.com/~user/b?q=%2F"), ("https://example.com", "https://example.com/"), ("https://example.com:443/a%2Fb#frag", "https://example.com/a%2Fb"), ("http://example.com:8080/A/B/../C?", "http://example.com:8080/A/C"), ("https://[2001:DB8::0:1]:8443/x", "https://[2001:db8::1]:8443/x"), ("https://example.com/%e2%82%ac", "https://example.com/%E2%82%AC"), ("http://example.com:/p", "http://example.com/p"), ("https://EXAMPLE.com/a%20b", "https://example.com/a%20b") })
    Eq($"normalize {u}", e, UrlNormalize.NormalizeUrl(u));
foreach (var bad in new[] { "ftp://example.com/", "https://user@example.com/", "https://exa mple.com/", "//example.com/", "https://example.com/%zz", "https://example.com:99999/", "example.com/path", "https://[::g]/" })
    Throws<FormatException>($"normalize invalid '{bad}'", () => UrlNormalize.NormalizeUrl(bad));

// 35. String similarity (code points)
foreach (var (a, b, lev, osa, jaro, jw, ratio) in new[] {
    ("kitten", "sitting", 3, 3, 0.746031746031746, 0.746031746031746, 0.5714285714285714),
    ("flaw", "lawn", 2, 2, 0.8333333333333334, 0.8333333333333334, 0.5),
    ("", "", 0, 0, 1.0, 1.0, 1.0),
    ("", "abc", 3, 3, 0.0, 0.0, 0.0),
    ("abc", "abc", 0, 0, 1.0, 1.0, 1.0),
    ("ca", "abc", 3, 3, 0.0, 0.0, 0.0),
    ("MARTHA", "MARHTA", 2, 1, 0.9444444444444445, 0.9611111111111111, 0.6666666666666667),
    ("DIXON", "DICKSONX", 4, 4, 0.7666666666666666, 0.8133333333333332, 0.5),
    ("DWAYNE", "DUANE", 2, 2, 0.8222222222222223, 0.8400000000000001, 0.6666666666666667),
    ("caf\u00E9", "cafe", 1, 1, 0.8333333333333334, 0.8833333333333334, 0.75),
    ("na\u00EFve", "naive", 1, 1, 0.8666666666666667, 0.8933333333333333, 0.8),
    ("\uD83D\uDE42ab", "ab\uD83D\uDE42", 2, 2, 0.0, 0.0, 0.33333333333333337),
    ("JELLYFISH", "SMELLYFISH", 2, 2, 0.8962962962962964, 0.8962962962962964, 0.8),
}) {
    Eq($"levenshtein '{a}' '{b}'", lev, StringSimilarity.Levenshtein(a, b));
    Eq($"osa '{a}' '{b}'", osa, StringSimilarity.DamerauOsa(a, b));
    Check($"jaro '{a}' '{b}'", Near(jaro, StringSimilarity.Jaro(a, b), 1e-12));
    Check($"jaro-winkler '{a}' '{b}'", Near(jw, StringSimilarity.JaroWinkler(a, b), 1e-12));
    Check($"ratio '{a}' '{b}'", Near(ratio, StringSimilarity.SimilarityRatio(a, b), 1e-12));
}

// 36. RRULE expansion (python-dateutil semantics)
foreach (var (start, rule, e) in new[] {
    ("2026-01-31T09:00:00Z", "FREQ=MONTHLY;COUNT=5", new string[] { "2026-01-31T09:00:00Z", "2026-03-31T09:00:00Z", "2026-05-31T09:00:00Z", "2026-07-31T09:00:00Z", "2026-08-31T09:00:00Z" }),
    ("2026-10-12T09:30:00Z", "FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=7", new string[] { "2026-10-12T09:30:00Z", "2026-10-14T09:30:00Z", "2026-10-16T09:30:00Z", "2026-10-19T09:30:00Z", "2026-10-21T09:30:00Z", "2026-10-23T09:30:00Z", "2026-10-26T09:30:00Z" }),
    ("2026-10-01T00:00:00Z", "FREQ=DAILY;INTERVAL=10;UNTIL=20261115T000000Z", new string[] { "2026-10-01T00:00:00Z", "2026-10-11T00:00:00Z", "2026-10-21T00:00:00Z", "2026-10-31T00:00:00Z", "2026-11-10T00:00:00Z" }),
    ("2026-01-01T12:00:00Z", "FREQ=MONTHLY;BYDAY=-1FR;COUNT=4", new string[] { "2026-01-30T12:00:00Z", "2026-02-27T12:00:00Z", "2026-03-27T12:00:00Z", "2026-04-24T12:00:00Z" }),
    ("2026-01-01T12:00:00Z", "FREQ=MONTHLY;BYDAY=2TU,4TU;COUNT=6", new string[] { "2026-01-13T12:00:00Z", "2026-01-27T12:00:00Z", "2026-02-10T12:00:00Z", "2026-02-24T12:00:00Z", "2026-03-10T12:00:00Z", "2026-03-24T12:00:00Z" }),
    ("2026-01-15T08:00:00Z", "FREQ=MONTHLY;BYMONTHDAY=1,-1;COUNT=6", new string[] { "2026-01-31T08:00:00Z", "2026-02-01T08:00:00Z", "2026-02-28T08:00:00Z", "2026-03-01T08:00:00Z", "2026-03-31T08:00:00Z", "2026-04-01T08:00:00Z" }),
    ("2028-02-29T00:00:00Z", "FREQ=YEARLY;COUNT=3", new string[] { "2028-02-29T00:00:00Z", "2032-02-29T00:00:00Z", "2036-02-29T00:00:00Z" }),
    ("2026-03-10T10:00:00Z", "FREQ=YEARLY;BYMONTH=3,9;COUNT=5", new string[] { "2026-03-10T10:00:00Z", "2026-09-10T10:00:00Z", "2027-03-10T10:00:00Z", "2027-09-10T10:00:00Z", "2028-03-10T10:00:00Z" }),
    ("2026-10-14T18:00:00Z", "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU;COUNT=3", new string[] { "2026-10-27T18:00:00Z", "2026-11-10T18:00:00Z", "2026-11-24T18:00:00Z" }),
    ("2026-10-14T18:00:00Z", "FREQ=WEEKLY;COUNT=2", new string[] { "2026-10-14T18:00:00Z", "2026-10-21T18:00:00Z" }),
    ("2026-01-31T09:00:00Z", "FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=31;UNTIL=20261231T235959Z", new string[] { "2026-01-31T09:00:00Z", "2026-03-31T09:00:00Z", "2026-05-31T09:00:00Z", "2026-07-31T09:00:00Z" }),
    ("2026-10-12T07:00:00Z", "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR;COUNT=8", new string[] { "2026-10-12T07:00:00Z", "2026-10-13T07:00:00Z", "2026-10-14T07:00:00Z", "2026-10-15T07:00:00Z", "2026-10-16T07:00:00Z", "2026-10-19T07:00:00Z", "2026-10-20T07:00:00Z", "2026-10-21T07:00:00Z" }),
    ("2026-01-01T00:00:00Z", "FREQ=MONTHLY;BYDAY=FR;BYMONTHDAY=13;COUNT=3", new string[] { "2026-02-13T00:00:00Z", "2026-03-13T00:00:00Z", "2026-11-13T00:00:00Z" }),
    ("2026-01-01T09:00:00Z", "FREQ=YEARLY;BYMONTH=11;BYDAY=4TH;COUNT=3", new string[] { "2026-11-26T09:00:00Z", "2027-11-25T09:00:00Z", "2028-11-23T09:00:00Z" }),
    ("2026-01-01T09:00:00Z", "FREQ=YEARLY;BYDAY=1MO;COUNT=3", new string[] { "2026-01-05T09:00:00Z", "2027-01-04T09:00:00Z", "2028-01-03T09:00:00Z" }),
    ("2026-01-01T09:00:00Z", "FREQ=YEARLY;BYDAY=-1SU;COUNT=2", new string[] { "2026-12-27T09:00:00Z", "2027-12-26T09:00:00Z" }),
    ("2026-01-01T10:00:00Z", "FREQ=YEARLY;BYDAY=20MO;COUNT=2", new string[] { "2026-05-18T10:00:00Z", "2027-05-17T10:00:00Z" }),
    ("2026-01-01T10:00:00Z", "FREQ=YEARLY;BYDAY=MO;BYMONTH=2;COUNT=5", new string[] { "2026-02-02T10:00:00Z", "2026-02-09T10:00:00Z", "2026-02-16T10:00:00Z", "2026-02-23T10:00:00Z", "2027-02-01T10:00:00Z" }),
    ("2026-01-01T10:00:00Z", "FREQ=YEARLY;BYMONTHDAY=-1;COUNT=4", new string[] { "2026-01-31T10:00:00Z", "2026-02-28T10:00:00Z", "2026-03-31T10:00:00Z", "2026-04-30T10:00:00Z" }),
    ("2026-03-05T10:00:00Z", "FREQ=YEARLY;BYMONTHDAY=1,15;BYMONTH=6;COUNT=4", new string[] { "2026-06-01T10:00:00Z", "2026-06-15T10:00:00Z", "2027-06-01T10:00:00Z", "2027-06-15T10:00:00Z" }),
    ("2026-01-05T08:00:00Z", "FREQ=WEEKLY;BYMONTH=1,7;BYDAY=MO;COUNT=6", new string[] { "2026-01-05T08:00:00Z", "2026-01-12T08:00:00Z", "2026-01-19T08:00:00Z", "2026-01-26T08:00:00Z", "2026-07-06T08:00:00Z", "2026-07-13T08:00:00Z" }),
    ("2026-01-01T08:00:00Z", "FREQ=DAILY;BYMONTHDAY=1,-1;COUNT=5", new string[] { "2026-01-01T08:00:00Z", "2026-01-31T08:00:00Z", "2026-02-01T08:00:00Z", "2026-02-28T08:00:00Z", "2026-03-01T08:00:00Z" }),
    ("2026-01-01T08:00:00Z", "FREQ=DAILY;BYMONTH=2;BYMONTHDAY=29;COUNT=2", new string[] { "2028-02-29T08:00:00Z", "2032-02-29T08:00:00Z" }),
    ("2026-05-20T08:00:00Z", "FREQ=MONTHLY;BYMONTH=6,12;COUNT=4", new string[] { "2026-06-20T08:00:00Z", "2026-12-20T08:00:00Z", "2027-06-20T08:00:00Z", "2027-12-20T08:00:00Z" }),
    ("2026-01-31T08:00:00Z", "FREQ=MONTHLY;BYDAY=MO;BYMONTH=3;COUNT=5", new string[] { "2026-03-02T08:00:00Z", "2026-03-09T08:00:00Z", "2026-03-16T08:00:00Z", "2026-03-23T08:00:00Z", "2026-03-30T08:00:00Z" }),
    ("2026-06-01T08:00:00Z", "FREQ=YEARLY;INTERVAL=2;BYMONTH=2;BYMONTHDAY=29;COUNT=2", new string[] { "2028-02-29T08:00:00Z", "2032-02-29T08:00:00Z" }),
    ("2026-10-12T09:00:00Z", "FREQ=WEEKLY;BYDAY=SA,SU;UNTIL=20261101T090000Z", new string[] { "2026-10-17T09:00:00Z", "2026-10-18T09:00:00Z", "2026-10-24T09:00:00Z", "2026-10-25T09:00:00Z", "2026-10-31T09:00:00Z", "2026-11-01T09:00:00Z" }),
    ("2026-01-01T00:00:00Z", "FREQ=MONTHLY;BYDAY=+1MO,-1FR;COUNT=4", new string[] { "2026-01-05T00:00:00Z", "2026-01-30T00:00:00Z", "2026-02-02T00:00:00Z", "2026-02-27T00:00:00Z" }),
})
    Check($"rrule {start} {rule}", RRule.ExpandRRule(start, rule).SequenceEqual(e));
foreach (var bad in new[] {
    "FREQ=HOURLY",
    "COUNT=3",
    "FREQ=DAILY;COUNT=2;UNTIL=20261231T000000Z",
    "FREQ=WEEKLY;BYDAY=1MO",
    "FREQ=DAILY;BYDAY=1MO",
    "FREQ=MONTHLY;BYMONTHDAY=32",
    "FREQ=MONTHLY;BYMONTHDAY=0",
    "FREQ=MONTHLY;BYSETPOS=1",
    "FREQ=WEEKLY;WKST=MO",
    "FREQ=WEEKLY;INTERVAL=0",
    "FREQ=WEEKLY;INTERVAL=-1",
    "FREQ=MONTHLY;BYDAY=6MO",
    "FREQ=YEARLY;BYMONTH=1;BYDAY=6MO",
    "FREQ=YEARLY;BYDAY=54MO",
    "FREQ=MONTHLY;BYDAY=0MO",
    "FREQ=MONTHLY;BYDAY=MO,1TU",
    "FREQ=YEARLY;BYMONTH=13",
    "FREQ=YEARLY;BYMONTH=-1",
    "FREQ=YEARLY;UNTIL=2026-12-31",
    "FREQ=DAILY;FREQ=DAILY",
    "FREQ=WEEKLY;BYDAY=XX",
    "FREQ=DAILY;BYHOUR=9",
})
    Throws<FormatException>($"rrule invalid '{bad}'", () => RRule.ExpandRRule("2026-01-01T00:00:00Z", bad));
foreach (var ok in new[] { "FREQ=DAILY;BYDAY=MO", "FREQ=MONTHLY;BYDAY=MO;BYMONTHDAY=1", "FREQ=YEARLY;BYDAY=20MO" })
    Check($"rrule now accepted '{ok}'", RRule.ExpandRRule("2026-01-01T00:00:00Z", ok, 3).Count > 0);
Eq("rrule impossible rule is empty", 0, RRule.ExpandRRule("2026-01-01T00:00:00Z", "FREQ=DAILY;BYMONTH=2;BYMONTHDAY=30;COUNT=1").Count);
Throws<FormatException>("rrule bad dtstart", () => RRule.ExpandRRule("2026-02-30T00:00:00Z", "FREQ=DAILY"));
Throws<ArgumentOutOfRangeException>("rrule limit 0", () => RRule.ExpandRRule("2026-01-01T00:00:00Z", "FREQ=DAILY", 0));
Throws<ArgumentOutOfRangeException>("rrule limit 1001", () => RRule.ExpandRRule("2026-01-01T00:00:00Z", "FREQ=DAILY", 1001));
Eq("rrule default limit 50", 50, RRule.ExpandRRule("2026-01-01T00:00:00Z", "FREQ=DAILY").Count);
Eq("rrule limit 3", 3, RRule.ExpandRRule("2026-01-01T00:00:00Z", "FREQ=DAILY", 3).Count);
Eq("rrule until before start", 0, RRule.ExpandRRule("2026-01-01T00:00:00Z", "FREQ=DAILY;UNTIL=20251231T000000Z").Count);

// 37. Base encodings (wave 7 vectors)
foreach (var (hex, rfc, hexAlpha, unpadded) in new[] {
    ("", "", "", ""),
    ("66", "MY======", "CO======", "MY"),
    ("666f", "MZXQ====", "CPNG====", "MZXQ"),
    ("666f6f", "MZXW6===", "CPNMU===", "MZXW6"),
    ("666f6f62", "MZXW6YQ=", "CPNMUOG=", "MZXW6YQ"),
    ("666f6f6261", "MZXW6YTB", "CPNMUOJ1", "MZXW6YTB"),
    ("666f6f626172", "MZXW6YTBOI======", "CPNMUOJ1E8======", "MZXW6YTBOI"),
}) {
    var data = Convert.FromHexString(hex);
    Eq($"base32 encode {hex}", rfc, BaseEncodings.Base32Encode(data));
    Eq($"base32hex encode {hex}", hexAlpha, BaseEncodings.Base32Encode(data, "hex"));
    Eq($"base32 unpadded encode {hex}", unpadded, BaseEncodings.Base32Encode(data, padding: false));
    Check($"base32 decode {rfc}", BaseEncodings.Base32Decode(rfc).SequenceEqual(data));
    Check($"base32hex decode {hexAlpha}", BaseEncodings.Base32Decode(hexAlpha, "hex").SequenceEqual(data));
    Check($"base32 unpadded decode {unpadded}", BaseEncodings.Base32Decode(unpadded, padding: false).SequenceEqual(data));
}
Check("base32 decode case-insensitive", BaseEncodings.Base32Decode("mzxw6ytboi======").SequenceEqual(Convert.FromHexString("666f6f626172")));
foreach (var (text, padding) in new[] { ("MZXW6YT", true), ("MZXW6YR=", true), ("MZ======", true), ("MZXW6YTB1=======", true), ("MZXR====", true), ("MZXW6===", false) })
    Throws<FormatException>($"base32 invalid '{text}' padding={padding}", () => BaseEncodings.Base32Decode(text, padding: padding));
foreach (var (hex, text) in new[] { ("", ""), ("48656c6c6f20576f726c6421", "2NEpo7TZRRrLZSi2U"), ("0000287fb4cd", "11233QC4"), ("00", "1"), ("0000", "11"), ("ff", "5Q"), ("00eb15231dfceb60925886b67d065299925915aeb172c06647", "1NS17iag9jJgTHD1VXjvLCEnZuQ3rJDE9L") }) {
    Eq($"base58 encode {hex}", text, BaseEncodings.Base58Encode(Convert.FromHexString(hex)));
    Eq($"base58 decode {text}", hex, Convert.ToHexString(BaseEncodings.Base58Decode(text)).ToLowerInvariant());
}
foreach (var bad in new[] { "0OIl", "abc0", "I" }) Throws<FormatException>($"base58 invalid '{bad}'", () => BaseEncodings.Base58Decode(bad));
foreach (var (hex, text) in new[] { ("", ""), ("66", "Zg"), ("666f", "Zm8"), ("666f6f", "Zm9v"), ("666f6f62", "Zm9vYg"), ("666f6f6261", "Zm9vYmE"), ("666f6f626172", "Zm9vYmFy"), ("fbff", "-_8"), ("000102030405", "AAECAwQF") }) {
    Eq($"base64url encode {hex}", text, BaseEncodings.Base64UrlEncode(Convert.FromHexString(hex)));
    Eq($"base64url decode {text}", hex, Convert.ToHexString(BaseEncodings.Base64UrlDecode(text)).ToLowerInvariant());
}
foreach (var bad in new[] { "Zg==", "Zh", "a", "+/", "Zm9v!" }) Throws<FormatException>($"base64url invalid '{bad}'", () => BaseEncodings.Base64UrlDecode(bad));

// 38. vCard (wave 7 vectors, byte-exact)
foreach (var (contact, expected) in new (VCardContact, string)[] {
    (new VCardContact("Ada Lovelace") { N = new VCardName(Family: "Lovelace", Given: "Ada", Prefix: "Countess"), Org = "Analytical Engines, Ltd.", Title = "Programmer", Note = "First line\nSecond; with, punctuation \\ backslash", Uid = "urn:uuid:01a0c450-6c7b-7102-8304-05060708090a", Emails = new[] { new VCardTypedValue("ada@example.com", "work") }, Phones = new[] { new VCardTypedValue("+44 20 7946 0000", "cell") }, Address = new VCardAddress(Type: "home", Street: "12 St. James's Sq", Locality: "London", PostalCode: "SW1Y 4LB", Country: "United Kingdom"), Urls = new[] { "https://example.com/ada" } },
        "BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Ada Lovelace\r\nN:Lovelace;Ada;;Countess;\r\nORG:Analytical Engines\\, Ltd.\r\nTITLE:Programmer\r\nEMAIL;TYPE=work:ada@example.com\r\nTEL;TYPE=cell:+44 20 7946 0000\r\nADR;TYPE=home:;;12 St. James's Sq;London;;SW1Y 4LB;United Kingdom\r\nURL:https://example.com/ada\r\nNOTE:First line\\nSecond\\; with\\, punctuation \\\\ backslash\r\nUID:urn:uuid:01a0c450-6c7b-7102-8304-05060708090a\r\nEND:VCARD\r\n"),
    (new VCardContact("Zo\u00EB \u00C5ngstr\u00F6m") {  },
        "BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Zo\u00EB \u00C5ngstr\u00F6m\r\nEND:VCARD\r\n"),
    (new VCardContact("Long Note") { Note = "\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9" },
        "BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Long Note\r\nNOTE:\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\r\n \u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\u00E9\r\nEND:VCARD\r\n"),
})
    Eq($"vcard {contact.Fn}", expected, VCard.BuildVcard(contact));
var invalidVcards = new VCardContact[] {
    new VCardContact("") {  },
    new VCardContact("   ") {  },
    new VCardContact("A") { Emails = new[] { new VCardTypedValue("not an email") } },
    new VCardContact("A") { Phones = new[] { new VCardTypedValue("call me") } },
    new VCardContact("A") { Urls = new[] { "javascript:alert(1)" } },
    new VCardContact("A") { Emails = new[] { new VCardTypedValue("a@b.c", "Work") } },
    new VCardContact("Tab\there") {  },
};
for (int i = 0; i < invalidVcards.Length; i++) { var bad = invalidVcards[i]; Throws<ArgumentException>($"vcard invalid {i}", () => VCard.BuildVcard(bad)); }

// 39. Non-cryptographic hashing (wave 7 vectors)
foreach (var (text, crc, fnv32, fnv64, m0, m42) in new (string, uint, uint, string, uint, uint)[] {
    ("", 0u, 2166136261u, "cbf29ce484222325", 0u, 142593372u),
    ("a", 3904355907u, 3826002220u, "af63dc4c8601ec8c", 1009084850u, 3001393763u),
    ("foobar", 2666930069u, 3214735720u, "85944171f73967e8", 2764362941u, 1018276128u),
    ("123456789", 3421780262u, 3146166556u, "06d5573923c6cdfc", 3036607362u, 3059026825u),
    ("hello", 907060870u, 1335831723u, "a430d84680aabd0b", 613153351u, 3806057185u),
    ("The quick brown fox jumps over the lazy dog", 1095738169u, 76545936u, "f3f9b7f5e7e47110", 776992547u, 880582914u),
    ("h\u00E9llo w\u00F6rld", 354246585u, 3558752674u, "11824ab841812022", 2549609076u, 857211688u),
}) {
    var data = Encoding.UTF8.GetBytes(text);
    Eq($"crc32 '{text}'", crc, Hashing.Crc32(data));
    Eq($"fnv1a32 '{text}'", fnv32, Hashing.Fnv1a32(data));
    Eq($"fnv1a64 '{text}'", fnv64, Hashing.Fnv1a64(data).ToString("x16"));
    Eq($"murmur3 seed 0 '{text}'", m0, Hashing.Murmur3_32(data));
    Eq($"murmur3 seed 42 '{text}'", m42, Hashing.Murmur3_32(data, 42));
}
foreach (var (jumpKey, jumpBuckets, jumpBucket) in new (ulong, int, int)[] { (0UL, 1, 0), (1UL, 10, 6), (256UL, 1024, 520), (3735928559UL, 100, 87), (18446744073709551615UL, 1000, 313), (12345678901234567UL, 7, 5), (42UL, 2147483647, 1603940301) })
    Eq($"jump hash {jumpKey} {jumpBuckets}", jumpBucket, Hashing.JumpHash(jumpKey, jumpBuckets));
Throws<ArgumentOutOfRangeException>("jump hash 0 buckets", () => Hashing.JumpHash(1, 0));

// 40. Feature flags (wave 7 vectors)
foreach (var (flag, user, expected) in new (FeatureFlag, string, FlagResult)[] {
    (new FeatureFlag("new-checkout") { RolloutPercent = 25 }, "user-1", new FlagResult(false, "excluded", 4063, null)),
    (new FeatureFlag("new-checkout") { RolloutPercent = 25 }, "user-2", new FlagResult(true, "rollout", 1682, null)),
    (new FeatureFlag("new-checkout") { RolloutPercent = 25 }, "user-3", new FlagResult(false, "excluded", 9301, null)),
    (new FeatureFlag("new-checkout") { RolloutPercent = 25 }, "user-42", new FlagResult(false, "excluded", 9926, null)),
    (new FeatureFlag("new-checkout") { RolloutPercent = 25 }, "alice@example.com", new FlagResult(false, "excluded", 2919, null)),
    (new FeatureFlag("new-checkout") { Allow = new[] { "user-2" }, Deny = new[] { "user-1" }, RolloutPercent = 25 }, "user-1", new FlagResult(false, "deny", 4063, null)),
    (new FeatureFlag("new-checkout") { Allow = new[] { "user-2" }, Deny = new[] { "user-1" }, RolloutPercent = 25 }, "user-2", new FlagResult(true, "allow", 1682, null)),
    (new FeatureFlag("beta") { Enabled = false, Allow = new[] { "vip" } }, "vip", new FlagResult(false, "disabled", 3546, null)),
    (new FeatureFlag("banner") { RolloutPercent = 0 }, "user-1", new FlagResult(false, "excluded", 6646, null)),
    (new FeatureFlag("banner") { RolloutPercent = 100 }, "user-1", new FlagResult(true, "rollout", 6646, null)),
    (new FeatureFlag("banner") { RolloutPercent = 12.34 }, "user-9", new FlagResult(false, "excluded", 7598, null)),
    (new FeatureFlag("pricing-test") { Variants = new[] { new FlagVariant("control", 50), new FlagVariant("annual-first", 30), new FlagVariant("monthly-first", 20) } }, "u1", new FlagResult(true, "rollout", 4196, "monthly-first")),
    (new FeatureFlag("pricing-test") { Variants = new[] { new FlagVariant("control", 50), new FlagVariant("annual-first", 30), new FlagVariant("monthly-first", 20) } }, "u2", new FlagResult(true, "rollout", 7053, "control")),
    (new FeatureFlag("pricing-test") { Variants = new[] { new FlagVariant("control", 50), new FlagVariant("annual-first", 30), new FlagVariant("monthly-first", 20) } }, "u3", new FlagResult(true, "rollout", 9434, "annual-first")),
    (new FeatureFlag("pricing-test") { Variants = new[] { new FlagVariant("control", 50), new FlagVariant("annual-first", 30), new FlagVariant("monthly-first", 20) } }, "u4", new FlagResult(true, "rollout", 1339, "annual-first")),
    (new FeatureFlag("pricing-test") { Variants = new[] { new FlagVariant("control", 50), new FlagVariant("annual-first", 30), new FlagVariant("monthly-first", 20) } }, "u5", new FlagResult(true, "rollout", 3720, "annual-first")),
    (new FeatureFlag("pricing-test") { Variants = new[] { new FlagVariant("control", 50), new FlagVariant("annual-first", 30), new FlagVariant("monthly-first", 20) } }, "\u00FCn\u00EFcode", new FlagResult(true, "rollout", 9874, "control")),
})
    Eq($"flag {flag.Key} {user}", expected, FeatureFlags.EvaluateFlag(flag, user));
var invalidFlags = new FeatureFlag[] { new FeatureFlag("bad key") {  }, new FeatureFlag("k") { RolloutPercent = 101 }, new FeatureFlag("k") { RolloutPercent = 12.345 }, new FeatureFlag("k") { Variants = new[] { new FlagVariant("a", 0) } }, new FeatureFlag("") {  } };
for (int i = 0; i < invalidFlags.Length; i++) { var bad = invalidFlags[i]; Throws<ArgumentException>($"flag invalid {i}", () => FeatureFlags.EvaluateFlag(bad, "u")); }
Eq("flag same user same answer", FeatureFlags.EvaluateFlag(new FeatureFlag("x") { RolloutPercent = 50 }, "u7"), FeatureFlags.EvaluateFlag(new FeatureFlag("x") { RolloutPercent = 50 }, "u7"));
Check("flag raising percent only adds users", Enumerable.Range(0, 500).All(i => !FeatureFlags.EvaluateFlag(new FeatureFlag("ramp") { RolloutPercent = 10 }, "user-" + i).On || FeatureFlags.EvaluateFlag(new FeatureFlag("ramp") { RolloutPercent = 30 }, "user-" + i).On));

// 41. Human units (wave 7 vectors)
foreach (var (n, unitBase, decimals, expected) in new (long, string, int, string)[] { (0L, "si", 1, "0 B"), (999L, "si", 1, "999 B"), (1000L, "si", 1, "1 kB"), (1536L, "iec", 1, "1.5 KiB"), (1536L, "si", 1, "1.5 kB"), (999950L, "si", 1, "1 MB"), (999949L, "si", 1, "999.9 kB"), (1048576L, "iec", 2, "1 MiB"), (123456789L, "si", 2, "123.46 MB"), (123456789L, "iec", 0, "118 MiB"), (9223372036854775807L, "iec", 3, "8 EiB"), (1023L, "iec", 1, "1023 B"), (1024L, "iec", 1, "1 KiB"), (5000000000000L, "si", 1, "5 TB") })
    Eq($"format bytes {n} {unitBase} {decimals}", expected, HumanUnits.FormatBytes(n, unitBase, decimals));
foreach (var (text, expected) in new (string, long)[] { ("0", 0L), ("512", 512L), ("1kB", 1000L), ("1 KiB", 1024L), ("1.5 GiB", 1610612736L), ("2.25MB", 2250000L), (" 10 b ", 10L), ("1.0005 kB", 1001L), ("1.5", 2L), ("0.5 B", 1L), ("7 EiB", 8070450532247928832L) })
    Eq($"parse bytes '{text}'", expected, HumanUnits.ParseBytes(text));
foreach (var bad in new[] { "", "abc", "1 KB B", "1.5.2 MB", "-1 kB", "1 kbit", "1e3 B", "9 EiB", ".5 kB" }) Throws<FormatException>($"parse bytes invalid '{bad}'", () => HumanUnits.ParseBytes(bad));
foreach (var (ms, expected) in new (long, string)[] { (0L, "0ms"), (850L, "850ms"), (1000L, "1s"), (45000L, "45s"), (65000L, "1m 5s"), (3600000L, "1h"), (3725000L, "1h 2m"), (90061000L, "1d 1h"), (172800000L, "2d"), (59999L, "59s") })
    Eq($"format duration {ms}", expected, HumanUnits.FormatDuration(ms));
foreach (var (delta, expected) in new (long, string)[] { (0L, "just now"), (30L, "just now"), (-44L, "just now"), (45L, "in a minute"), (-89L, "a minute ago"), (90L, "in 2 minutes"), (150L, "in 3 minutes"), (-2670L, "45 minutes ago"), (2700L, "in an hour"), (5399L, "in an hour"), (5400L, "in 2 hours"), (-75600L, "21 hours ago"), (79200L, "in a day"), (129599L, "in a day"), (129600L, "in 2 days"), (2246400L, "in a month"), (-3974400L, "2 months ago"), (15552000L, "in 6 months"), (27648000L, "in a year"), (-47347200L, "2 years ago"), (63115200L, "in 2 years"), (315569520L, "in 10 years") })
    Eq($"relative time {delta}", expected, HumanUnits.RelativeTime(delta));
Throws<ArgumentOutOfRangeException>("format bytes negative", () => HumanUnits.FormatBytes(-1));
Throws<ArgumentOutOfRangeException>("format bytes decimals 4", () => HumanUnits.FormatBytes(1, "si", 4));

// 42. Line diff (wave 8 vectors: Myers linear space, minimal edit script, valid unified diff)
string OpsText(List<DiffOp> ops) => string.Join("|", ops.Select(o => o.Op + o.Line));
// Rebuilds both texts' lines from the ops ("=" and "-" give a, "=" and "+" give b).
bool OpsRebuild(string a, string b, List<DiffOp> ops) {
    static string[] Lines(string t) { if (t.Length == 0) return Array.Empty<string>(); var p = t.Split('\n'); return t.EndsWith('\n') ? p[..^1] : p; }
    return Lines(a).SequenceEqual(ops.Where(o => o.Op != "+").Select(o => o.Line)) && Lines(b).SequenceEqual(ops.Where(o => o.Op != "-").Select(o => o.Line));
}
foreach (var (a, b, expected) in new (string, string, string)[] {
    ("", "", ""),
    ("a\n", "a\n", "=a"),
    ("", "a\n", "+a"),
    ("a\n", "", "-a"),
    ("a\nb\nc\n", "a\nc\n", "=a|-b|=c"),
    ("a\nb\nc\n", "a\nB\nc\n", "=a|-b|+B|=c"),
    ("a\nb", "a\nb\n", "=a|-b|+b"),
    ("a\nb\n", "a\nb", "=a|-b|+b"),
    ("x", "y", "-x|+y"),
    ("a\n\nb\n", "a\nb\n", "=a|-|=b"),
    ("1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n", "1\n2\nX\n4\n5\n6\n7\n8\n9\n10\nY\n12\n", "=1|=2|-3|+X|=4|=5|=6|=7|=8|=9|=10|-11|+Y|=12"),
    ("a\nb\na\nb\n", "b\na\nb\na\n", "-a|=b|=a|=b|+a"),
}) {
    var ops = LineDiff.DiffLines(a, b);
    Eq($"diff lines {Regex.Escape(a)} -> {Regex.Escape(b)}", expected, OpsText(ops));
    Check($"diff lines rebuild {Regex.Escape(a)} -> {Regex.Escape(b)}", OpsRebuild(a, b, ops));
}
foreach (var (a, b, context, expected) in new (string, string, int, string)[] {
    ("", "", 3, ""),
    ("", "", 0, ""),
    ("", "", 1, ""),
    ("a\n", "a\n", 3, ""),
    ("a\n", "a\n", 0, ""),
    ("a\n", "a\n", 1, ""),
    ("", "a\n", 3, "--- a\n+++ b\n@@ -0,0 +1 @@\n+a\n"),
    ("", "a\n", 0, "--- a\n+++ b\n@@ -0,0 +1 @@\n+a\n"),
    ("", "a\n", 1, "--- a\n+++ b\n@@ -0,0 +1 @@\n+a\n"),
    ("a\n", "", 3, "--- a\n+++ b\n@@ -1 +0,0 @@\n-a\n"),
    ("a\n", "", 0, "--- a\n+++ b\n@@ -1 +0,0 @@\n-a\n"),
    ("a\n", "", 1, "--- a\n+++ b\n@@ -1 +0,0 @@\n-a\n"),
    ("a\nb\nc\n", "a\nc\n", 3, "--- a\n+++ b\n@@ -1,3 +1,2 @@\n a\n-b\n c\n"),
    ("a\nb\nc\n", "a\nc\n", 0, "--- a\n+++ b\n@@ -2 +1,0 @@\n-b\n"),
    ("a\nb\nc\n", "a\nc\n", 1, "--- a\n+++ b\n@@ -1,3 +1,2 @@\n a\n-b\n c\n"),
    ("a\nb\nc\n", "a\nB\nc\n", 3, "--- a\n+++ b\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n"),
    ("a\nb\nc\n", "a\nB\nc\n", 0, "--- a\n+++ b\n@@ -2 +2 @@\n-b\n+B\n"),
    ("a\nb\nc\n", "a\nB\nc\n", 1, "--- a\n+++ b\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n"),
    ("a\nb", "a\nb\n", 3, "--- a\n+++ b\n@@ -1,2 +1,2 @@\n a\n-b\n\\ No newline at end of file\n+b\n"),
    ("a\nb", "a\nb\n", 0, "--- a\n+++ b\n@@ -2 +2 @@\n-b\n\\ No newline at end of file\n+b\n"),
    ("a\nb", "a\nb\n", 1, "--- a\n+++ b\n@@ -1,2 +1,2 @@\n a\n-b\n\\ No newline at end of file\n+b\n"),
    ("a\nb\n", "a\nb", 3, "--- a\n+++ b\n@@ -1,2 +1,2 @@\n a\n-b\n+b\n\\ No newline at end of file\n"),
    ("a\nb\n", "a\nb", 0, "--- a\n+++ b\n@@ -2 +2 @@\n-b\n+b\n\\ No newline at end of file\n"),
    ("a\nb\n", "a\nb", 1, "--- a\n+++ b\n@@ -1,2 +1,2 @@\n a\n-b\n+b\n\\ No newline at end of file\n"),
    ("x", "y", 3, "--- a\n+++ b\n@@ -1 +1 @@\n-x\n\\ No newline at end of file\n+y\n\\ No newline at end of file\n"),
    ("x", "y", 0, "--- a\n+++ b\n@@ -1 +1 @@\n-x\n\\ No newline at end of file\n+y\n\\ No newline at end of file\n"),
    ("x", "y", 1, "--- a\n+++ b\n@@ -1 +1 @@\n-x\n\\ No newline at end of file\n+y\n\\ No newline at end of file\n"),
    ("a\n\nb\n", "a\nb\n", 3, "--- a\n+++ b\n@@ -1,3 +1,2 @@\n a\n-\n b\n"),
    ("a\n\nb\n", "a\nb\n", 0, "--- a\n+++ b\n@@ -2 +1,0 @@\n-\n"),
    ("a\n\nb\n", "a\nb\n", 1, "--- a\n+++ b\n@@ -1,3 +1,2 @@\n a\n-\n b\n"),
    ("1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n", "1\n2\nX\n4\n5\n6\n7\n8\n9\n10\nY\n12\n", 3, "--- a\n+++ b\n@@ -1,6 +1,6 @@\n 1\n 2\n-3\n+X\n 4\n 5\n 6\n@@ -8,5 +8,5 @@\n 8\n 9\n 10\n-11\n+Y\n 12\n"),
    ("1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n", "1\n2\nX\n4\n5\n6\n7\n8\n9\n10\nY\n12\n", 0, "--- a\n+++ b\n@@ -3 +3 @@\n-3\n+X\n@@ -11 +11 @@\n-11\n+Y\n"),
    ("1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n", "1\n2\nX\n4\n5\n6\n7\n8\n9\n10\nY\n12\n", 1, "--- a\n+++ b\n@@ -2,3 +2,3 @@\n 2\n-3\n+X\n 4\n@@ -10,3 +10,3 @@\n 10\n-11\n+Y\n 12\n"),
    ("a\nb\na\nb\n", "b\na\nb\na\n", 3, "--- a\n+++ b\n@@ -1,4 +1,4 @@\n-a\n b\n a\n b\n+a\n"),
    ("a\nb\na\nb\n", "b\na\nb\na\n", 0, "--- a\n+++ b\n@@ -1 +0,0 @@\n-a\n@@ -4,0 +4 @@\n+a\n"),
    ("a\nb\na\nb\n", "b\na\nb\na\n", 1, "--- a\n+++ b\n@@ -1,2 +1 @@\n-a\n b\n@@ -4 +3,2 @@\n b\n+a\n"),
    ("line 5\nline 5\nline 4\n", "}\nline 5\nline 4\n", 3, "--- a\n+++ b\n@@ -1,3 +1,3 @@\n-line 5\n+}\n line 5\n line 4\n"),
    ("line 5\nline 5\nline 4\n", "}\nline 5\nline 4\n", 0, "--- a\n+++ b\n@@ -1 +1 @@\n-line 5\n+}\n"),
    ("line 5\nline 5\nline 4\n", "}\nline 5\nline 4\n", 1, "--- a\n+++ b\n@@ -1,2 +1,2 @@\n-line 5\n+}\n line 5\n"),
    ("{\n}\n{\n}\n", "{\n}\n{\nx\n}\n{\n}\n", 3, "--- a\n+++ b\n@@ -1,4 +1,7 @@\n {\n }\n {\n+x\n }\n+{\n+}\n"),
    ("{\n}\n{\n}\n", "{\n}\n{\nx\n}\n{\n}\n", 0, "--- a\n+++ b\n@@ -3,0 +4 @@\n+x\n@@ -4,0 +6,2 @@\n+{\n+}\n"),
    ("{\n}\n{\n}\n", "{\n}\n{\nx\n}\n{\n}\n", 1, "--- a\n+++ b\n@@ -3,2 +3,5 @@\n {\n+x\n }\n+{\n+}\n"),
    ("same\nsame\nsame\n", "same\nsame\n", 3, "--- a\n+++ b\n@@ -1,3 +1,2 @@\n same\n same\n-same\n"),
    ("same\nsame\nsame\n", "same\nsame\n", 0, "--- a\n+++ b\n@@ -3 +2,0 @@\n-same\n"),
    ("same\nsame\nsame\n", "same\nsame\n", 1, "--- a\n+++ b\n@@ -2,2 +2 @@\n same\n-same\n"),
    ("p\nq\nr\n", "a\nb\nc\n", 3, "--- a\n+++ b\n@@ -1,3 +1,3 @@\n-p\n-q\n-r\n+a\n+b\n+c\n"),
    ("p\nq\nr\n", "a\nb\nc\n", 0, "--- a\n+++ b\n@@ -1,3 +1,3 @@\n-p\n-q\n-r\n+a\n+b\n+c\n"),
    ("p\nq\nr\n", "a\nb\nc\n", 1, "--- a\n+++ b\n@@ -1,3 +1,3 @@\n-p\n-q\n-r\n+a\n+b\n+c\n"),
    ("line 0\nline 4\nline 3\nline 3\nline 2\nline 1\n    return x\n", "line 4\nline 2\n{\nline 1\nline 3\n", 3, "--- a\n+++ b\n@@ -1,7 +1,5 @@\n-line 0\n line 4\n-line 3\n-line 3\n line 2\n+{\n line 1\n-    return x\n+line 3\n"),
    ("    return x\nline 2\nline 0\nline 0\n\nline 0\nline 2\n    return x\nline 2\n}\nline 2\n    return x\nline 0\n", "    return x\nline 2\nline 0\nline 0\nline 0\nline 2\n    return x\nline 2\n}\n}\nline 2\n    return x\n{\nline 0\n", 3, "--- a\n+++ b\n@@ -2,12 +2,13 @@\n line 2\n line 0\n line 0\n-\n line 0\n line 2\n     return x\n line 2\n }\n+}\n line 2\n     return x\n+{\n line 0\n"),
    ("line 2\nline 5\nline 5\nline 3\n{\nline 4\n    return x\n{\n{\nline 1\n}\n{\nline 2\n\n    return x\nline 3\nline 2\nline 7\nline 6\nline 4\n{\n    return x\n", "line 2\nline 3\nline 5\nline 5\nline 3\n{\n    return x\n{\n{\nline 1\n}\nline 5\nline 2\n\n    return x\nline 3\nline 2\nline 7\nline 6\nline 4\n{\n    return x\n\n", 3, "--- a\n+++ b\n@@ -1,15 +1,15 @@\n line 2\n+line 3\n line 5\n line 5\n line 3\n {\n-line 4\n     return x\n {\n {\n line 1\n }\n-{\n+line 5\n line 2\n \n     return x\n@@ -20,3 +20,4 @@\n line 4\n {\n     return x\n+\n"),
    ("line 3\n    return x\n\nline 6\n    return x\n\nline 2\nline 4\nline 2\nline 3\n}\n}\nline 4\n{\nline 6\n{\nline 6\nline 5\nline 3\nline 2\n", "line 3\nline 1\n    return x\nline 0\nline 6\n\nline 2\nline 4\nline 2\nline 3\n}\n}\n{\n{\n}\nline 6\n{\nline 4\nline 5\nline 3\nline 2\n", 3, "--- a\n+++ b\n@@ -1,8 +1,8 @@\n line 3\n+line 1\n     return x\n-\n+line 0\n line 6\n-    return x\n \n line 2\n line 4\n@@ -10,11 +10,12 @@\n line 3\n }\n }\n-line 4\n {\n+{\n+}\n line 6\n {\n-line 6\n+line 4\n line 5\n line 3\n line 2\n"),
    ("line 2\n    return x\nline 0\n\nline 2\nline 1\n\nline 3\nline 2\n}\nline 2\nline 0\n}\n    return x\nline 0\nline 1\n}\n\nline 3\nline 0\nline 3\nline 1\nline 1\n    return x\nline 1\nline 2\nline 2\n", "    return x\nline 0\n\nline 2\nline 1\n\nline 2\n}\nline 2\nline 0\n}\n    return x\n    return x\nline 0\nline 1\n}\n\nline 3\n{\nline 0\nline 3\nline 1\n    return x\nline 1\nline 2\nline 2\n", 3, "--- a\n+++ b\n@@ -1,26 +1,25 @@\n-line 2\n     return x\n line 0\n \n line 2\n line 1\n \n-line 3\n line 2\n }\n line 2\n line 0\n }\n     return x\n+    return x\n line 0\n line 1\n }\n \n line 3\n+{\n line 0\n line 3\n line 1\n-line 1\n     return x\n line 1\n line 2\n"),
    ("", "line 1\n", 3, "--- a\n+++ b\n@@ -0,0 +1 @@\n+line 1\n"),
    ("line 0\n{\nline 1\n\n    return x\n}\nline 1\n{\nline 1\n    return x\n{\n{\n}\nline 1\n}\n}\nline 1\nline 0\nline 0\n    return x\n}\n", "line 0\nline 0\nline 1\n\n    return x\n}\n{\nline 1\n    return x\nline 0\n{\n{\n}\nline 1\n    return x\n}\n}\nline 1\nline 0\nline 0\n}\n", 3, "--- a\n+++ b\n@@ -1,21 +1,21 @@\n line 0\n-{\n+line 0\n line 1\n \n     return x\n }\n-line 1\n {\n line 1\n     return x\n+line 0\n {\n {\n }\n line 1\n+    return x\n }\n }\n line 1\n line 0\n line 0\n-    return x\n }\n"),
    ("\nline 1\n    return x\nline 0\n\n    return x\n    return x\n    return x\n}\nline 0\nline 0\n{\n}\n    return x\nline 0\nline 0\n    return x", "line 1\n    return x\nline 0\n\n    return x\n    return x\n    return x\n}\nline 0\nline 0\n{\nline 0\n}\n    return x\nline 0\n    return x\n", 3, "--- a\n+++ b\n@@ -1,4 +1,3 @@\n-\n line 1\n     return x\n line 0\n@@ -10,8 +9,8 @@\n line 0\n line 0\n {\n+line 0\n }\n     return x\n line 0\n-line 0\n-    return x\n\\ No newline at end of file\n+    return x\n"),
    ("line 4\nline 6\n    return x\n    return x\n\n{\n    return x\nline 7\nline 2\nline 3\nline 4\nline 3\nline 0\n}\n    return x\n\nline 0\n    return x\nline 5\nline 0\nline 0\n}\nline 7\n\n\nline 2\nline 0\n\nline 1\n", "line 4\nline 6\n    return x\n\n{\n    return x\nline 7\nline 6\nline 2\nline 3\nline 4\nline 3\nline 0\n}\n    return x\n\nline 0\n    return x\nline 5\nline 0\nline 0\n}\nline 7\n\n\nline 2\nline 0\n\nline 1", 3, "--- a\n+++ b\n@@ -1,11 +1,11 @@\n line 4\n line 6\n     return x\n-    return x\n \n {\n     return x\n line 7\n+line 6\n line 2\n line 3\n line 4\n@@ -26,4 +26,4 @@\n line 2\n line 0\n \n-line 1\n+line 1\n\\ No newline at end of file\n"),
    ("}\nline 0\n}\nline 0\n\n{\n}\n}\n}\nline 2\nline 2\nline 1\n{\n{\nline 2\nline 1\nline 2\n\nline 1\n{\n{\nline 2\n\nline 2\n    return x\nline 0\nline 0\n\n}\n}\nline 0\nline 0\n}\nline 1\n}\nline 2\nline 1", "}\nline 0\n}\nline 0\n\n{\n}\n}\n}\nline 2\nline 2\nline 1\n{\n{\nline 2\nline 1\nline 2\n\nline 1\n{\n{\nline 2\n\nline 1\n    return x\nline 0\nline 0\n\n}\nline 0\nline 0\n}\nline 1\nline 0\n}\nline 2\nline 2\nline 1\n", 3, "--- a\n+++ b\n@@ -21,17 +21,18 @@\n {\n line 2\n \n-line 2\n+line 1\n     return x\n line 0\n line 0\n \n }\n-}\n line 0\n line 0\n }\n line 1\n+line 0\n }\n line 2\n-line 1\n\\ No newline at end of file\n+line 2\n+line 1\n"),
    ("line 0\nline 0\n{\n}\nline 1\nline 2\nline 2\n}\nline 1\n{\nline 2\nline 1\n{\n{\n    return x\nline 2\n", "line 0\nline 0\nline 0\nline 0\nline 1\nline 2\nline 2\nline 0\nline 1\n}\nline 1\n}\n{\nline 2\nline 1\n{\n{\n    return x\n{\nline 2\n", 3, "--- a\n+++ b\n@@ -1,16 +1,20 @@\n line 0\n line 0\n-{\n-}\n+line 0\n+line 0\n line 1\n line 2\n line 2\n+line 0\n+line 1\n }\n line 1\n+}\n {\n line 2\n line 1\n {\n {\n     return x\n+{\n line 2\n"),
    ("\nline 0\n\nline 1\n    return x\nline 1\n    return x\nline 0\n\n{\n}\n{\n    return x\nline 1\nline 1\nline 1\nline 1\n}\nline 0\n", "\nline 0\n\nline 1\n    return x\nline 1\n    return x\n    return x\n\n{\n}\n}\n{\n    return x\nline 1\nline 1\nline 1\nline 1\n}\nline 0\n", 3, "--- a\n+++ b\n@@ -5,10 +5,11 @@\n     return x\n line 1\n     return x\n-line 0\n+    return x\n \n {\n }\n+}\n {\n     return x\n line 1\n"),
    ("line 0\n}\nline 1\nline 1\n}\n\n\nline 1\nline 1\nline 0\n    return x\nline 1\n}\n\n\nline 0\n\n\n    return x\n{\n}\n    return x\n{\n\n", "line 0\n}\nline 1\nline 1\n}\n\n\nline 1\nline 1\nline 0\n    return x\nline 1\n}\n\n\nline 0\n\n\n    return x\n{\n}\n    return x\n{\n", 3, "--- a\n+++ b\n@@ -21,4 +21,3 @@\n }\n     return x\n {\n-\n"),
    ("line 2\nline 0\nline 0\n}\n\nline 2\n{\n    return x\nline 2\n\n}\n}\nline 0\n\n}\nline 1\nline 2\nline 0\n{\n\nline 0\n}\n    return x\n}\n{\n{\n{\n{\n{\nline 1\nline 2\n\nline 0\n{\nline 2\n}\nline 2\n", "line 2\nline 0\nline 0\n}\n\nline 2\n{\n    return x\nline 2\n\n}\n}\nline 0\n\n}\nline 1\nline 2\nline 0\n{\n}\n\nline 0\n}\n    return x\n}\n{\n{\n{\n{\n{\nline 1\nline 2\n\nline 0\n{\nline 2\n}\nline 2\n", 3, "--- a\n+++ b\n@@ -17,6 +17,7 @@\n line 2\n line 0\n {\n+}\n \n line 0\n }\n"),
    ("    return x\nline 2\nline 3\n}\n}\nline 2\nline 4\n}\n    return x\nline 0\nline 4\nline 4\nline 3\n}\n\n{\n{\n{\n", "    return x\nline 2\nline 3\n}\n}\nline 1\nline 2\n}\n    return x\nline 4\nline 4\nline 3\n}\n\n{\n{\n{\n", 3, "--- a\n+++ b\n@@ -3,11 +3,10 @@\n line 3\n }\n }\n+line 1\n line 2\n-line 4\n }\n     return x\n-line 0\n line 4\n line 4\n line 3\n"),
    ("line 0\nline 0\nline 1\n\n}\n    return x\n    return x\nline 0\n\n", "    return x\nline 0\nline 0\n}\n}\n    return x\nline 0\n    return x\n\n", 3, "--- a\n+++ b\n@@ -1,9 +1,9 @@\n+    return x\n line 0\n line 0\n-line 1\n-\n }\n-    return x\n+}\n     return x\n line 0\n+    return x\n \n"),
    ("line 7\nline 2\nline 7\n{\n\n\n}\n", "line 7\nline 2\nline 7\n\nline 3\nline 7\n\n    return x\n", 3, "--- a\n+++ b\n@@ -1,7 +1,8 @@\n line 7\n line 2\n line 7\n-{\n \n+line 3\n+line 7\n \n-}\n+    return x\n"),
    ("line 7\n{\nline 3\nline 4\nline 7\nline 1\n    return x\nline 4\nline 3\nline 4\nline 5\nline 5\n\nline 1\nline 2\nline 2\nline 3\nline 6\n    return x\nline 2\n    return x\nline 3\nline 1\nline 6\nline 6\nline 5\n\nline 7\nline 6\nline 0\nline 3\nline 6\nline 6", "line 7\n{\nline 3\nline 4\nline 7\nline 1\n    return x\nline 4\nline 3\nline 4\nline 5\nline 5\n\nline 1\nline 2\nline 2\nline 3\nline 6\n    return x\nline 2\n    return x\nline 3\nline 1\nline 6\nline 6\nline 5\n\nline 7\nline 6\nline 0\nline 3\nline 6\nline 6\n", 3, "--- a\n+++ b\n@@ -30,4 +30,4 @@\n line 0\n line 3\n line 6\n-line 6\n\\ No newline at end of file\n+line 6\n"),
    ("line 0\n\nline 4\n}\n}\n    return x\n    return x\nline 3\n{\nline 3\nline 4\n}\n{\nline 0\n}\n\n}\nline 2\n{\nline 2\n    return x\nline 0\n}\nline 0\nline 1\n}\nline 2\n{\nline 2\nline 0\n", "line 0\n\nline 4\n}\n}\n    return x\nline 3\n{\nline 3\nline 4\n}\n}\n{\nline 0\n}\n\n}\nline 2\n{\nline 2\n    return x\nline 0\n}\nline 0\nline 1\n}\nline 1\n{\nline 2\nline 0\n", 3, "--- a\n+++ b\n@@ -4,12 +4,12 @@\n }\n }\n     return x\n-    return x\n line 3\n {\n line 3\n line 4\n }\n+}\n {\n line 0\n }\n@@ -24,7 +24,7 @@\n line 0\n line 1\n }\n-line 2\n+line 1\n {\n line 2\n line 0\n"),
    ("line 1\n    return x\nline 0\n    return x\nline 0\nline 0\nline 1\nline 1\nline 0\n{\nline 1\nline 1\nline 1\n}\n    return x\nline 0\n{\nline 1\n}\n    return x\n\n\n", "line 1\n    return x\nline 0\n    return x\nline 0\n\nline 0\nline 1\nline 1\nline 0\n{\nline 1\nline 1\nline 1\n}\n    return x\nline 0\n{\nline 1\n}\n    return x\n\n\nline 0\n", 3, "--- a\n+++ b\n@@ -3,6 +3,7 @@\n line 0\n     return x\n line 0\n+\n line 0\n line 1\n line 1\n@@ -20,3 +21,4 @@\n     return x\n \n \n+line 0\n"),
    ("{\n{\nline 3\nline 1\nline 3\nline 1\n\nline 1\nline 0\n}\n{\n}\nline 1\n}\nline 0\n{\n    return x\nline 1\n{\n}\n    return x\nline 2\n{\nline 2\n\n    return x\n    return x\n{\n\n}\nline 3\nline 1\n\n    return x\nline 3\n    return x\n", "{\n{\nline 3\nline 1\nline 3\nline 1\n\nline 1\nline 0\n}\n{\n}\nline 1\n}\nline 0\n{\nline 1\n}\n    return x\nline 2\n{\nline 2\n\n    return x\n    return x\n{\n}\nline 3\nline 2\n    return x\nline 3\n    return x\nline 3\n", 3, "--- a\n+++ b\n@@ -14,9 +14,7 @@\n }\n line 0\n {\n-    return x\n line 1\n-{\n }\n     return x\n line 2\n@@ -26,11 +24,10 @@\n     return x\n     return x\n {\n-\n }\n line 3\n-line 1\n-\n+line 2\n     return x\n line 3\n     return x\n+line 3\n"),
    ("    return x\n\n\nline 0\nline 1\nline 4\nline 3\nline 6\nline 3\nline 4\n    return x\n{\nline 5\n\n}\n}\nline 5\nline 6\n}\nline 5\nline 5\n\nline 4\nline 4\nline 4\nline 3\nline 1\nline 3\nline 5\nline 1\n", "    return x\n\n\nline 1\nline 4\nline 2\nline 6\nline 4\nline 4\n{\nline 5\n\n}\nline 5\nline 6\n}\nline 5\nline 4\nline 4\nline 4\nline 3\nline 1\nline 3\nline 5\nline 1\n", 3, "--- a\n+++ b\n@@ -1,25 +1,20 @@\n     return x\n \n \n-line 0\n line 1\n line 4\n-line 3\n+line 2\n line 6\n-line 3\n line 4\n-    return x\n+line 4\n {\n line 5\n \n }\n-}\n line 5\n line 6\n }\n line 5\n-line 5\n-\n line 4\n line 4\n line 4\n"),
    ("\n    return x\nline 1\n    return x\n}\nline 0\nline 0\n{\n\n}\n}\n}\n\nline 1\nline 0\n\n}\nline 0\nline 0\n}\n}\nline 0\n{\n    return x\n    return x\nline 0\nline 1\nline 1\n{\n\nline 0\nline 1\nline 0\n{\n}\n", "\n    return x\nline 1\n}\nline 0\nline 0\n{\n\n}\n}\n}\n\nline 1\nline 0\n\n}\nline 0\nline 0\n}\n}\nline 0\n{\n    return x\n}\n    return x\nline 0\n\nline 1\n{\n\nline 0\nline 1\nline 0\n{\n}\n", 3, "--- a\n+++ b\n@@ -1,7 +1,6 @@\n \n     return x\n line 1\n-    return x\n }\n line 0\n line 0\n@@ -22,9 +21,10 @@\n line 0\n {\n     return x\n+}\n     return x\n line 0\n-line 1\n+\n line 1\n {\n \n"),
    ("{\nline 3\nline 4\n{\nline 1\nline 2\nline 3\nline 2\n\nline 1\nline 2\nline 0\nline 6\n", "{\nline 3\nline 4\nline 2\nline 3\nline 4\nline 2\n\nline 1\n{\nline 7\nline 0\nline 6", 3, "--- a\n+++ b\n@@ -1,13 +1,13 @@\n {\n line 3\n line 4\n-{\n-line 1\n line 2\n line 3\n+line 4\n line 2\n \n line 1\n-line 2\n+{\n+line 7\n line 0\n-line 6\n+line 6\n\\ No newline at end of file\n"),
    ("line 1\nline 0\nline 2\nline 4\n}\n    return x\n}\nline 4\nline 7\n", "line 1\nline 0\nline 2\nline 4\n    return x\n}\n    return x\n}\nline 4\nline 7\n", 3, "--- a\n+++ b\n@@ -2,6 +2,7 @@\n line 0\n line 2\n line 4\n+    return x\n }\n     return x\n }\n"),
    ("}\nline 1\n    return x\nline 0\n\nline 5\n    return x\nline 4\nline 0\nline 1\nline 3\n    return x\n    return x\nline 0\nline 4\n    return x\nline 0\nline 2\n}\n{\n}\nline 4\nline 2\n    return x\n\n}\nline 1\n}\nline 5\n\nline 5\n", "}\nline 1\n    return x\nline 0\n\n    return x\nline 4\nline 0\nline 1\nline 5\nline 3\n    return x\n    return x\nline 0\nline 4\n    return x\nline 0\nline 2\n}\n{\nline 4\nline 2\n    return x\n{\n\n}\nline 1\n}\nline 5\n\nline 4\nline 5\n", 3, "--- a\n+++ b\n@@ -3,11 +3,11 @@\n     return x\n line 0\n \n-line 5\n     return x\n line 4\n line 0\n line 1\n+line 5\n line 3\n     return x\n     return x\n@@ -18,14 +18,15 @@\n line 2\n }\n {\n-}\n line 4\n line 2\n     return x\n+{\n \n }\n line 1\n }\n line 5\n \n+line 4\n line 5\n"),
    ("line 0\n{\n\nline 7\nline 6\nline 0\nline 3\n\nline 5\n}\nline 7\n{\nline 7\nline 0\nline 3\nline 4\n\nline 2\nline 4\nline 7\n    return x\nline 7\nline 1\nline 0\n{\n}\nline 3\n    return x\nline 2\nline 4\n\nline 0\n", "line 0\n{\n\nline 7\nline 6\nline 0\nline 3\n{\nline 1\n\nline 6\nline 5\n}\nline 7\n{\nline 7\nline 0\nline 7\nline 3\nline 6\nline 4\nline 7\nline 2\nline 4\nline 7\n    return x\nline 7\nline 1\nline 0\n{\n}\nline 3\n    return x\nline 4\n\nline 0\n", 3, "--- a\n+++ b\n@@ -5,16 +5,21 @@\n line 6\n line 0\n line 3\n+{\n+line 1\n \n+line 6\n line 5\n }\n line 7\n {\n line 7\n line 0\n+line 7\n line 3\n+line 6\n line 4\n-\n+line 7\n line 2\n line 4\n line 7\n@@ -26,7 +31,6 @@\n }\n line 3\n     return x\n-line 2\n line 4\n \n line 0\n"),
    ("    return x\nline 4\nline 0\nline 4\nline 4\n{\nline 2\n{\n    return x\n{\n\n\n    return x\n    return x\n}\n{\n\nline 3\nline 3\n}\nline 3\n", "    return x\nline 4\nline 0\n{\nline 4\n{\nline 2\n{\n    return x\n{\n\n\n}\n    return x\n    return x\nline 2\nline 2\nline 3\nline 3\n}\nline 3\n", 3, "--- a\n+++ b\n@@ -1,7 +1,7 @@\n     return x\n line 4\n line 0\n-line 4\n+{\n line 4\n {\n line 2\n@@ -10,11 +10,11 @@\n {\n \n \n+}\n     return x\n     return x\n-}\n-{\n-\n+line 2\n+line 2\n line 3\n line 3\n }\n"),
    ("line 6\n    return x\nline 2\nline 1\n\nline 4\nline 5\n{\nline 6\n", "line 6\n    return x\nline 2\nline 1\n\nline 4\nline 5\n{\n    return x\n", 3, "--- a\n+++ b\n@@ -6,4 +6,4 @@\n line 4\n line 5\n {\n-line 6\n+    return x\n"),
    ("}\nline 0\n{\nline 1\nline 3\n    return x\n    return x\nline 4\nline 3\nline 1\nline 6\nline 1\n    return x\nline 1\n\nline 2\nline 4\nline 0\nline 0\nline 5\nline 0\nline 4\nline 5\nline 5\nline 6\nline 2\nline 3\n}\nline 6\n{\n    return x\n", "}\nline 0\nline 1\nline 3\n    return x\n    return x\nline 4\nline 3\nline 1\nline 6\nline 1\n    return x\n{\nline 1\n\nline 2\nline 4\nline 0\nline 0\nline 5\nline 0\nline 4\nline 5\nline 5\nline 6\nline 2\nline 3\n}\nline 6\n{\n    return x\n", 3, "--- a\n+++ b\n@@ -1,6 +1,5 @@\n }\n line 0\n-{\n line 1\n line 3\n     return x\n@@ -11,6 +10,7 @@\n line 6\n line 1\n     return x\n+{\n line 1\n \n line 2\n"),
    ("line 3\n}\nline 4\n}\nline 4\nline 0\n}\nline 4\n{\n", "line 3\n}\nline 4\n}\nline 4\n}\nline 4\n{\n", 3, "--- a\n+++ b\n@@ -3,7 +3,6 @@\n line 4\n }\n line 4\n-line 0\n }\n line 4\n {\n"),
    ("{\n    return x\nline 1\nline 3\n{\n}\n\n\nline 0\n{\n\nline 0", "{\n    return x\nline 1\nline 3\n{\n}\n\n\nline 0\n{\n\nline 0\n", 3, "--- a\n+++ b\n@@ -9,4 +9,4 @@\n line 0\n {\n \n-line 0\n\\ No newline at end of file\n+line 0\n"),
    ("line 3\n}\nline 5\nline 3\n{\nline 3\n}\nline 4\n{\n    return x\n{\n{\nline 2\n{\nline 1\n{\n{\nline 0\n", "line 3\n}\n}\nline 5\n{\nline 3\n}\nline 4\n{\n{\n{\nline 2\n{\n{\n{\nline 0\n", 3, "--- a\n+++ b\n@@ -1,18 +1,16 @@\n line 3\n }\n+}\n line 5\n-line 3\n {\n line 3\n }\n line 4\n {\n-    return x\n {\n {\n line 2\n {\n-line 1\n {\n {\n line 0\n"),
    ("{\n{\nline 4\nline 2\nline 4\n}\nline 4\nline 5\nline 1\n}\nline 1\nline 2\nline 3\n\n{\nline 5\nline 1\n\nline 0\nline 4\n{\nline 1\n}\n", "{\n{\nline 4\nline 2\nline 4\n}\nline 4\nline 1\n}\nline 1\nline 2\nline 3\n\n{\nline 5\nline 1\n\nline 0\nline 4\nline 5\n{\nline 4\nline 1\n}\n", 3, "--- a\n+++ b\n@@ -5,7 +5,6 @@\n line 4\n }\n line 4\n-line 5\n line 1\n }\n line 1\n@@ -18,6 +17,8 @@\n \n line 0\n line 4\n+line 5\n {\n+line 4\n line 1\n }\n"),
    ("    return x\nline 4\n{\nline 6\nline 1\nline 2\nline 0\nline 0\nline 4\nline 7\nline 1\nline 1\nline 3\n\nline 2\nline 6\nline 7\nline 5\n{\n    return x\n    return x\n\nline 6\n}\n    return x\n    return x\nline 2\nline 6\n{", "    return x\nline 4\n{\nline 6\nline 1\nline 2\nline 0\nline 0\nline 4\nline 7\nline 1\nline 1\nline 3\n}\nline 2\nline 6\nline 7\nline 5\n{\n    return x\n    return x\n\nline 6\n}\n    return x\n    return x\nline 2\nline 6\n{\n", 3, "--- a\n+++ b\n@@ -11,7 +11,7 @@\n line 1\n line 1\n line 3\n-\n+}\n line 2\n line 6\n line 7\n@@ -26,4 +26,4 @@\n     return x\n line 2\n line 6\n-{\n\\ No newline at end of file\n+{\n"),
    ("line 3\n\n\nline 3\nline 5\nline 1\n    return x\nline 5\n}\n    return x\nline 5\nline 0\nline 6\nline 4\nline 3\nline 1\n\nline 1\n    return x\nline 3\n    return x\n    return x\n{\n", "line 3\n\n\nline 3\nline 5\nline 1\n    return x\nline 5\n}\n    return x\nline 5\nline 0\nline 6\nline 4\nline 3\nline 1\n\nline 1\n    return x\nline 3\n    return x\n    return x\n{\n", 3, ""),
    ("line 1\nline 0\n    return x\n    return x\n}\nline 1\n}\nline 1\n    return x\n    return x\nline 1\nline 2\n    return x\nline 1\n    return x\n}\nline 0\nline 2\n    return x\nline 1\nline 1\n}\nline 2\n    return x\nline 1\nline 0\n{\n    return x\nline 0\nline 1\nline 0\nline 2\n    return x\n    return x\nline 1\n}\n", "line 1\nline 0\n    return x\n    return x\n\n}\nline 1\n}\nline 1\n    return x\n    return x\nline 1\nline 2\n    return x\nline 1\n    return x\n}\nline 2\n    return x\nline 1\nline 1\n}\nline 2\n}\n    return x\nline 1\nline 0\n{\n}\nline 0\nline 1\nline 0\nline 2\n    return x\n    return x\nline 1\n}\n", 3, "--- a\n+++ b\n@@ -2,6 +2,7 @@\n line 0\n     return x\n     return x\n+\n }\n line 1\n }\n@@ -14,18 +15,18 @@\n line 1\n     return x\n }\n-line 0\n line 2\n     return x\n line 1\n line 1\n }\n line 2\n+}\n     return x\n line 1\n line 0\n {\n-    return x\n+}\n line 0\n line 1\n line 0\n"),
    ("line 4\n\n    return x\nline 0\nline 0\n\nline 6\nline 6\n    return x\nline 1\n\n\nline 1\nline 1\nline 5\n{\nline 2\nline 1\nline 2\nline 4\n{\n    return x\n{\n}\nline 5\nline 6\n{\n}\nline 4\n\n}\n{\nline 6\n", "line 4\n\n    return x\nline 0\nline 0\n\nline 6\n    return x\nline 6\n    return x\nline 1\n\n\nline 1\nline 1\nline 5\n{\nline 2\nline 1\nline 2\nline 4\n{\n    return x\n{\n}\nline 5\nline 6\n{\n}\nline 4\n\n}\n{\nline 6\n", 3, "--- a\n+++ b\n@@ -5,6 +5,7 @@\n line 0\n \n line 6\n+    return x\n line 6\n     return x\n line 1\n"),
    ("line 6\n\nline 3\nline 6\nline 5\n\nline 6\nline 6\nline 1\nline 5\nline 6\nline 5\n    return x\n", "line 6\nline 5\n\nline 6\nline 6\nline 1\nline 1\nline 5\nline 6\nline 5\n    return x\n", 3, "--- a\n+++ b\n@@ -1,12 +1,10 @@\n line 6\n-\n-line 3\n-line 6\n line 5\n \n line 6\n line 6\n line 1\n+line 1\n line 5\n line 6\n line 5\n"),
    ("line 0\n}\n}\n}\nline 2\n{\nline 0\n\nline 2\n    return x\n{\n    return x\n\n    return x\n{\nline 0\nline 2\n}\nline 2\nline 2\nline 0\n}\n}\nline 1\nline 1\n{\n\nline 1\n    return x\nline 0\nline 2\n    return x\n}\nline 2\nline 0", "line 0\n}\n}\n}\nline 2\n{\nline 0\n\nline 2\n    return x\n{\n    return x\n\n    return x\n{\nline 0\nline 2\nline 0\n}\nline 2\nline 0\n}\n}\nline 1\nline 1\n{\n\n    return x\nline 1\n    return x\nline 0\nline 2\n    return x\n}\nline 2\nline 0\nline 0\n", 3, "--- a\n+++ b\n@@ -15,9 +15,9 @@\n {\n line 0\n line 2\n+line 0\n }\n line 2\n-line 2\n line 0\n }\n }\n@@ -25,6 +25,7 @@\n line 1\n {\n \n+    return x\n line 1\n     return x\n line 0\n@@ -32,4 +33,5 @@\n     return x\n }\n line 2\n-line 0\n\\ No newline at end of file\n+line 0\n+line 0\n"),
}) {
    Eq($"unified diff {Regex.Escape(a)} -> {Regex.Escape(b)} context {context}", expected, LineDiff.UnifiedDiff(a, b, "a", "b", context));
    Check($"diff rebuild {Regex.Escape(a)} -> {Regex.Escape(b)}", OpsRebuild(a, b, LineDiff.DiffLines(a, b)));
}
Throws<ArgumentException>("diff too large", () => LineDiff.DiffLines(new string('\n', 500_001), new string('\n', 500_000)));
Throws<ArgumentOutOfRangeException>("diff negative context", () => LineDiff.UnifiedDiff("a\n", "b\n", "a", "b", -1));
{
    var bigA = new StringBuilder(); var bigB = new StringBuilder();
    for (int i = 0; i < 100_000; i++) { bigA.Append("line ").Append(i).Append('\n'); bigB.Append(i % 5_000 == 2_500 ? "edited " : "line ").Append(i).Append('\n'); }
    var watch = System.Diagnostics.Stopwatch.StartNew();
    var bigOps = LineDiff.DiffLines(bigA.ToString(), bigB.ToString());
    watch.Stop();
    Check($"diff 100,000 lines with 20 edits under 10 s ({watch.ElapsedMilliseconds} ms)", watch.Elapsed.TotalSeconds < 10);
    Check("diff 100,000 lines: 20 deletions and 20 insertions", bigOps.Count(o => o.Op == "-") == 20 && bigOps.Count(o => o.Op == "+") == 20 && bigOps.Count == 100_020);
    Check("diff 100,000 lines rebuild", OpsRebuild(bigA.ToString(), bigB.ToString(), bigOps));
    var noA = new StringBuilder(); var noB = new StringBuilder();
    for (int i = 0; i < 3_000; i++) { noA.Append("a").Append(i).Append('\n'); noB.Append("b").Append(i).Append('\n'); }
    var noOps = LineDiff.DiffLines(noA.ToString(), noB.ToString());
    Check("diff 3,000 lines with no common line", noOps.Count(o => o.Op == "-") == 3_000 && noOps.Count(o => o.Op == "+") == 3_000 && noOps.Count == 6_000);
}

// 43. Password policy (wave 7 vectors)
foreach (var (password, options, ok, failures) in new (string, PasswordOptions, bool, string)[] {
    ("correct horse battery staple", new PasswordOptions(), true, ""),
    ("short", new PasswordOptions(), false, "too-short"),
    ("Tr0ub4dor&3", new PasswordOptions { MinLength = 8 }, true, ""),
    ("password", new PasswordOptions { MinLength = 8, Blocklist = new[] { "Password", "123456" } }, false, "blocklisted"),
    ("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", new PasswordOptions { MaxLength = 64 }, false, "too-long,repetitive"),
    ("aaaa-unique-phrase-x", new PasswordOptions(), false, "repetitive"),
    ("my-1234-long-passphrase", new PasswordOptions(), false, "repetitive"),
    ("zyxw-backwards-phrase!", new PasswordOptions(), false, "repetitive"),
    ("alice-secret-passphrase", new PasswordOptions { Context = new[] { "alice", "example" } }, false, "contains-context"),
    ("tab\tinside-long-enough", new PasswordOptions(), false, "control-characters"),
    ("\u00FCn\u00EFc\u00F6d\u00E9-p\u00E4ssw\u00F6rd-long", new PasswordOptions(), true, ""),
    ("\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00", new PasswordOptions(), false, "repetitive"),
    ("ABCD-upper-sequence-x", new PasswordOptions(), false, "repetitive"),
}) {
    var r = PasswordPolicy.CheckPassword(password, options);
    Check($"password '{password}'", r.Ok == ok && string.Join(",", r.Failures) == failures);
}
Throws<ArgumentException>("password minLength 0", () => PasswordPolicy.CheckPassword("x", new PasswordOptions { MinLength = 0 }));
Throws<ArgumentException>("password maxLength < minLength", () => PasswordPolicy.CheckPassword("x", new PasswordOptions { MinLength = 10, MaxLength = 9 }));

// 44. Text sanitize (wave 7 vectors)
foreach (var (text, allowNewlines, maxLength, expected) in new (string, bool, int?, string)[] {
    ("plain text", true, null, "plain text"),
    ("line1\r\nline2\rline3", true, null, "line1\nline2\nline3"),
    ("zero\u200Bwidth\uFEFFbom", true, null, "zerowidthbom"),
    ("tab\there\u0000nul\u007Fdel\u0085nel", true, null, "tab\therenuldelnel"),
    ("if (accessLevel != \"user\u202E \u2066// Check if admin\u2069 \u2066\") {", true, null, "if (accessLevel != \"user // Check if admin \") {"),
    ("emoji \uD83D\uDC4D\uD83C\uDFFD and ZWJ \uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67 family", true, null, "emoji \uD83D\uDC4D\uD83C\uDFFD and ZWJ \uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67 family"),
    ("caf\u00E9 e\u0301", true, null, "caf\u00E9 e\u0301"),
    ("a\nb\r\nc", false, null, "a b c"),
    ("abcdef", true, 3, "abc"),
    ("\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00", true, 2, "\uD83D\uDE00\uD83D\uDE00"),
})
    Eq($"sanitize {Regex.Escape(text)}", expected, TextSanitize.SanitizeText(text, allowNewlines, maxLength));
foreach (var (text, expected) in new[] {
    ("plain text", ""),
    ("line1\r\nline2\rline3", ""),
    ("zero\u200Bwidth\uFEFFbom", ""),
    ("tab\there\u0000nul\u007Fdel\u0085nel", ""),
    ("if (accessLevel != \"user\u202E \u2066// Check if admin\u2069 \u2066\") {", "24:202E 26:2066 44:2069 46:2066"),
    ("emoji \uD83D\uDC4D\uD83C\uDFFD and ZWJ \uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67 family", ""),
    ("caf\u00E9 e\u0301", ""),
})
    Eq($"find bidi {Regex.Escape(text)}", expected, string.Join(" ", TextSanitize.FindBidiControls(text).Select(x => $"{x.Index}:{x.Hex}")));
foreach (var (text, expected) in new[] { ("  a   b\t\tc\n\nd  ", "a b c d"), ("", ""), (" \t\n ", ""), ("one", "one") })
    Eq($"normalize whitespace {Regex.Escape(text)}", expected, TextSanitize.NormalizeWhitespace(text));

// 45. Slugify (wave 8 vectors)
foreach (var (text, separator, maxLength, expected) in new (string, string, int, string)[] {
    ("Hello, World!", "-", 0, "hello-world"),
    ("Cr\u00E8me br\u00FBl\u00E9e & Caf\u00E9", "-", 0, "creme-brulee-cafe"),
    ("Stra\u00DFe in \u0141\u00F3d\u017A", "-", 0, "strasse-in-lodz"),
    ("don't stop", "-", 0, "dont-stop"),
    ("don\u2019t stop", "-", 0, "dont-stop"),
    ("  --Already--slugged--  ", "-", 0, "already-slugged"),
    ("\u65E5\u672C\u8A9E title 2026", "-", 0, "title-2026"),
    ("\u00C6r\u00F8sk\u00F8bing \u0152UVRE", "-", 0, "aeroskobing-oeuvre"),
    ("Cre\u0300me bru\u0302le\u0301e", "-", 0, "creme-brulee"),
    ("\u00C0\u00C1\u00C2\u00C3\u00C4\u00C5 \u00E0\u00E1\u00E2\u00E3\u00E4\u00E5 \u00C7\u00E7 \u00D1\u00F1", "-", 0, "aaaaaa-aaaaaa-cc-nn"),
    ("\u0132ssel \u0140 \u0138 \u017F \u0149", "-", 0, "ijssel-l-q-s-n"),
    ("C# and C++", "-", 0, "c-and-c"),
    ("100% pure", "-", 0, "100-pure"),
    ("", "-", 0, ""),
    ("---", "-", 0, ""),
    ("a_b.c-d", "-", 0, "a-b-c-d"),
    ("Emoji \uD83D\uDE00 test", "-", 0, "emoji-test"),
    ("\uFF26\uFF55\uFF4C\uFF4C width", "-", 0, "width"),
    ("\u01C5emal (outside the table)", "-", 0, "emal-outside-the-table"),
    ("\u00FF \u0178", "-", 0, "y-y"),
    ("MiXeD CaSe 42", "-", 0, "mixed-case-42"),
    ("Hello, World!", "_", 0, "hello_world"),
    ("Hello, World!", ".", 0, "hello.world"),
    ("Cr\u00E8me br\u00FBl\u00E9e & Caf\u00E9", "_", 0, "creme_brulee_cafe"),
    ("Cr\u00E8me br\u00FBl\u00E9e & Caf\u00E9", ".", 0, "creme.brulee.cafe"),
    ("Stra\u00DFe in \u0141\u00F3d\u017A", "_", 0, "strasse_in_lodz"),
    ("Stra\u00DFe in \u0141\u00F3d\u017A", ".", 0, "strasse.in.lodz"),
    ("don't stop", "_", 0, "dont_stop"),
    ("don't stop", ".", 0, "dont.stop"),
    ("The quick brown fox jumps", "-", 12, "the-quick"),
    ("The quick brown fox jumps", "-", 9, "the-quick"),
    ("The quick brown fox jumps", "-", 10, "the-quick"),
    ("Supercalifragilistic", "-", 5, "super"),
    ("ab cd", "-", 3, "ab"),
    ("ab cd", "-", 2, "ab"),
    ("ab cd", "-", 5, "ab-cd"),
    ("ab cd", "-", 100, "ab-cd"),
    ("a b", "-", 1, "a"),
})
    Eq($"slugify '{text}' '{separator}' {maxLength}", expected, Slugify.Slug(text, separator, maxLength));
foreach (var (text, separator, maxLength) in new (string, string, int)[] {
    ("x", "/", 0),
    ("x", "", 0),
    ("x", "--", 0),
    ("x", "-", -1),
})
    Throws<ArgumentException>($"slugify invalid '{separator}' {maxLength}", () => Slugify.Slug(text, separator, maxLength));
foreach (var (baseSlug, taken, expected) in new (string, string[], string)[] {
    ("post", Array.Empty<string>(), "post"),
    ("post", new[] { "post" }, "post-2"),
    ("post", new[] { "post", "post-2", "post-3" }, "post-4"),
    ("post", new[] { "post-2" }, "post"),
    ("a", new[] { "a", "a-2", "a-4" }, "a-3"),
})
    Eq($"unique slug {baseSlug} [{string.Join(",", taken)}]", expected, Slugify.UniqueSlug(baseSlug, new HashSet<string>(taken)));
Throws<ArgumentException>("unique slug empty base", () => Slugify.UniqueSlug("", new HashSet<string>()));
Eq("unique slug separator", "post_2", Slugify.UniqueSlug("post", new HashSet<string> { "post" }, "_"));

// 46. JSON Patch (wave 8 vectors: RFC 6901, RFC 6902, RFC 7396)
System.Text.Json.Nodes.JsonNode? J(string text) => System.Text.Json.Nodes.JsonNode.Parse(text);
foreach (var (doc, patch, expected) in new (string, string, string)[] {
    ("{\"foo\":\"bar\"}", "[{\"op\":\"add\",\"path\":\"/baz\",\"value\":\"qux\"}]", "{\"baz\":\"qux\",\"foo\":\"bar\"}"),
    ("{\"foo\":[\"bar\",\"baz\"]}", "[{\"op\":\"add\",\"path\":\"/foo/1\",\"value\":\"qux\"}]", "{\"foo\":[\"bar\",\"qux\",\"baz\"]}"),
    ("{\"baz\":\"qux\",\"foo\":\"bar\"}", "[{\"op\":\"remove\",\"path\":\"/baz\"}]", "{\"foo\":\"bar\"}"),
    ("{\"foo\":[\"bar\",\"qux\",\"baz\"]}", "[{\"op\":\"remove\",\"path\":\"/foo/1\"}]", "{\"foo\":[\"bar\",\"baz\"]}"),
    ("{\"baz\":\"qux\",\"foo\":\"bar\"}", "[{\"op\":\"replace\",\"path\":\"/baz\",\"value\":\"boo\"}]", "{\"baz\":\"boo\",\"foo\":\"bar\"}"),
    ("{\"foo\":{\"bar\":\"baz\",\"waldo\":\"fred\"},\"qux\":{\"corge\":\"grault\"}}", "[{\"from\":\"/foo/waldo\",\"op\":\"move\",\"path\":\"/qux/thud\"}]", "{\"foo\":{\"bar\":\"baz\"},\"qux\":{\"corge\":\"grault\",\"thud\":\"fred\"}}"),
    ("{\"foo\":[\"all\",\"grass\",\"cows\",\"eat\"]}", "[{\"from\":\"/foo/1\",\"op\":\"move\",\"path\":\"/foo/3\"}]", "{\"foo\":[\"all\",\"cows\",\"eat\",\"grass\"]}"),
    ("{\"baz\":\"qux\",\"foo\":[\"a\",2,\"c\"]}", "[{\"op\":\"test\",\"path\":\"/baz\",\"value\":\"qux\"},{\"op\":\"test\",\"path\":\"/foo/1\",\"value\":2}]", "{\"baz\":\"qux\",\"foo\":[\"a\",2,\"c\"]}"),
    ("{\"foo\":\"bar\"}", "[{\"op\":\"add\",\"path\":\"/child\",\"value\":{\"grandchild\":{}}}]", "{\"child\":{\"grandchild\":{}},\"foo\":\"bar\"}"),
    ("{\"foo\":\"bar\"}", "[{\"op\":\"add\",\"path\":\"/baz\",\"value\":\"qux\",\"xyz\":123}]", "{\"baz\":\"qux\",\"foo\":\"bar\"}"),
    ("{\"foo\":[\"bar\"]}", "[{\"op\":\"add\",\"path\":\"/foo/-\",\"value\":[\"abc\",\"def\"]}]", "{\"foo\":[\"bar\",[\"abc\",\"def\"]]}"),
    ("{\"/\":9,\"~1\":10}", "[{\"op\":\"test\",\"path\":\"/~01\",\"value\":10},{\"op\":\"replace\",\"path\":\"/~1\",\"value\":1}]", "{\"/\":1,\"~1\":10}"),
    ("{\"a\":1}", "[{\"op\":\"replace\",\"path\":\"\",\"value\":[1,2]}]", "[1,2]"),
    ("{\"a\":1}", "[{\"op\":\"add\",\"path\":\"\",\"value\":\"root\"}]", "\"root\""),
    ("{\"a\":{\"b\":1}}", "[{\"from\":\"/a\",\"op\":\"copy\",\"path\":\"/c\"},{\"op\":\"replace\",\"path\":\"/c/b\",\"value\":2}]", "{\"a\":{\"b\":1},\"c\":{\"b\":2}}"),
    ("{\"a\":[1,2]}", "[{\"from\":\"/a/0\",\"op\":\"move\",\"path\":\"/a/0\"}]", "{\"a\":[1,2]}"),
    ("{\"n\":1}", "[{\"op\":\"test\",\"path\":\"/n\",\"value\":1}]", "{\"n\":1}"),
    ("{\"a\":{\"b\":[1,{\"c\":null}]}}", "[{\"op\":\"test\",\"path\":\"/a/b/1/c\",\"value\":null},{\"op\":\"remove\",\"path\":\"/a/b/0\"}]", "{\"a\":{\"b\":[{\"c\":null}]}}"),
}) {
    var d = J(doc);
    Eq($"json patch {patch}", expected, JsonPatch.Canonical(JsonPatch.ApplyPatch(d, J(patch))));
    Eq($"json patch leaves input {patch}", doc, JsonPatch.Canonical(d));
}
foreach (var (doc, patch) in new (string, string)[] {
    ("{\"baz\":\"qux\"}", "[{\"op\":\"add\",\"path\":\"/baz/bat\",\"value\":\"qux\"}]"),
    ("{\"foo\":\"bar\"}", "[{\"op\":\"test\",\"path\":\"/baz\",\"value\":\"qux\"}]"),
    ("{\"foo\":[\"bar\"]}", "[{\"op\":\"add\",\"path\":\"/foo/2\",\"value\":1}]"),
    ("{\"foo\":[\"bar\"]}", "[{\"op\":\"add\",\"path\":\"/foo/01\",\"value\":1}]"),
    ("{\"foo\":[\"bar\"]}", "[{\"op\":\"remove\",\"path\":\"/foo/-\"}]"),
    ("{\"a\":1}", "[{\"op\":\"remove\",\"path\":\"/b\"}]"),
    ("{\"a\":1}", "[{\"op\":\"replace\",\"path\":\"/b\",\"value\":1}]"),
    ("{\"a\":{\"b\":1}}", "[{\"from\":\"/a\",\"op\":\"move\",\"path\":\"/a/b/c\"}]"),
    ("{\"a\":1}", "[{\"op\":\"frobnicate\",\"path\":\"/a\"}]"),
    ("{\"a\":1}", "[{\"op\":\"add\",\"path\":\"/b\"}]"),
    ("{\"a\":1}", "[{\"op\":\"add\",\"value\":1}]"),
    ("{\"a\":1}", "[{\"op\":\"add\",\"path\":\"a\",\"value\":1}]"),
    ("{\"a~b\":1}", "[{\"op\":\"remove\",\"path\":\"/a~b\"}]"),
    ("{\"a\":1}", "[{\"op\":\"remove\",\"path\":\"\"}]"),
    ("{\"a\":true}", "[{\"op\":\"test\",\"path\":\"/a\",\"value\":1}]"),
    ("{\"a\":1}", "[{\"op\":\"test\",\"path\":\"/a\",\"value\":\"1\"}]"),
    ("{\"a\":1}", "[{\"op\":\"add\",\"path\":\"/b\",\"value\":2},{\"op\":\"test\",\"path\":\"/b\",\"value\":3}]"),
    ("{\"a\":1}", "{\"op\":\"add\",\"path\":\"/b\",\"value\":2}"),
}) {
    var d = J(doc);
    Throws<JsonPatchException>($"json patch invalid {patch}", () => JsonPatch.ApplyPatch(d, J(patch)));
    Eq($"json patch invalid leaves input {patch}", doc, JsonPatch.Canonical(d));
}
foreach (var (doc, pointer, expected) in new (string, string, string)[] {
    ("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "", "{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}"),
    ("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/foo", "[\"bar\",\"baz\"]"),
    ("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/foo/0", "\"bar\""),
    ("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/", "0"),
    ("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/a~1b", "1"),
    ("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/c%d", "2"),
    ("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/e^f", "3"),
    ("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/g|h", "4"),
    ("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/i\\j", "5"),
    ("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/k\"l", "6"),
    ("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/ ", "7"),
    ("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/m~0n", "8"),
})
    Eq($"json pointer '{pointer}'", expected, JsonPatch.Canonical(JsonPatch.GetPointer(J(doc), pointer)));
foreach (var pointer in new[] {
    "/foo/2",
    "/foo/-",
    "/foo/01",
    "foo",
    "/nope",
    "/m~2n",
    "/foo/0/x",
})
    Throws<JsonPatchException>($"json pointer invalid '{pointer}'", () => JsonPatch.GetPointer(J("{\"foo\":[\"bar\",\"baz\"],\"m~n\":8}"), pointer));
foreach (var (target, patch, expected) in new (string, string, string)[] {
    ("{\"a\":\"b\"}", "{\"a\":\"c\"}", "{\"a\":\"c\"}"),
    ("{\"a\":\"b\"}", "{\"b\":\"c\"}", "{\"a\":\"b\",\"b\":\"c\"}"),
    ("{\"a\":\"b\"}", "{\"a\":null}", "{}"),
    ("{\"a\":\"b\",\"b\":\"c\"}", "{\"a\":null}", "{\"b\":\"c\"}"),
    ("{\"a\":[\"b\"]}", "{\"a\":\"c\"}", "{\"a\":\"c\"}"),
    ("{\"a\":\"c\"}", "{\"a\":[\"b\"]}", "{\"a\":[\"b\"]}"),
    ("{\"a\":{\"b\":\"c\"}}", "{\"a\":{\"b\":\"d\",\"c\":null}}", "{\"a\":{\"b\":\"d\"}}"),
    ("{\"a\":[{\"b\":\"c\"}]}", "{\"a\":[1]}", "{\"a\":[1]}"),
    ("[\"a\",\"b\"]", "[\"c\",\"d\"]", "[\"c\",\"d\"]"),
    ("{\"a\":\"b\"}", "[\"c\"]", "[\"c\"]"),
    ("{\"a\":\"foo\"}", "null", "null"),
    ("{\"a\":\"foo\"}", "\"bar\"", "\"bar\""),
    ("{\"e\":null}", "{\"a\":1}", "{\"a\":1,\"e\":null}"),
    ("[1,2]", "{\"a\":\"b\",\"c\":null}", "{\"a\":\"b\"}"),
    ("{}", "{\"a\":{\"bb\":{\"ccc\":null}}}", "{\"a\":{\"bb\":{}}}"),
}) {
    var t = J(target);
    Eq($"merge patch {target} {patch}", expected, JsonPatch.Canonical(JsonPatch.MergePatch(t, J(patch))));
    Eq($"merge patch leaves input {target}", target, JsonPatch.Canonical(t));
}
foreach (var (a, b, expected) in new (string, string, string)[] {
    ("{\"a\":1,\"b\":[1,2,3]}", "{\"a\":2,\"b\":[1],\"c\":true}", "[{\"op\":\"replace\",\"path\":\"/a\",\"value\":2},{\"op\":\"remove\",\"path\":\"/b/2\"},{\"op\":\"remove\",\"path\":\"/b/1\"},{\"op\":\"add\",\"path\":\"/c\",\"value\":true}]"),
    ("{\"x\":{\"y\":{\"z\":1}}}", "{\"x\":{\"y\":{\"w\":[null],\"z\":1}}}", "[{\"op\":\"add\",\"path\":\"/x/y/w\",\"value\":[null]}]"),
    ("[1,2]", "[1,2,3,4]", "[{\"op\":\"add\",\"path\":\"/2\",\"value\":3},{\"op\":\"add\",\"path\":\"/3\",\"value\":4}]"),
    ("{\"a/b\":1,\"m~n\":2}", "{\"a/b\":3}", "[{\"op\":\"replace\",\"path\":\"/a~1b\",\"value\":3},{\"op\":\"remove\",\"path\":\"/m~0n\"}]"),
    ("\"s\"", "{\"k\":\"s\"}", "[{\"op\":\"replace\",\"path\":\"\",\"value\":{\"k\":\"s\"}}]"),
    ("{\"k\":[1,{\"q\":1}]}", "{\"k\":[2,{\"q\":2}]}", "[{\"op\":\"replace\",\"path\":\"/k/0\",\"value\":2},{\"op\":\"replace\",\"path\":\"/k/1/q\",\"value\":2}]"),
    ("{\"same\":1}", "{\"same\":1}", "[]"),
    ("null", "false", "[{\"op\":\"replace\",\"path\":\"\",\"value\":false}]"),
    ("{\"Z\":3,\"a\":2,\"b\":1,\"\u00E9\":4}", "{}", "[{\"op\":\"remove\",\"path\":\"/Z\"},{\"op\":\"remove\",\"path\":\"/a\"},{\"op\":\"remove\",\"path\":\"/b\"},{\"op\":\"remove\",\"path\":\"/\u00E9\"}]"),
    ("[]", "[[]]", "[{\"op\":\"add\",\"path\":\"/0\",\"value\":[]}]"),
    ("{\"n\":[1,2,3]}", "{\"n\":[3,2,1]}", "[{\"op\":\"replace\",\"path\":\"/n/0\",\"value\":3},{\"op\":\"replace\",\"path\":\"/n/2\",\"value\":1}]"),
}) {
    var patch = JsonPatch.CreatePatch(J(a), J(b));
    Eq($"create patch {a} -> {b}", expected, JsonPatch.Canonical(patch));
    Check($"create patch round trip {a} -> {b}", JsonPatch.DeepEqual(JsonPatch.ApplyPatch(J(a), patch), J(b)));
}
foreach (var (text, expected) in new (string, string)[] {
    (" {\"a\" : [1, -2, 3.5e2, true, false, null, \"x\\n\\u00e9\\ud83d\\ude00\"]} ", "{\"a\":[1,-2,350,true,false,null,\"x\\n\u00E9\uD83D\uDE00\"]}"),
    ("\"\\u0001\\\"\\\\/\"", "\"\\u0001\\\"\\\\/\""),
    ("[]", "[]"),
    ("{}", "{}"),
    ("-0", "0"),
    ("1E+2", "100"),
})
    Eq($"canonical {text}", expected, JsonPatch.Canonical(J(text)));
Check("json equal 1 == 1.0", JsonPatch.DeepEqual(J("1"), J("1.0")) && !JsonPatch.DeepEqual(J("true"), J("1")) && JsonPatch.DeepEqual(J("{\"a\":1,\"b\":2}"), J("{\"b\":2,\"a\":1.0}")));
Eq("canonical non-integer and control", "[1.5,\"\\u001f\\b\"]", JsonPatch.Canonical(J("[1.5,\"\\u001F\\b\"]")));
Eq("canonical code point key order", "{\"～\":2,\"😀\":1}", JsonPatch.Canonical(J("{\"😀\":1,\"～\":2}")));

// 47-54. Wave 9 capabilities (caps10 vectors): SSE, text chunking, vector math, circuit breaker, business days,
// natural sort, file signatures and color conversion. Literals are generated from the shared vectors.json.
string W9Events(IEnumerable<SseEvent> evs) => string.Join("\u241E", evs.Select(e => e.Event + "\u241F" + e.Data + "\u241F" + e.Id));
void W9Near(string name, double expected, double actual, double tol = 1e-9) {
    bool ok = Math.Abs(expected - actual) <= tol;
    if (!ok) Console.Error.WriteLine($"  expected <{expected:R}> got <{actual:R}>");
    Check(name, ok);
}

// 47. Server-sent events
{ var p = new SseParser(); Eq("sse parse 0 data: YHOO\\ndata: +2\\ndata: 10\\n\\n", "message\u241FYHOO\n+2\n10\u241F", W9Events(p.Feed("data: YHOO\ndata: +2\ndata: 10\n\n"))); Eq("sse parse 0 retry", (long?)null, p.Retry); }
{ var p = new SseParser(); Eq("sse parse 1 : test stream\\n\\ndata: first event\\nid: ...", "message\u241Ffirst event\u241F1\u241Emessage\u241Fsecond event\u241F", W9Events(p.Feed(": test stream\n\ndata: first event\nid: 1\n\ndata:second event\nid\n\ndata:  third event\n"))); Eq("sse parse 1 retry", (long?)null, p.Retry); }
{ var p = new SseParser(); Eq("sse parse 2 data\\n\\ndata\\ndata\\n\\ndata:", "message\u241F\u241F\u241Emessage\u241F\n\u241F", W9Events(p.Feed("data\n\ndata\ndata\n\ndata:"))); Eq("sse parse 2 retry", (long?)null, p.Retry); }
{ var p = new SseParser(); Eq("sse parse 3 data:test\\n\\ndata: test\\n\\n", "message\u241Ftest\u241F\u241Emessage\u241Ftest\u241F", W9Events(p.Feed("data:test\n\ndata: test\n\n"))); Eq("sse parse 3 retry", (long?)null, p.Retry); }
{ var p = new SseParser(); Eq("sse parse 4 event: add\\ndata: 73857293\\n\\nevent: rem...", "add\u241F73857293\u241F\u241Eremove\u241F2153\u241F\u241Eadd\u241F113411\u241F", W9Events(p.Feed("event: add\ndata: 73857293\n\nevent: remove\ndata: 2153\n\nevent: add\ndata: 113411\n\n"))); Eq("sse parse 4 retry", (long?)null, p.Retry); }
{ var p = new SseParser(); Eq("sse parse 5 <BOM>data: bom\\n\\n", "message\u241Fbom\u241F", W9Events(p.Feed("\uFEFFdata: bom\n\n"))); Eq("sse parse 5 retry", (long?)null, p.Retry); }
{ var p = new SseParser(); Eq("sse parse 6 data: a\\r\\ndata: b\\r\\rdata: c\\n\\n", "message\u241Fa\nb\u241F\u241Emessage\u241Fc\u241F", W9Events(p.Feed("data: a\r\ndata: b\r\rdata: c\n\n"))); Eq("sse parse 6 retry", (long?)null, p.Retry); }
{ var p = new SseParser(); Eq("sse parse 7 id: 7\\ndata: x\\n\\ndata: y\\n\\nid\\ndata: z...", "message\u241Fx\u241F7\u241Emessage\u241Fy\u241F7\u241Emessage\u241Fz\u241F", W9Events(p.Feed("id: 7\ndata: x\n\ndata: y\n\nid\ndata: z\n\n"))); Eq("sse parse 7 retry", (long?)null, p.Retry); }
{ var p = new SseParser(); Eq("sse parse 8 id: a\\0b\\ndata: nul\\n\\n", "message\u241Fnul\u241F", W9Events(p.Feed("id: a\u0000b\ndata: nul\n\n"))); Eq("sse parse 8 retry", (long?)null, p.Retry); }
{ var p = new SseParser(); Eq("sse parse 9 retry: 1500\\ndata: r\\n\\nretry: x\\ndata: ...", "message\u241Fr\u241F\u241Emessage\u241Fs\u241F", W9Events(p.Feed("retry: 1500\ndata: r\n\nretry: x\ndata: s\n\n"))); Eq("sse parse 9 retry", (long?)1500, p.Retry); }
{ var p = new SseParser(); Eq("sse parse 10 event\\ndata: e\\n\\n", "message\u241Fe\u241F", W9Events(p.Feed("event\ndata: e\n\n"))); Eq("sse parse 10 retry", (long?)null, p.Retry); }
{ var p = new SseParser(); Eq("sse parse 11 unknown: q\\ndata: u\\n\\n", "message\u241Fu\u241F", W9Events(p.Feed("unknown: q\ndata: u\n\n"))); Eq("sse parse 11 retry", (long?)null, p.Retry); }
{ var p = new SseParser(); Eq("sse parse 12 :\\n:comment\\ndata: ok\\n\\n", "message\u241Fok\u241F", W9Events(p.Feed(":\n:comment\ndata: ok\n\n"))); Eq("sse parse 12 retry", (long?)null, p.Retry); }
{ var p = new SseParser(); Eq("sse parse 13 data: no blank line at end", "", W9Events(p.Feed("data: no blank line at end"))); Eq("sse parse 13 retry", (long?)null, p.Retry); }
{ var p = new SseParser(); var all = new List<SseEvent>(); foreach (var ch in new string[] { "data: YHO", "O\ndata: +2\n", "data", ": 10\n\n" }) all.AddRange(p.Feed(ch)); Eq("sse chunked 0", "message\u241FYHOO\n+2\n10\u241F", W9Events(all)); }
{ var p = new SseParser(); var all = new List<SseEvent>(); foreach (var ch in new string[] { ": te", "st stream\n\ndata: first event\nid: 1\n\ndata:s", "econd event\nid\n\ndata: ", " third event\n" }) all.AddRange(p.Feed(ch)); Eq("sse chunked 1", "message\u241Ffirst event\u241F1\u241Emessage\u241Fsecond event\u241F", W9Events(all)); }
{ var p = new SseParser(); var all = new List<SseEvent>(); foreach (var ch in new string[] { "da", "ta\n\nda", "ta\ndata", "\n\ndata:" }) all.AddRange(p.Feed(ch)); Eq("sse chunked 2", "message\u241F\u241F\u241Emessage\u241F\n\u241F", W9Events(all)); }
{ var p = new SseParser(); var all = new List<SseEvent>(); foreach (var ch in new string[] { "data", ":t", "est\n\nd", "ata: test\n\n" }) all.AddRange(p.Feed(ch)); Eq("sse chunked 3", "message\u241Ftest\u241F\u241Emessage\u241Ftest\u241F", W9Events(all)); }
{ var p = new SseParser(); var all = new List<SseEvent>(); foreach (var ch in new string[] { "event: add\ndata: 73857293\n\nevent", ": remove\ndata: 21", "53\n\nevent: a", "dd\ndata: 113411\n\n" }) all.AddRange(p.Feed(ch)); Eq("sse chunked 4", "add\u241F73857293\u241F\u241Eremove\u241F2153\u241F\u241Eadd\u241F113411\u241F", W9Events(all)); }
{ var p = new SseParser(); var all = new List<SseEvent>(); foreach (var ch in new string[] { "\uFEFFd", "at", "a: bo", "m\n\n" }) all.AddRange(p.Feed(ch)); Eq("sse chunked 5", "message\u241Fbom\u241F", W9Events(all)); }
{ var p = new SseParser(); var all = new List<SseEvent>(); foreach (var ch in new string[] { "d", "ata: a", "\r\ndata: b\r\rdata: ", "c\n\n" }) all.AddRange(p.Feed(ch)); Eq("sse chunked 6", "message\u241Fa\nb\u241F\u241Emessage\u241Fc\u241F", W9Events(all)); }
{ var p = new SseParser(); var all = new List<SseEvent>(); foreach (var ch in new string[] { "id: 7\ndata: ", "x\n\ndat", "a: y\n\nid\n", "data: z\n\n" }) all.AddRange(p.Feed(ch)); Eq("sse chunked 7", "message\u241Fx\u241F7\u241Emessage\u241Fy\u241F7\u241Emessage\u241Fz\u241F", W9Events(all)); }
{ var p = new SseParser(); var all = new List<SseEvent>(); foreach (var ch in new string[] { "id:", " a\u0000", "b\ndata:", " nul\n\n" }) all.AddRange(p.Feed(ch)); Eq("sse chunked 8", "message\u241Fnul\u241F", W9Events(all)); }
{ var p = new SseParser(); var all = new List<SseEvent>(); foreach (var ch in new string[] { "r", "etry: 15", "00\ndata: r\n\nretry: x", "\ndata: s\n\n" }) all.AddRange(p.Feed(ch)); Eq("sse chunked 9", "message\u241Fr\u241F\u241Emessage\u241Fs\u241F", W9Events(all)); }
Eq("sse parseSse one-shot", "message\u241FYHOO\n+2\n10\u241F", W9Events(Sse.Parse("data: YHOO\ndata: +2\ndata: 10\n\n")));
Eq("sse format 0", "data: hello\n\n", Sse.Format("hello", null, null, null));
Eq("sse format 1", "event: update\nid: 42\ndata: a\ndata: b\ndata: c\n\n", Sse.Format("a\nb\r\nc", "update", "42", null));
Eq("sse format 2", "retry: 3000\ndata: \n\n", Sse.Format("", null, null, 3000));
Eq("sse format 3", "event: json\nid: \ndata: {\"x\":1}\n\n", Sse.Format("{\"x\":1}", "json", "", null));
Throws<ArgumentException>("sse format invalid 0", () => Sse.Format("x", "a\nb", null, null));
Throws<ArgumentException>("sse format invalid 1", () => Sse.Format("x", null, "a\rb", null));
Throws<ArgumentException>("sse format invalid 2", () => Sse.Format("x", null, "a\u0000", null));
Throws<ArgumentException>("sse format invalid 3", () => Sse.Format("x", null, null, -1));
Eq("sse comment ", ":\n\n", Sse.FormatComment(""));
Eq("sse comment ping", ": ping\n\n", Sse.FormatComment("ping"));
Throws<ArgumentException>("sse comment line break", () => Sse.FormatComment("a\nb"));

// 48. Text chunking (code points)
foreach (var (text, max, overlap, expected) in new (string, int, int, string[])[] {
    ("First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 60, 0, new string[] { "First paragraph. It has two sentences.", "Second paragraph is a bit longer and keeps going.", "Another sentence here! And a question?\n\nThird." }),
    ("First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 40, 15, new string[] { "First paragraph. It has two sentences.", "Second paragraph is a bit longer and", "bit longer and keeps going.", "keeps going. Another sentence here!", "And a question?\n\nThird." }),
    ("First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 10, 0, new string[] { "First para", "graph. It", "has two se", "ntences.", "Second", "paragraph", "is a bit", "longer", "and keeps", "going.", "Another", "sentence", "here! And", "a question", "?\n\nThird." }),
    ("First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 10, 4, new string[] { "First para", "paragraph.", "aph. It", "It has", "has two se", "sentences.", "ces.", ".\n\nSecond", "paragraph", "is a bit", "longer", "and keeps", "going.", "Another", "sentence", "here! And", "And a ques", "question?", "on?", "n?\n\nThird." }),
    ("First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 4, 0, new string[] { "Firs", "t pa", "ragr", "aph.", "It", "has", "two", "sent", "ence", "s.", "Seco", "nd p", "arag", "raph", "is", "a", "bit", "long", "er", "and", "keep", "s go", "ing.", "Ano", "ther", "sen", "tenc", "e he", "re!", "And", "a qu", "esti", "on?", "Thi", "rd." }),
    ("First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 9, 4, new string[] { "First par", "paragraph", "raph. It", "It has", "has two s", "sentences", "nces.", "Second", "paragraph", "raph is", "is a", "a bit", "longer", "and", "keeps", "going.", "Another", "sentence", "here!", "And a que", "question?", "ion?", "?\n\nThird." }),
    ("First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 1, 0, new string[] { "F", "i", "r", "s", "t", "p", "a", "r", "a", "g", "r", "a", "p", "h", ".", "I", "t", "h", "a", "s", "t", "w", "o", "s", "e", "n", "t", "e", "n", "c", "e", "s", ".", "S", "e", "c", "o", "n", "d", "p", "a", "r", "a", "g", "r", "a", "p", "h", "i", "s", "a", "b", "i", "t", "l", "o", "n", "g", "e", "r", "a", "n", "d", "k", "e", "e", "p", "s", "g", "o", "i", "n", "g", ".", "A", "n", "o", "t", "h", "e", "r", "s", "e", "n", "t", "e", "n", "c", "e", "h", "e", "r", "e", "!", "A", "n", "d", "a", "q", "u", "e", "s", "t", "i", "o", "n", "?", "T", "h", "i", "r", "d", "." }),
    ("First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 200, 50, new string[] { "First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird." }),
    ("abcdefghij", 60, 0, new string[] { "abcdefghij" }),
    ("abcdefghij", 40, 15, new string[] { "abcdefghij" }),
    ("abcdefghij", 10, 0, new string[] { "abcdefghij" }),
    ("abcdefghij", 10, 4, new string[] { "abcdefghij" }),
    ("abcdefghij", 4, 0, new string[] { "abcd", "efgh", "ij" }),
    ("abcdefghij", 9, 4, new string[] { "abcdefghi", "fghij" }),
    ("abcdefghij", 1, 0, new string[] { "a", "b", "c", "d", "e", "f", "g", "h", "i", "j" }),
    ("abcdefghij", 200, 50, new string[] { "abcdefghij" }),
    ("one two three four five", 60, 0, new string[] { "one two three four five" }),
    ("one two three four five", 40, 15, new string[] { "one two three four five" }),
    ("one two three four five", 10, 0, new string[] { "one two", "three", "four five" }),
    ("one two three four five", 10, 4, new string[] { "one two", "two three", "four five" }),
    ("one two three four five", 4, 0, new string[] { "one", "two", "thre", "e fo", "ur", "five" }),
    ("one two three four five", 9, 4, new string[] { "one two", "three", "four five" }),
    ("one two three four five", 1, 0, new string[] { "o", "n", "e", "t", "w", "o", "t", "h", "r", "e", "e", "f", "o", "u", "r", "f", "i", "v", "e" }),
    ("one two three four five", 200, 50, new string[] { "one two three four five" }),
    ("A. B. C.", 60, 0, new string[] { "A. B. C." }),
    ("A. B. C.", 40, 15, new string[] { "A. B. C." }),
    ("A. B. C.", 10, 0, new string[] { "A. B. C." }),
    ("A. B. C.", 10, 4, new string[] { "A. B. C." }),
    ("A. B. C.", 4, 0, new string[] { "A.", "B.", "C." }),
    ("A. B. C.", 9, 4, new string[] { "A. B. C." }),
    ("A. B. C.", 1, 0, new string[] { "A", ".", "B", ".", "C", "." }),
    ("A. B. C.", 200, 50, new string[] { "A. B. C." }),
    ("  \n\n  ", 60, 0, new string[] {  }),
    ("  \n\n  ", 40, 15, new string[] {  }),
    ("  \n\n  ", 10, 0, new string[] {  }),
    ("  \n\n  ", 10, 4, new string[] {  }),
    ("  \n\n  ", 4, 0, new string[] {  }),
    ("  \n\n  ", 9, 4, new string[] {  }),
    ("  \n\n  ", 1, 0, new string[] {  }),
    ("  \n\n  ", 200, 50, new string[] {  }),
    ("", 60, 0, new string[] {  }),
    ("", 40, 15, new string[] {  }),
    ("", 10, 0, new string[] {  }),
    ("", 10, 4, new string[] {  }),
    ("", 4, 0, new string[] {  }),
    ("", 9, 4, new string[] {  }),
    ("", 1, 0, new string[] {  }),
    ("", 200, 50, new string[] {  }),
    ("Line one\nLine two\nLine three\nLine four", 60, 0, new string[] { "Line one\nLine two\nLine three\nLine four" }),
    ("Line one\nLine two\nLine three\nLine four", 40, 15, new string[] { "Line one\nLine two\nLine three\nLine four" }),
    ("Line one\nLine two\nLine three\nLine four", 10, 0, new string[] { "Line one", "Line two", "Line", "three", "Line four" }),
    ("Line one\nLine two\nLine three\nLine four", 10, 4, new string[] { "Line one", "Line two", "Line", "three", "Line four" }),
    ("Line one\nLine two\nLine three\nLine four", 4, 0, new string[] { "Line", "one", "Line", "two", "Line", "thr", "ee\nL", "ine", "four" }),
    ("Line one\nLine two\nLine three\nLine four", 9, 4, new string[] { "Line one", "Line two", "Line", "three", "Line four" }),
    ("Line one\nLine two\nLine three\nLine four", 1, 0, new string[] { "L", "i", "n", "e", "o", "n", "e", "L", "i", "n", "e", "t", "w", "o", "L", "i", "n", "e", "t", "h", "r", "e", "e", "L", "i", "n", "e", "f", "o", "u", "r" }),
    ("Line one\nLine two\nLine three\nLine four", 200, 50, new string[] { "Line one\nLine two\nLine three\nLine four" }),
    ("Short.", 60, 0, new string[] { "Short." }),
    ("Short.", 40, 15, new string[] { "Short." }),
    ("Short.", 10, 0, new string[] { "Short." }),
    ("Short.", 10, 4, new string[] { "Short." }),
    ("Short.", 4, 0, new string[] { "Shor", "t." }),
    ("Short.", 9, 4, new string[] { "Short." }),
    ("Short.", 1, 0, new string[] { "S", "h", "o", "r", "t", "." }),
    ("Short.", 200, 50, new string[] { "Short." }),
    ("Caf\u00E9 na\u00EFve r\u00E9sum\u00E9 \u2014 \u65E5\u672C\u8A9E\u306E\u30C6\u30AD\u30B9\u30C8\u3002 End.", 60, 0, new string[] { "Caf\u00E9 na\u00EFve r\u00E9sum\u00E9 \u2014 \u65E5\u672C\u8A9E\u306E\u30C6\u30AD\u30B9\u30C8\u3002 End." }),
    ("Caf\u00E9 na\u00EFve r\u00E9sum\u00E9 \u2014 \u65E5\u672C\u8A9E\u306E\u30C6\u30AD\u30B9\u30C8\u3002 End.", 40, 15, new string[] { "Caf\u00E9 na\u00EFve r\u00E9sum\u00E9 \u2014 \u65E5\u672C\u8A9E\u306E\u30C6\u30AD\u30B9\u30C8\u3002 End." }),
    ("Caf\u00E9 na\u00EFve r\u00E9sum\u00E9 \u2014 \u65E5\u672C\u8A9E\u306E\u30C6\u30AD\u30B9\u30C8\u3002 End.", 10, 0, new string[] { "Caf\u00E9", "na\u00EFve", "r\u00E9sum\u00E9 \u2014", "\u65E5\u672C\u8A9E\u306E\u30C6\u30AD\u30B9\u30C8\u3002", "End." }),
    ("Caf\u00E9 na\u00EFve r\u00E9sum\u00E9 \u2014 \u65E5\u672C\u8A9E\u306E\u30C6\u30AD\u30B9\u30C8\u3002 End.", 10, 4, new string[] { "Caf\u00E9", "na\u00EFve", "r\u00E9sum\u00E9 \u2014", "\u65E5\u672C\u8A9E\u306E\u30C6\u30AD\u30B9\u30C8\u3002", "End." }),
    ("Caf\u00E9 na\u00EFve r\u00E9sum\u00E9 \u2014 \u65E5\u672C\u8A9E\u306E\u30C6\u30AD\u30B9\u30C8\u3002 End.", 4, 0, new string[] { "Caf\u00E9", "na\u00EF", "ve r", "\u00E9sum", "\u00E9 \u2014", "\u65E5\u672C\u8A9E\u306E", "\u30C6\u30AD\u30B9\u30C8", "\u3002", "End." }),
    ("Caf\u00E9 na\u00EFve r\u00E9sum\u00E9 \u2014 \u65E5\u672C\u8A9E\u306E\u30C6\u30AD\u30B9\u30C8\u3002 End.", 9, 4, new string[] { "Caf\u00E9", "na\u00EFve", "r\u00E9sum\u00E9 \u2014", "\u2014 \u65E5\u672C\u8A9E\u306E\u30C6\u30AD\u30B9", "\u306E\u30C6\u30AD\u30B9\u30C8\u3002", "\u30B9\u30C8\u3002 End." }),
    ("Caf\u00E9 na\u00EFve r\u00E9sum\u00E9 \u2014 \u65E5\u672C\u8A9E\u306E\u30C6\u30AD\u30B9\u30C8\u3002 End.", 1, 0, new string[] { "C", "a", "f", "\u00E9", "n", "a", "\u00EF", "v", "e", "r", "\u00E9", "s", "u", "m", "\u00E9", "\u2014", "\u65E5", "\u672C", "\u8A9E", "\u306E", "\u30C6", "\u30AD", "\u30B9", "\u30C8", "\u3002", "E", "n", "d", "." }),
    ("Caf\u00E9 na\u00EFve r\u00E9sum\u00E9 \u2014 \u65E5\u672C\u8A9E\u306E\u30C6\u30AD\u30B9\u30C8\u3002 End.", 200, 50, new string[] { "Caf\u00E9 na\u00EFve r\u00E9sum\u00E9 \u2014 \u65E5\u672C\u8A9E\u306E\u30C6\u30AD\u30B9\u30C8\u3002 End." }),
    ("xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 60, 0, new string[] { "xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy" }),
    ("xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 40, 15, new string[] { "xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy" }),
    ("xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 10, 0, new string[] { "xxxxxxxxxx", "xxxxxxxxxx", "xxxxx", "yyyyy" }),
    ("xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 10, 4, new string[] { "xxxxxxxxxx", "xxxxxxxxxx", "xxxxxxxxxx", "xxxxxxx", "xxx yyyyy" }),
    ("xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 4, 0, new string[] { "xxxx", "xxxx", "xxxx", "xxxx", "xxxx", "xxxx", "x yy", "yyy" }),
    ("xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 9, 4, new string[] { "xxxxxxxxx", "xxxxxxxxx", "xxxxxxxxx", "xxxxxxxxx", "xxxxx", "xxx yyyyy" }),
    ("xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 1, 0, new string[] { "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "y", "y", "y", "y", "y" }),
    ("xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 200, 50, new string[] { "xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy" }),
    ("Mr. Smith went. Then? Yes! Done.", 60, 0, new string[] { "Mr. Smith went. Then? Yes! Done." }),
    ("Mr. Smith went. Then? Yes! Done.", 40, 15, new string[] { "Mr. Smith went. Then? Yes! Done." }),
    ("Mr. Smith went. Then? Yes! Done.", 10, 0, new string[] { "Mr. Smith", "went.", "Then?", "Yes! Done." }),
    ("Mr. Smith went. Then? Yes! Done.", 10, 4, new string[] { "Mr. Smith", "went.", "Then?", "Yes! Done." }),
    ("Mr. Smith went. Then? Yes! Done.", 4, 0, new string[] { "Mr.", "Smit", "h we", "nt.", "Then", "? Ye", "s! D", "one." }),
    ("Mr. Smith went. Then? Yes! Done.", 9, 4, new string[] { "Mr.", "Smith", "went.", "Then?", "Yes!", "Done." }),
    ("Mr. Smith went. Then? Yes! Done.", 1, 0, new string[] { "M", "r", ".", "S", "m", "i", "t", "h", "w", "e", "n", "t", ".", "T", "h", "e", "n", "?", "Y", "e", "s", "!", "D", "o", "n", "e", "." }),
    ("Mr. Smith went. Then? Yes! Done.", 200, 50, new string[] { "Mr. Smith went. Then? Yes! Done." }),
})
    Eq($"chunk text max={max} overlap={overlap} {(text.Length > 30 ? text[..30] : text).Replace("\n", "\\n")}", string.Join("\u241E", expected), string.Join("\u241E", TextChunking.ChunkText(text, max, overlap)));
Throws<ArgumentOutOfRangeException>("chunk text invalid max=0 overlap=0", () => TextChunking.ChunkText("x", 0, 0));
Throws<ArgumentOutOfRangeException>("chunk text invalid max=5 overlap=5", () => TextChunking.ChunkText("x", 5, 5));
Throws<ArgumentOutOfRangeException>("chunk text invalid max=5 overlap=-1", () => TextChunking.ChunkText("x", 5, -1));
Throws<ArgumentOutOfRangeException>("chunk text invalid max=-3 overlap=0", () => TextChunking.ChunkText("x", -3, 0));

// 49. Vector math
W9Near("vector dot 0", 32, VectorMath.Dot(new double[] { 1, 2, 3 }, new double[] { 4, 5, 6 })); W9Near("vector cosine 0", 0.9746318461970762, VectorMath.Cosine(new double[] { 1, 2, 3 }, new double[] { 4, 5, 6 }));
W9Near("vector dot 1", 0, VectorMath.Dot(new double[] { 1, 0 }, new double[] { 0, 1 })); W9Near("vector cosine 1", 0.0, VectorMath.Cosine(new double[] { 1, 0 }, new double[] { 0, 1 }));
W9Near("vector dot 2", -2, VectorMath.Dot(new double[] { 1, 1 }, new double[] { -1, -1 })); W9Near("vector cosine 2", -0.9999999999999998, VectorMath.Cosine(new double[] { 1, 1 }, new double[] { -1, -1 }));
W9Near("vector dot 3", 0, VectorMath.Dot(new double[] { 0, 0 }, new double[] { 1, 2 })); W9Near("vector cosine 3", 0.0, VectorMath.Cosine(new double[] { 0, 0 }, new double[] { 1, 2 }));
W9Near("vector dot 4", 25, VectorMath.Dot(new double[] { 3, 4 }, new double[] { 3, 4 })); W9Near("vector cosine 4", 1.0, VectorMath.Cosine(new double[] { 3, 4 }, new double[] { 3, 4 }));
W9Near("vector dot 5", -1.375, VectorMath.Dot(new double[] { 0.5, -1.5, 2 }, new double[] { 2, 0.25, -1 })); W9Near("vector cosine 5", -0.23969749850222494, VectorMath.Cosine(new double[] { 0.5, -1.5, 2 }, new double[] { 2, 0.25, -1 }));
W9Near("vector norm 0", 5.0, VectorMath.Norm(new double[] { 3, 4 }));
W9Near("vector norm 1", 0.0, VectorMath.Norm(new double[] { 0, 0, 0 }));
W9Near("vector norm 2", 2.0, VectorMath.Norm(new double[] { 1, 1, 1, 1 }));
W9Near("vector norm 3", 2.5, VectorMath.Norm(new double[] { -2.5 }));
{ var n = VectorMath.Normalize(new double[] { 3, 4 }); var e = new double[] { 0.6, 0.8 }; Check("vector normalize 0", n.Length == e.Length && n.Zip(e).All(p => Math.Abs(p.First - p.Second) <= 1e-9)); }
{ var n = VectorMath.Normalize(new double[] { 0, 5 }); var e = new double[] { 0.0, 1.0 }; Check("vector normalize 1", n.Length == e.Length && n.Zip(e).All(p => Math.Abs(p.First - p.Second) <= 1e-9)); }
{ var n = VectorMath.Normalize(new double[] { 1, 1, 1, 1 }); var e = new double[] { 0.5, 0.5, 0.5, 0.5 }; Check("vector normalize 2", n.Length == e.Length && n.Zip(e).All(p => Math.Abs(p.First - p.Second) <= 1e-9)); }
{ var r = VectorMath.TopK(new double[] { 1, 0 }, new double[][] { new double[] { 1, 0 }, new double[] { 0.99, 0.1 }, new double[] { 0, 1 }, new double[] { 0.7, 0.7 }, new double[] { -1, 0 } }, 0); var e = new (int, double)[] {  }; Check("vector topK 0", r.Count == e.Length && r.Zip(e).All(p => p.First.Index == p.Second.Item1 && Math.Abs(p.First.Score - p.Second.Item2) <= 1e-9)); }
{ var r = VectorMath.TopK(new double[] { 1, 0 }, new double[][] { new double[] { 1, 0 }, new double[] { 0.99, 0.1 }, new double[] { 0, 1 }, new double[] { 0.7, 0.7 }, new double[] { -1, 0 } }, 1); var e = new (int, double)[] { (0, 1.0) }; Check("vector topK 1", r.Count == e.Length && r.Zip(e).All(p => p.First.Index == p.Second.Item1 && Math.Abs(p.First.Score - p.Second.Item2) <= 1e-9)); }
{ var r = VectorMath.TopK(new double[] { 1, 0 }, new double[][] { new double[] { 1, 0 }, new double[] { 0.99, 0.1 }, new double[] { 0, 1 }, new double[] { 0.7, 0.7 }, new double[] { -1, 0 } }, 3); var e = new (int, double)[] { (0, 1.0), (1, 0.9949371890224981), (3, 0.7071067811865476) }; Check("vector topK 2", r.Count == e.Length && r.Zip(e).All(p => p.First.Index == p.Second.Item1 && Math.Abs(p.First.Score - p.Second.Item2) <= 1e-9)); }
{ var r = VectorMath.TopK(new double[] { 1, 0 }, new double[][] { new double[] { 1, 0 }, new double[] { 0.99, 0.1 }, new double[] { 0, 1 }, new double[] { 0.7, 0.7 }, new double[] { -1, 0 } }, 10); var e = new (int, double)[] { (0, 1.0), (1, 0.9949371890224981), (3, 0.7071067811865476), (2, 0.0), (4, -1.0) }; Check("vector topK 3", r.Count == e.Length && r.Zip(e).All(p => p.First.Index == p.Second.Item1 && Math.Abs(p.First.Score - p.Second.Item2) <= 1e-9)); }
{ var r = VectorMath.TopK(new double[] { 0.2, 0.5, 0.1 }, new double[][] { new double[] { 0.1, 0.4, 0.2 }, new double[] { 0.9, 0.1, 0.0 }, new double[] { 0.2, 0.5, 0.1 }, new double[] { 0.0, 0.0, 1.0 }, new double[] { 0.3, 0.3, 0.3 }, new double[] { 0.21, 0.49, 0.12 } }, 3); var e = new (int, double)[] { (2, 1.0), (5, 0.9990003934498585), (0, 0.956182887467515) }; Check("vector topK 4", r.Count == e.Length && r.Zip(e).All(p => p.First.Index == p.Second.Item1 && Math.Abs(p.First.Score - p.Second.Item2) <= 1e-9)); }
Eq("vector mmr 0", "0,1,4", string.Join(",", VectorMath.Mmr(new double[] { 1, 0 }, new double[][] { new double[] { 1, 0 }, new double[] { 0.99, 0.1 }, new double[] { 0, 1 }, new double[] { 0.7, 0.7 }, new double[] { -1, 0 } }, 3, 0.5)));
Eq("vector mmr 1", "0,1,3", string.Join(",", VectorMath.Mmr(new double[] { 1, 0 }, new double[][] { new double[] { 1, 0 }, new double[] { 0.99, 0.1 }, new double[] { 0, 1 }, new double[] { 0.7, 0.7 }, new double[] { -1, 0 } }, 3, 1.0)));
Eq("vector mmr 2", "0,4,2", string.Join(",", VectorMath.Mmr(new double[] { 1, 0 }, new double[][] { new double[] { 1, 0 }, new double[] { 0.99, 0.1 }, new double[] { 0, 1 }, new double[] { 0.7, 0.7 }, new double[] { -1, 0 } }, 3, 0.0)));
Eq("vector mmr 3", "0,1,3,2,4", string.Join(",", VectorMath.Mmr(new double[] { 1, 0 }, new double[][] { new double[] { 1, 0 }, new double[] { 0.99, 0.1 }, new double[] { 0, 1 }, new double[] { 0.7, 0.7 }, new double[] { -1, 0 } }, 5, 0.7)));
Eq("vector mmr 4", "2,0,1", string.Join(",", VectorMath.Mmr(new double[] { 0.2, 0.5, 0.1 }, new double[][] { new double[] { 0.1, 0.4, 0.2 }, new double[] { 0.9, 0.1, 0.0 }, new double[] { 0.2, 0.5, 0.1 }, new double[] { 0.0, 0.0, 1.0 }, new double[] { 0.3, 0.3, 0.3 }, new double[] { 0.21, 0.49, 0.12 } }, 3, 0.5)));
Eq("vector mmr 5", "2,3,1,4", string.Join(",", VectorMath.Mmr(new double[] { 0.2, 0.5, 0.1 }, new double[][] { new double[] { 0.1, 0.4, 0.2 }, new double[] { 0.9, 0.1, 0.0 }, new double[] { 0.2, 0.5, 0.1 }, new double[] { 0.0, 0.0, 1.0 }, new double[] { 0.3, 0.3, 0.3 }, new double[] { 0.21, 0.49, 0.12 } }, 4, 0.3)));
// invalid: length mismatch: cosine([1,2],[1,2,3]); empty: dot([],[]); normalize([0,0]); top_k k=-1; mmr lambda=1.5
Throws<ArgumentException>("vector invalid length mismatch", () => VectorMath.Cosine(new double[] { 1, 2 }, new double[] { 1, 2, 3 }));
Throws<ArgumentException>("vector invalid empty", () => VectorMath.Dot(Array.Empty<double>(), Array.Empty<double>()));
Throws<ArgumentException>("vector invalid normalize zero", () => VectorMath.Normalize(new double[] { 0, 0 }));
Throws<ArgumentOutOfRangeException>("vector invalid topK k=-1", () => VectorMath.TopK(new double[] { 1, 0 }, new double[][] { new double[] { 1, 0 } }, -1));
Throws<ArgumentOutOfRangeException>("vector invalid mmr lambda=1.5", () => VectorMath.Mmr(new double[] { 1, 0 }, new double[][] { new double[] { 1, 0 } }, 1, 1.5));

// 50. Circuit breaker
{
    var cb = new CircuitBreaker(2, 1000, 1);
    Eq("breaker 0.0 allow@0", true, cb.Allow(0));
    cb.RecordFailure(0);
    Eq("breaker 0.2 state@0", "closed", cb.State(0));
    cb.RecordFailure(10);
    Eq("breaker 0.4 state@10", "open", cb.State(10));
    Eq("breaker 0.5 allow@500", false, cb.Allow(500));
    Eq("breaker 0.6 retry_after@500", 510L, cb.RetryAfterMs(500));
    Eq("breaker 0.7 state@1010", "half_open", cb.State(1010));
    Eq("breaker 0.8 allow@1010", true, cb.Allow(1010));
    Eq("breaker 0.9 allow@1011", false, cb.Allow(1011));
    cb.RecordSuccess(1020);
    Eq("breaker 0.11 state@1020", "closed", cb.State(1020));
    Eq("breaker 0.12 allow@1021", true, cb.Allow(1021));
}
{
    var cb = new CircuitBreaker(3, 500, 2);
    cb.RecordFailure(0);
    cb.RecordSuccess(1);
    cb.RecordFailure(2);
    cb.RecordFailure(3);
    Eq("breaker 1.4 state@3", "closed", cb.State(3));
    cb.RecordFailure(4);
    Eq("breaker 1.6 state@4", "open", cb.State(4));
    Eq("breaker 1.7 state@503", "open", cb.State(503));
    Eq("breaker 1.8 allow@504", true, cb.Allow(504));
    Eq("breaker 1.9 allow@505", true, cb.Allow(505));
    Eq("breaker 1.10 allow@506", false, cb.Allow(506));
    cb.RecordFailure(507);
    Eq("breaker 1.12 state@507", "open", cb.State(507));
    Eq("breaker 1.13 retry_after@600", 407L, cb.RetryAfterMs(600));
    Eq("breaker 1.14 state@1007", "half_open", cb.State(1007));
    Eq("breaker 1.15 allow@1008", true, cb.Allow(1008));
    cb.RecordSuccess(1009);
    Eq("breaker 1.17 state@1009", "closed", cb.State(1009));
}
{
    var cb = new CircuitBreaker(1, 0, 1);
    cb.RecordFailure(5);
    Eq("breaker 2.1 state@5", "half_open", cb.State(5));
    Eq("breaker 2.2 allow@5", true, cb.Allow(5));
    Eq("breaker 2.3 allow@5", false, cb.Allow(5));
    cb.RecordFailure(6);
    Eq("breaker 2.5 state@6", "half_open", cb.State(6));
    Eq("breaker 2.6 allow@6", true, cb.Allow(6));
}
Throws<ArgumentOutOfRangeException>("breaker invalid 0,1000,1", () => new CircuitBreaker(0, 1000, 1));
Throws<ArgumentOutOfRangeException>("breaker invalid 1,-1,1", () => new CircuitBreaker(1, -1, 1));
Throws<ArgumentOutOfRangeException>("breaker invalid 1,1000,0", () => new CircuitBreaker(1, 1000, 0));

// 51. Business days
Eq("business is 2026-10-10 SA/SU", false, BusinessDays.IsBusinessDay("2026-10-10", new string[] {  }, new string[] { "SA", "SU" }));
Eq("business is 2026-10-12 SA/SU", true, BusinessDays.IsBusinessDay("2026-10-12", new string[] {  }, new string[] { "SA", "SU" }));
Eq("business is 2026-12-25 SA/SU", false, BusinessDays.IsBusinessDay("2026-12-25", new string[] { "2026-12-25", "2026-12-28", "2027-01-01" }, new string[] { "SA", "SU" }));
Eq("business is 2026-10-16 FR/SA", false, BusinessDays.IsBusinessDay("2026-10-16", new string[] {  }, new string[] { "FR", "SA" }));
Eq("business add 2026-10-09 1 SA/SU", "2026-10-12", BusinessDays.AddBusinessDays("2026-10-09", 1, new string[] {  }, new string[] { "SA", "SU" }));
Eq("business add 2026-10-12 -1 SA/SU", "2026-10-09", BusinessDays.AddBusinessDays("2026-10-12", -1, new string[] {  }, new string[] { "SA", "SU" }));
Eq("business add 2026-10-10 0 SA/SU", "2026-10-12", BusinessDays.AddBusinessDays("2026-10-10", 0, new string[] {  }, new string[] { "SA", "SU" }));
Eq("business add 2026-10-12 0 SA/SU", "2026-10-12", BusinessDays.AddBusinessDays("2026-10-12", 0, new string[] {  }, new string[] { "SA", "SU" }));
Eq("business add 2026-12-23 3 SA/SU", "2026-12-30", BusinessDays.AddBusinessDays("2026-12-23", 3, new string[] { "2026-12-25", "2026-12-28", "2027-01-01" }, new string[] { "SA", "SU" }));
Eq("business add 2026-12-31 -5 SA/SU", "2026-12-22", BusinessDays.AddBusinessDays("2026-12-31", -5, new string[] { "2026-12-25", "2026-12-28", "2027-01-01" }, new string[] { "SA", "SU" }));
Eq("business add 2028-02-28 1 SA/SU", "2028-02-29", BusinessDays.AddBusinessDays("2028-02-28", 1, new string[] {  }, new string[] { "SA", "SU" }));
Eq("business add 2026-10-14 10 FR/SA", "2026-10-28", BusinessDays.AddBusinessDays("2026-10-14", 10, new string[] {  }, new string[] { "FR", "SA" }));
Eq("business add 2026-01-01 260 SA/SU", "2026-12-31", BusinessDays.AddBusinessDays("2026-01-01", 260, new string[] {  }, new string[] { "SA", "SU" }));
Eq("business add 2026-10-11 0 ", "2026-10-11", BusinessDays.AddBusinessDays("2026-10-11", 0, new string[] {  }, new string[] {  }));
Eq("business between 2026-10-01 2026-11-01 SA/SU", 21, BusinessDays.BusinessDaysBetween("2026-10-01", "2026-11-01", new string[] { "2026-10-12" }, new string[] { "SA", "SU" }));
Eq("business between 2026-11-01 2026-10-01 SA/SU", -22, BusinessDays.BusinessDaysBetween("2026-11-01", "2026-10-01", new string[] {  }, new string[] { "SA", "SU" }));
Eq("business between 2026-10-12 2026-10-12 SA/SU", 0, BusinessDays.BusinessDaysBetween("2026-10-12", "2026-10-12", new string[] {  }, new string[] { "SA", "SU" }));
Eq("business between 2026-12-21 2027-01-04 SA/SU", 7, BusinessDays.BusinessDaysBetween("2026-12-21", "2027-01-04", new string[] { "2026-12-25", "2026-12-28", "2027-01-01" }, new string[] { "SA", "SU" }));
Eq("business between 2026-01-01 2027-01-01 SA/SU", 261, BusinessDays.BusinessDaysBetween("2026-01-01", "2027-01-01", new string[] {  }, new string[] { "SA", "SU" }));
Eq("business between 2026-10-01 2026-10-31 FR/SA", 21, BusinessDays.BusinessDaysBetween("2026-10-01", "2026-10-31", new string[] {  }, new string[] { "FR", "SA" }));
Eq("business between 2026-10-10 2026-10-12 SA/SU", 0, BusinessDays.BusinessDaysBetween("2026-10-10", "2026-10-12", new string[] { "2026-10-11" }, new string[] { "SA", "SU" }));
Throws<FormatException>("business invalid 2026-02-30 1", () => BusinessDays.AddBusinessDays("2026-02-30", 1));
Throws<FormatException>("business invalid 2026-1-01 1", () => BusinessDays.AddBusinessDays("2026-1-01", 1));
Throws<ArgumentOutOfRangeException>("business invalid 2026-01-01 100001", () => BusinessDays.AddBusinessDays("2026-01-01", 100001));
Eq("business default weekend", false, BusinessDays.IsBusinessDay("2026-10-10"));
Throws<ArgumentException>("business all-week weekend", () => BusinessDays.IsBusinessDay("2026-10-10", null, new[] { "MO", "TU", "WE", "TH", "FR", "SA", "SU" }));
Throws<ArgumentException>("business bad weekend day", () => BusinessDays.IsBusinessDay("2026-10-10", null, new[] { "XX" }));

// 52. Natural sort
Eq("natural sort 0", string.Join("\u241E", new string[] { "", "9", "10", "A", "a", "b", "file1", "File1.txt", "file1.txt", "file01.txt", "file2.txt", "file10.txt", "x02y1", "x2y9", "x2y10" }), string.Join("\u241E", NaturalSort.Sort(new string[] { "file10.txt", "file2.txt", "File1.txt", "file1.txt", "file01.txt", "a", "A", "b", "10", "9", "x2y10", "x2y9", "x02y1", "", "file1" })));
Eq("natural sort 1", string.Join("\u241E", new string[] { "v1.2.0", "v1.2.10", "v1.9.9", "v1.10.0", "v10.0" }), string.Join("\u241E", NaturalSort.Sort(new string[] { "v1.10.0", "v1.2.0", "v1.9.9", "v10.0", "v1.2.10" })));
Eq("natural sort 2", string.Join("\u241E", new string[] { "img1.png", "IMG2.png", "img10.png", "img12.png" }), string.Join("\u241E", NaturalSort.Sort(new string[] { "img12.png", "img10.png", "IMG2.png", "img1.png" })));
Eq("natural sort 3", string.Join("\u241E", new string[] { "a", "a0", "a00", "a000", "a1", "a01" }), string.Join("\u241E", NaturalSort.Sort(new string[] { "a0", "a00", "a000", "a", "a1", "a01" })));
Eq("natural sort 4", string.Join("\u241E", new string[] { "1x", "_x", "a", "Z", "z", "\u00C4" }), string.Join("\u241E", NaturalSort.Sort(new string[] { "\u00C4", "Z", "a", "z", "_x", "1x" })));
Eq("natural compare a2 a10", -1, NaturalSort.Compare("a2", "a10")); Eq("natural compare reversed a2", 1, NaturalSort.Compare("a10", "a2"));
Eq("natural compare a10 a2", 1, NaturalSort.Compare("a10", "a2")); Eq("natural compare reversed a10", -1, NaturalSort.Compare("a2", "a10"));
Eq("natural compare abc ABC", 1, NaturalSort.Compare("abc", "ABC")); Eq("natural compare reversed abc", -1, NaturalSort.Compare("ABC", "abc"));
Eq("natural compare x01 x1", 1, NaturalSort.Compare("x01", "x1")); Eq("natural compare reversed x01", -1, NaturalSort.Compare("x1", "x01"));
Eq("natural compare x1 x1", 0, NaturalSort.Compare("x1", "x1")); Eq("natural compare reversed x1", 0, NaturalSort.Compare("x1", "x1"));
Eq("natural compare  a", -1, NaturalSort.Compare("", "a")); Eq("natural compare reversed ", 1, NaturalSort.Compare("a", ""));
Eq("natural compare a 1", 1, NaturalSort.Compare("a", "1")); Eq("natural compare reversed a", -1, NaturalSort.Compare("1", "a"));
Eq("natural compare 99999999999999999999 100000000000000000000", -1, NaturalSort.Compare("99999999999999999999", "100000000000000000000")); Eq("natural compare reversed 99999999999999999999", 1, NaturalSort.Compare("100000000000000000000", "99999999999999999999"));
Eq("natural compare astral by code point", -1, NaturalSort.Compare("\uFF5E", "\U0001F600"));

// 53. File signatures
Eq("file signature detect png", ((string, string)?)("image/png", "png"), FileSignature.DetectFileType(Convert.FromHexString("89504e470d0a1a0a0000000d49484452")));
Eq("file signature detect jpg", ((string, string)?)("image/jpeg", "jpg"), FileSignature.DetectFileType(Convert.FromHexString("ffd8ffe000104a464946")));
Eq("file signature detect gif", ((string, string)?)("image/gif", "gif"), FileSignature.DetectFileType(Convert.FromHexString("4749463839610100")));
Eq("file signature detect webp", ((string, string)?)("image/webp", "webp"), FileSignature.DetectFileType(Convert.FromHexString("52494646240000005745425056503820")));
Eq("file signature detect wav", ((string, string)?)("audio/wav", "wav"), FileSignature.DetectFileType(Convert.FromHexString("524946462400000057415645666d7420")));
Eq("file signature detect avi", ((string, string)?)("video/x-msvideo", "avi"), FileSignature.DetectFileType(Convert.FromHexString("5249464624000000415649204c495354")));
Eq("file signature detect bmp", ((string, string)?)("image/bmp", "bmp"), FileSignature.DetectFileType(Convert.FromHexString("424d0000000000000000000000000000")));
Eq("file signature detect ico", ((string, string)?)("image/x-icon", "ico"), FileSignature.DetectFileType(Convert.FromHexString("000001000100")));
Eq("file signature detect tif", ((string, string)?)("image/tiff", "tif"), FileSignature.DetectFileType(Convert.FromHexString("49492a000800")));
Eq("file signature detect tif-be", ((string, string)?)("image/tiff", "tif"), FileSignature.DetectFileType(Convert.FromHexString("4d4d002a0008")));
Eq("file signature detect pdf", ((string, string)?)("application/pdf", "pdf"), FileSignature.DetectFileType(Convert.FromHexString("255044462d312e370a")));
Eq("file signature detect zip", ((string, string)?)("application/zip", "zip"), FileSignature.DetectFileType(Convert.FromHexString("504b03041400")));
Eq("file signature detect zip-empty", ((string, string)?)("application/zip", "zip"), FileSignature.DetectFileType(Convert.FromHexString("504b0506000000000000000000000000000000000000")));
Eq("file signature detect gz", ((string, string)?)("application/gzip", "gz"), FileSignature.DetectFileType(Convert.FromHexString("1f8b0800")));
Eq("file signature detect 7z", ((string, string)?)("application/x-7z-compressed", "7z"), FileSignature.DetectFileType(Convert.FromHexString("377abcaf271c0004")));
Eq("file signature detect rar", ((string, string)?)("application/vnd.rar", "rar"), FileSignature.DetectFileType(Convert.FromHexString("526172211a070100")));
Eq("file signature detect sqlite", ((string, string)?)("application/vnd.sqlite3", "sqlite"), FileSignature.DetectFileType(Convert.FromHexString("53514c69746520666f726d61742033001000")));
Eq("file signature detect wasm", ((string, string)?)("application/wasm", "wasm"), FileSignature.DetectFileType(Convert.FromHexString("0061736d01000000")));
Eq("file signature detect ogg", ((string, string)?)("audio/ogg", "ogg"), FileSignature.DetectFileType(Convert.FromHexString("4f6767530002")));
Eq("file signature detect flac", ((string, string)?)("audio/flac", "flac"), FileSignature.DetectFileType(Convert.FromHexString("664c614300000022")));
Eq("file signature detect mp3-id3", ((string, string)?)("audio/mpeg", "mp3"), FileSignature.DetectFileType(Convert.FromHexString("494433040000")));
Eq("file signature detect mp3-frame", ((string, string)?)("audio/mpeg", "mp3"), FileSignature.DetectFileType(Convert.FromHexString("fffb9064")));
Eq("file signature detect webm", ((string, string)?)("video/webm", "webm"), FileSignature.DetectFileType(Convert.FromHexString("1a45dfa39f4286")));
Eq("file signature detect mp4", ((string, string)?)("video/mp4", "mp4"), FileSignature.DetectFileType(Convert.FromHexString("000000206674797069736f6d00000200")));
Eq("file signature detect mov", ((string, string)?)("video/quicktime", "mov"), FileSignature.DetectFileType(Convert.FromHexString("00000014667479707174202000000000")));
Eq("file signature detect heic", ((string, string)?)("image/heic", "heic"), FileSignature.DetectFileType(Convert.FromHexString("00000018667479706865696300000000")));
Eq("file signature detect avif", ((string, string)?)("image/avif", "avif"), FileSignature.DetectFileType(Convert.FromHexString("0000001c667479706176696600000000")));
Eq("file signature detect m4a", ((string, string)?)("audio/mp4", "m4a"), FileSignature.DetectFileType(Convert.FromHexString("00000020667479704d34412000000000")));
Eq("file signature detect woff", ((string, string)?)("font/woff", "woff"), FileSignature.DetectFileType(Convert.FromHexString("774f464600010000")));
Eq("file signature detect woff2", ((string, string)?)("font/woff2", "woff2"), FileSignature.DetectFileType(Convert.FromHexString("774f463200010000")));
Eq("file signature detect text", ((string, string)?)null, FileSignature.DetectFileType(Convert.FromHexString("68656c6c6f20776f726c64")));
Eq("file signature detect empty", ((string, string)?)null, FileSignature.DetectFileType(Convert.FromHexString("")));
Eq("file signature detect short-png", ((string, string)?)null, FileSignature.DetectFileType(Convert.FromHexString("89504e47")));
Eq("file signature detect bm-short", ((string, string)?)null, FileSignature.DetectFileType(Convert.FromHexString("424d0000")));
Eq("file signature detect ff-not-mp3", ((string, string)?)null, FileSignature.DetectFileType(Convert.FromHexString("ffe10000")));
Eq("file signature detect html", ((string, string)?)null, FileSignature.DetectFileType(Convert.FromHexString("3c21444f43545950452068746d6c3e")));
Eq("file signature extension a.png 89504e47", true, FileSignature.MatchesExtension(Convert.FromHexString("89504e470d0a1a0a0000000d49484452"), "a.png"));
Eq("file signature extension a.PNG 89504e47", true, FileSignature.MatchesExtension(Convert.FromHexString("89504e470d0a1a0a0000000d49484452"), "a.PNG"));
Eq("file signature extension a.jpg 89504e47", false, FileSignature.MatchesExtension(Convert.FromHexString("89504e470d0a1a0a0000000d49484452"), "a.jpg"));
Eq("file signature extension photo.jpeg ffd8ffe0", true, FileSignature.MatchesExtension(Convert.FromHexString("ffd8ffe000104a464946"), "photo.jpeg"));
Eq("file signature extension report.docx 504b0304", true, FileSignature.MatchesExtension(Convert.FromHexString("504b03041400"), "report.docx"));
Eq("file signature extension x.xlsx 504b0304", true, FileSignature.MatchesExtension(Convert.FromHexString("504b03041400"), "x.xlsx"));
Eq("file signature extension x.pdf.exe 25504446", false, FileSignature.MatchesExtension(Convert.FromHexString("255044462d312e370a"), "x.pdf.exe"));
Eq("file signature extension IMG_1.HEIF 00000018", true, FileSignature.MatchesExtension(Convert.FromHexString("00000018667479706865696300000000"), "IMG_1.HEIF"));
Eq("file signature extension a.txt 68656c6c", false, FileSignature.MatchesExtension(Convert.FromHexString("68656c6c6f20776f726c64"), "a.txt"));
Eq("file signature extension noext 89504e47", false, FileSignature.MatchesExtension(Convert.FromHexString("89504e470d0a1a0a0000000d49484452"), "noext"));
Eq("file signature extension scan.tiff 49492a00", true, FileSignature.MatchesExtension(Convert.FromHexString("49492a000800"), "scan.tiff"));
Eq("file signature extension song.mp3 49443304", true, FileSignature.MatchesExtension(Convert.FromHexString("494433040000"), "song.mp3"));
Eq("file signature extension a.tar.gz 1f8b0800", true, FileSignature.MatchesExtension(Convert.FromHexString("1f8b0800"), "a.tar.gz"));

// 54. Color conversion
{ var c = ColorConvert.ParseHex("#000"); W9Near("color parse #000 r", 0.0, c.R, 1e-6); W9Near("color parse #000 g", 0.0, c.G, 1e-6); W9Near("color parse #000 b", 0.0, c.B, 1e-6); W9Near("color parse #000 a", 1.0, c.A, 1e-6); Eq("color hex round trip #000", "#000000", ColorConvert.ToHex(c.R, c.G, c.B, c.A)); }
{ var c = ColorConvert.ParseHex("#fff"); W9Near("color parse #fff r", 1.0, c.R, 1e-6); W9Near("color parse #fff g", 1.0, c.G, 1e-6); W9Near("color parse #fff b", 1.0, c.B, 1e-6); W9Near("color parse #fff a", 1.0, c.A, 1e-6); Eq("color hex round trip #fff", "#ffffff", ColorConvert.ToHex(c.R, c.G, c.B, c.A)); }
{ var c = ColorConvert.ParseHex("#f00"); W9Near("color parse #f00 r", 1.0, c.R, 1e-6); W9Near("color parse #f00 g", 0.0, c.G, 1e-6); W9Near("color parse #f00 b", 0.0, c.B, 1e-6); W9Near("color parse #f00 a", 1.0, c.A, 1e-6); Eq("color hex round trip #f00", "#ff0000", ColorConvert.ToHex(c.R, c.G, c.B, c.A)); }
{ var c = ColorConvert.ParseHex("#0f8"); W9Near("color parse #0f8 r", 0.0, c.R, 1e-6); W9Near("color parse #0f8 g", 1.0, c.G, 1e-6); W9Near("color parse #0f8 b", 0.5333333333333333, c.B, 1e-6); W9Near("color parse #0f8 a", 1.0, c.A, 1e-6); Eq("color hex round trip #0f8", "#00ff88", ColorConvert.ToHex(c.R, c.G, c.B, c.A)); }
{ var c = ColorConvert.ParseHex("#336699"); W9Near("color parse #336699 r", 0.2, c.R, 1e-6); W9Near("color parse #336699 g", 0.4, c.G, 1e-6); W9Near("color parse #336699 b", 0.6, c.B, 1e-6); W9Near("color parse #336699 a", 1.0, c.A, 1e-6); Eq("color hex round trip #336699", "#336699", ColorConvert.ToHex(c.R, c.G, c.B, c.A)); }
{ var c = ColorConvert.ParseHex("#336699cc"); W9Near("color parse #336699cc r", 0.2, c.R, 1e-6); W9Near("color parse #336699cc g", 0.4, c.G, 1e-6); W9Near("color parse #336699cc b", 0.6, c.B, 1e-6); W9Near("color parse #336699cc a", 0.8, c.A, 1e-6); Eq("color hex round trip #336699cc", "#336699cc", ColorConvert.ToHex(c.R, c.G, c.B, c.A)); }
{ var c = ColorConvert.ParseHex("#ABCDEF"); W9Near("color parse #ABCDEF r", 0.6705882352941176, c.R, 1e-6); W9Near("color parse #ABCDEF g", 0.803921568627451, c.G, 1e-6); W9Near("color parse #ABCDEF b", 0.9372549019607843, c.B, 1e-6); W9Near("color parse #ABCDEF a", 1.0, c.A, 1e-6); Eq("color hex round trip #ABCDEF", "#abcdef", ColorConvert.ToHex(c.R, c.G, c.B, c.A)); }
{ var c = ColorConvert.ParseHex("#12345678"); W9Near("color parse #12345678 r", 0.07058823529411765, c.R, 1e-6); W9Near("color parse #12345678 g", 0.20392156862745098, c.G, 1e-6); W9Near("color parse #12345678 b", 0.33725490196078434, c.B, 1e-6); W9Near("color parse #12345678 a", 0.47058823529411764, c.A, 1e-6); Eq("color hex round trip #12345678", "#12345678", ColorConvert.ToHex(c.R, c.G, c.B, c.A)); }
{ var c = ColorConvert.ParseHex("#7f7f7f"); W9Near("color parse #7f7f7f r", 0.4980392156862745, c.R, 1e-6); W9Near("color parse #7f7f7f g", 0.4980392156862745, c.G, 1e-6); W9Near("color parse #7f7f7f b", 0.4980392156862745, c.B, 1e-6); W9Near("color parse #7f7f7f a", 1.0, c.A, 1e-6); Eq("color hex round trip #7f7f7f", "#7f7f7f", ColorConvert.ToHex(c.R, c.G, c.B, c.A)); }
{ var c = ColorConvert.ParseHex("#808080"); W9Near("color parse #808080 r", 0.5019607843137255, c.R, 1e-6); W9Near("color parse #808080 g", 0.5019607843137255, c.G, 1e-6); W9Near("color parse #808080 b", 0.5019607843137255, c.B, 1e-6); W9Near("color parse #808080 a", 1.0, c.A, 1e-6); Eq("color hex round trip #808080", "#808080", ColorConvert.ToHex(c.R, c.G, c.B, c.A)); }
Throws<FormatException>("color hex invalid 336699", () => ColorConvert.ParseHex("336699"));
Throws<FormatException>("color hex invalid #12", () => ColorConvert.ParseHex("#12"));
Throws<FormatException>("color hex invalid #12345", () => ColorConvert.ParseHex("#12345"));
Throws<FormatException>("color hex invalid #1234567", () => ColorConvert.ParseHex("#1234567"));
Throws<FormatException>("color hex invalid #ggg", () => ColorConvert.ParseHex("#ggg"));
Throws<FormatException>("color hex invalid #", () => ColorConvert.ParseHex("#"));
Throws<FormatException>("color hex invalid rgb(1,2,3)", () => ColorConvert.ParseHex("rgb(1,2,3)"));
Throws<FormatException>("color hex invalid #3366999", () => ColorConvert.ParseHex("#3366999"));
Eq("color toHex 0.5/0.5/0.5", "#808080", ColorConvert.ToHex(0.5, 0.5, 0.5));
Eq("color toHex 1.2/-0.1/0.5", "#ff0080", ColorConvert.ToHex(1.2, -0.1, 0.5));
Eq("color toHex 0.001/0.999/0.5", "#00ff80", ColorConvert.ToHex(0.001, 0.999, 0.5));
Eq("color toHex 0.2/0.4/0.6/0.5", "#33669980", ColorConvert.ToHex(0.2, 0.4, 0.6, 0.5));
Eq("color toHex 0.2/0.4/0.6/1.0", "#336699", ColorConvert.ToHex(0.2, 0.4, 0.6, 1.0));
Eq("color toHex 0.00196078431372549/0.0058823529411764705/0.00980392156862745", "#010203", ColorConvert.ToHex(0.00196078431372549, 0.0058823529411764705, 0.00980392156862745));
{ var c = ColorConvert.ParseHex("#000"); var x = ColorConvert.RgbToHsl(c.R, c.G, c.B); W9Near("color hsl #000 h", 0.0, x.H, 1e-6); W9Near("color hsl #000 s", 0.0, x.S, 1e-6); W9Near("color hsl #000 l", 0.0, x.L, 1e-6); }
{ var c = ColorConvert.ParseHex("#fff"); var x = ColorConvert.RgbToHsl(c.R, c.G, c.B); W9Near("color hsl #fff h", 0.0, x.H, 1e-6); W9Near("color hsl #fff s", 0.0, x.S, 1e-6); W9Near("color hsl #fff l", 1.0, x.L, 1e-6); }
{ var c = ColorConvert.ParseHex("#f00"); var x = ColorConvert.RgbToHsl(c.R, c.G, c.B); W9Near("color hsl #f00 h", 0.0, x.H, 1e-6); W9Near("color hsl #f00 s", 1.0, x.S, 1e-6); W9Near("color hsl #f00 l", 0.5, x.L, 1e-6); }
{ var c = ColorConvert.ParseHex("#0f0"); var x = ColorConvert.RgbToHsl(c.R, c.G, c.B); W9Near("color hsl #0f0 h", 120.0, x.H, 1e-6); W9Near("color hsl #0f0 s", 1.0, x.S, 1e-6); W9Near("color hsl #0f0 l", 0.5, x.L, 1e-6); }
{ var c = ColorConvert.ParseHex("#00f"); var x = ColorConvert.RgbToHsl(c.R, c.G, c.B); W9Near("color hsl #00f h", 240.0, x.H, 1e-6); W9Near("color hsl #00f s", 1.0, x.S, 1e-6); W9Near("color hsl #00f l", 0.5, x.L, 1e-6); }
{ var c = ColorConvert.ParseHex("#336699"); var x = ColorConvert.RgbToHsl(c.R, c.G, c.B); W9Near("color hsl #336699 h", 210.0, x.H, 1e-6); W9Near("color hsl #336699 s", 0.49999999999999994, x.S, 1e-6); W9Near("color hsl #336699 l", 0.4, x.L, 1e-6); }
{ var c = ColorConvert.ParseHex("#ff8000"); var x = ColorConvert.RgbToHsl(c.R, c.G, c.B); W9Near("color hsl #ff8000 h", 30.11764705882353, x.H, 1e-6); W9Near("color hsl #ff8000 s", 1.0, x.S, 1e-6); W9Near("color hsl #ff8000 l", 0.5, x.L, 1e-6); }
{ var c = ColorConvert.ParseHex("#808080"); var x = ColorConvert.RgbToHsl(c.R, c.G, c.B); W9Near("color hsl #808080 h", 0.0, x.H, 1e-6); W9Near("color hsl #808080 s", 0.0, x.S, 1e-6); W9Near("color hsl #808080 l", 0.5019607843137255, x.L, 1e-6); }
{ var c = ColorConvert.ParseHex("#c0ffee"); var x = ColorConvert.RgbToHsl(c.R, c.G, c.B); W9Near("color hsl #c0ffee h", 163.80952380952382, x.H, 1e-6); W9Near("color hsl #c0ffee s", 1.0, x.S, 1e-6); W9Near("color hsl #c0ffee l", 0.8764705882352941, x.L, 1e-6); }
{ var x = ColorConvert.HslToRgb(0, 1, 0.5); W9Near("color hslToRgb 0 r", 1.0, x.R, 1e-6); W9Near("color hslToRgb 0 g", 0.0, x.G, 1e-6); W9Near("color hslToRgb 0 b", 0.0, x.B, 1e-6); }
{ var x = ColorConvert.HslToRgb(120, 1, 0.5); W9Near("color hslToRgb 120 r", 0.0, x.R, 1e-6); W9Near("color hslToRgb 120 g", 1.0, x.G, 1e-6); W9Near("color hslToRgb 120 b", 0.0, x.B, 1e-6); }
{ var x = ColorConvert.HslToRgb(240, 1, 0.5); W9Near("color hslToRgb 240 r", 0.0, x.R, 1e-6); W9Near("color hslToRgb 240 g", 0.0, x.G, 1e-6); W9Near("color hslToRgb 240 b", 1.0, x.B, 1e-6); }
{ var x = ColorConvert.HslToRgb(210, 0.5, 0.4); W9Near("color hslToRgb 210 r", 0.2, x.R, 1e-6); W9Near("color hslToRgb 210 g", 0.4, x.G, 1e-6); W9Near("color hslToRgb 210 b", 0.6000000000000001, x.B, 1e-6); }
{ var x = ColorConvert.HslToRgb(360, 1, 0.5); W9Near("color hslToRgb 360 r", 1.0, x.R, 1e-6); W9Near("color hslToRgb 360 g", 0.0, x.G, 1e-6); W9Near("color hslToRgb 360 b", 0.0, x.B, 1e-6); }
{ var x = ColorConvert.HslToRgb(-30, 1, 0.5); W9Near("color hslToRgb -30 r", 1.0, x.R, 1e-6); W9Near("color hslToRgb -30 g", 0.0, x.G, 1e-6); W9Near("color hslToRgb -30 b", 0.5, x.B, 1e-6); }
{ var x = ColorConvert.HslToRgb(90, 0, 0.3); W9Near("color hslToRgb 90 r", 0.3, x.R, 1e-6); W9Near("color hslToRgb 90 g", 0.3, x.G, 1e-6); W9Near("color hslToRgb 90 b", 0.3, x.B, 1e-6); }
{ var x = ColorConvert.HslToRgb(30, 1, 0.75); W9Near("color hslToRgb 30 r", 1.0, x.R, 1e-6); W9Near("color hslToRgb 30 g", 0.75, x.G, 1e-6); W9Near("color hslToRgb 30 b", 0.5, x.B, 1e-6); }
{ var c = ColorConvert.ParseHex("#000"); var x = ColorConvert.RgbToOklch(c.R, c.G, c.B); W9Near("color oklch #000 L", 0.0, x.L, 1e-6); W9Near("color oklch #000 C", 0.0, x.C, 1e-6); W9Near("color oklch #000 h", 0.0, x.H, 1e-6); }
{ var c = ColorConvert.ParseHex("#fff"); var x = ColorConvert.RgbToOklch(c.R, c.G, c.B); W9Near("color oklch #fff L", 0.9999999934735462, x.L, 1e-6); W9Near("color oklch #fff C", 3.727399553519285e-08, x.C, 1e-6); W9Near("color oklch #fff h", 0.0, x.H, 1e-6); }
{ var c = ColorConvert.ParseHex("#f00"); var x = ColorConvert.RgbToOklch(c.R, c.G, c.B); W9Near("color oklch #f00 L", 0.6279553606145516, x.L, 1e-6); W9Near("color oklch #f00 C", 0.2576833077361567, x.C, 1e-6); W9Near("color oklch #f00 h", 29.233885192342633, x.H, 1e-6); }
{ var c = ColorConvert.ParseHex("#0f0"); var x = ColorConvert.RgbToOklch(c.R, c.G, c.B); W9Near("color oklch #0f0 L", 0.8664396115356694, x.L, 1e-6); W9Near("color oklch #0f0 C", 0.2948272403370166, x.C, 1e-6); W9Near("color oklch #0f0 h", 142.49533888780996, x.H, 1e-6); }
{ var c = ColorConvert.ParseHex("#00f"); var x = ColorConvert.RgbToOklch(c.R, c.G, c.B); W9Near("color oklch #00f L", 0.4520137183853429, x.L, 1e-6); W9Near("color oklch #00f C", 0.31321437166460114, x.C, 1e-6); W9Near("color oklch #00f h", 264.052020638055, x.H, 1e-6); }
{ var c = ColorConvert.ParseHex("#336699"); var x = ColorConvert.RgbToOklch(c.R, c.G, c.B); W9Near("color oklch #336699 L", 0.49931445292373877, x.L, 1e-6); W9Near("color oklch #336699 C", 0.09866435965710138, x.C, 1e-6); W9Near("color oklch #336699 h", 250.43305370947127, x.H, 1e-6); }
{ var c = ColorConvert.ParseHex("#808080"); var x = ColorConvert.RgbToOklch(c.R, c.G, c.B); W9Near("color oklch #808080 L", 0.5998708017071177, x.L, 1e-6); W9Near("color oklch #808080 C", 2.2359581629199253e-08, x.C, 1e-6); W9Near("color oklch #808080 h", 0.0, x.H, 1e-6); }
{ var c = ColorConvert.ParseHex("#ff8000"); var x = ColorConvert.RgbToOklch(c.R, c.G, c.B); W9Near("color oklch #ff8000 L", 0.7318948427227374, x.L, 1e-6); W9Near("color oklch #ff8000 C", 0.1858032156306402, x.C, 1e-6); W9Near("color oklch #ff8000 h", 52.984679593971286, x.H, 1e-6); }
{ var x = ColorConvert.OklchToRgb(0.627955, 0.257683, 29.2339); W9Near("color oklchToRgb 0.627955 r", 0.9999989995226538, x.R, 1e-6); W9Near("color oklchToRgb 0.627955 g", 2.4989239385060646e-06, x.G, 1e-6); W9Near("color oklchToRgb 0.627955 b", -3.5938127559420605e-08, x.B, 1e-6); }
{ var x = ColorConvert.OklchToRgb(0.7, 0.1, 200); W9Near("color oklchToRgb 0.7 r", 0.25183094033414793, x.R, 1e-6); W9Near("color oklchToRgb 0.7 g", 0.6942495954401551, x.G, 1e-6); W9Near("color oklchToRgb 0.7 b", 0.7170636897415913, x.B, 1e-6); }
{ var x = ColorConvert.OklchToRgb(0.5, 0.4, 150); W9Near("color oklchToRgb 0.5 r", -2.5595884674002214, x.R, 1e-6); W9Near("color oklchToRgb 0.5 g", 0.5687880047974224, x.G, 1e-6); W9Near("color oklchToRgb 0.5 b", -0.8622713129274896, x.B, 1e-6); }
{ var x = ColorConvert.OklchToRgb(1, 0, 0); W9Near("color oklchToRgb 1 r", 0.9999999999999999, x.R, 1e-6); W9Near("color oklchToRgb 1 g", 0.9999999999999999, x.G, 1e-6); W9Near("color oklchToRgb 1 b", 0.9999999999999999, x.B, 1e-6); }
{ var x = ColorConvert.OklchToRgb(0, 0, 0); W9Near("color oklchToRgb 0 r", 0.0, x.R, 1e-6); W9Near("color oklchToRgb 0 g", 0.0, x.G, 1e-6); W9Near("color oklchToRgb 0 b", 0.0, x.B, 1e-6); }
Eq("color inGamut 0.25183094033414793", true, ColorConvert.InGamut(0.25183094033414793, 0.6942495954401551, 0.7170636897415913));
Eq("color inGamut -2.5595884674002214", false, ColorConvert.InGamut(-2.5595884674002214, 0.5687880047974224, -0.8622713129274896));

Console.WriteLine($"C# checks: {passed} passed, {failed} failed");
return failed == 0 ? 0 : 1;
