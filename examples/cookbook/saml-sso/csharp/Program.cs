// SPDX-License-Identifier: Apache-2.0
// Runnable check (exit code 0 = pass). Local only: self-signed IdP cert from CertificateRequest;
// the IdP side (signed Response) is produced in-process with ITfoxtec's own IdP API.
using System.IO.Compression;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Web;
using Cookbook.Saml;
using ITfoxtec.Identity.Saml2;
using ITfoxtec.Identity.Saml2.Schemas;
using Microsoft.IdentityModel.Tokens.Saml2;

var acs = new Uri("https://sp.example.test/saml/acs");
const string SpId = "https://sp.example.test/metadata", IdpId = "https://idp.example.test/metadata";

X509Certificate2 NewCert()
{
    using var rsa = RSA.Create(2048);
    var req = new CertificateRequest("CN=Test IdP", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
    using var c = req.CreateSelfSigned(DateTimeOffset.UtcNow.AddHours(-1), DateTimeOffset.UtcNow.AddDays(1));
    return new X509Certificate2(c.Export(X509ContentType.Pfx), (string?)null, X509KeyStorageFlags.Exportable);
}

string SignedResponse(X509Certificate2 idpCert, string inResponseTo, Action<Saml2AuthnResponse>? edit = null, Uri? destination = null, string audience = SpId)
{
    var idpConfig = new Saml2Configuration { Issuer = IdpId, SigningCertificate = idpCert, AuthnResponseSignType = Saml2AuthnResponseSignTypes.SignAssertion };
    var r = new Saml2AuthnResponse(idpConfig)
    {
        InResponseTo = new Saml2Id(inResponseTo),
        Status = Saml2StatusCodes.Success,
        Destination = destination ?? acs,
        NameId = new Saml2NameIdentifier("alice@example.test"),
        ClaimsIdentity = new ClaimsIdentity(new[] { new Claim(ClaimTypes.Email, "alice@example.test") }),
    };
    r.CreateSecurityToken(audience, subjectConfirmationLifetime: 5, issuedTokenLifetime: 5);
    edit?.Invoke(r);
    var binding = new Saml2PostBinding();
    binding.Bind(r);
    return Convert.ToBase64String(Encoding.UTF8.GetBytes(binding.XmlDocument.OuterXml));
}

int failures = 0;
void Expect(string name, bool shouldPass, Action f)
{
    try { f(); if (shouldPass) Console.WriteLine($"ok   {name}"); else { failures++; Console.WriteLine($"FAIL {name}: accepted"); } }
    catch (Exception e) { if (shouldPass) { failures++; Console.WriteLine($"FAIL {name}: {e.GetType().Name}: {e.Message}"); } else Console.WriteLine($"ok   {name} rejected ({e.GetType().Name}: {e.Message.Split('\n')[0]})"); }
}

var idp = NewCert();
var other = NewCert();
var sp = new SamlSp(SpId, acs, IdpId, new Uri("https://idp.example.test/sso"), new[] { new X509Certificate2(idp.Export(X509ContentType.Cert)) });

string Login()
{
    var (url, id) = sp.LoginRedirect("rs-1");
    if (!url.ToString().StartsWith("https://idp.example.test/sso?")) throw new Exception("bad redirect " + url);
    var samlRequest = HttpUtility.ParseQueryString(url.Query)["SAMLRequest"]!;
    using var inflate = new DeflateStream(new MemoryStream(Convert.FromBase64String(samlRequest)), CompressionMode.Decompress);
    var xml = new StreamReader(inflate).ReadToEnd();
    if (!xml.Contains("AuthnRequest") || !xml.Contains($"AssertionConsumerServiceURL=\"{acs}\"") || !xml.Contains(id)) throw new Exception("bad AuthnRequest " + xml);
    return id;
}

var id0 = Login();
var okResp = SignedResponse(idp, id0);
Expect("valid", true, () => { var r = sp.Validate(okResp, id0); if (r.NameId.Value != "alice@example.test") throw new Exception("nameid"); });
Expect("replayed assertion", false, () => sp.Validate(okResp, id0));
Expect("no pending request", false, () => sp.Validate(SignedResponse(idp, id0), null));
string id;
id = Login(); Expect("audience", false, () => sp.Validate(SignedResponse(idp, id, audience: "https://other-sp"), id));
id = Login(); Expect("recipient", false, () => sp.Validate(SignedResponse(idp, id, r => r.Saml2SecurityToken.Assertion.Subject.SubjectConfirmations.First().SubjectConfirmationData.Recipient = new Uri("https://evil/acs")), id));
id = Login(); Expect("destination", false, () => sp.Validate(SignedResponse(idp, id, r => r.Destination = new Uri("https://evil/acs")), id));
id = Login(); Expect("expired", false, () => sp.Validate(SignedResponse(idp, id, r =>
{
    r.Saml2SecurityToken.Assertion.Conditions.NotBefore = DateTime.UtcNow.AddMinutes(-20);
    r.Saml2SecurityToken.Assertion.Conditions.NotOnOrAfter = DateTime.UtcNow.AddMinutes(-10);
    r.Saml2SecurityToken.Assertion.Subject.SubjectConfirmations.First().SubjectConfirmationData.NotOnOrAfter = DateTime.UtcNow.AddMinutes(-10);
}), id));
id = Login(); Expect("InResponseTo", false, () => sp.Validate(SignedResponse(idp, "_other"), id));
id = Login(); Expect("untrusted signer", false, () => sp.Validate(SignedResponse(other, id), id));
id = Login(); Expect("tampered", false, () =>
{
    var raw = Encoding.UTF8.GetString(Convert.FromBase64String(SignedResponse(idp, id))).Replace("alice@", "admin@");
    sp.Validate(Convert.ToBase64String(Encoding.UTF8.GetBytes(raw)), id);
});

Console.WriteLine(failures == 0 ? "PASS" : $"{failures} FAILURE(S)");
return failures == 0 ? 0 : 1;
