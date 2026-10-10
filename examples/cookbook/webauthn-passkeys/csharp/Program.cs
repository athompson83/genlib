// SPDX-License-Identifier: Apache-2.0
// Runnable check against the recorded software-authenticator fixture:
// `dotnet run` exits non-zero on the first failed expectation.
using System.Text.Json;
using Cookbook.Passkeys;
using Fido2NetLib;

static void Check(bool condition, string what)
{
    if (!condition) { Console.Error.WriteLine($"FAIL: {what}"); Environment.Exit(1); }
    Console.WriteLine($"ok - {what}");
}

static async Task<bool> Throws(Func<Task> action)
{
    try { await action(); return false; } catch (Fido2VerificationException) { return true; }
}

static byte[] B64Url(string s) => Convert.FromBase64String(s.Replace('-', '+').Replace('_', '/').PadRight((s.Length + 3) / 4 * 4, '='));

var fx = JsonDocument.Parse(File.ReadAllText(Path.Combine("..", "fixtures", "passkey-es256-none.json"))).RootElement;
string S(string name) => fx.GetProperty(name).GetString()!;
var rp = new PasskeyService(S("rpId"), "Example", [S("origin")]);
var userHandle = B64Url(S("userId"));

var a = rp.RegistrationOptions(userHandle, "alice@example.com", []);
var b = rp.RegistrationOptions(userHandle, "alice@example.com", []);
var json = JsonDocument.Parse(a.ToJson()).RootElement;
Check(json.GetProperty("rp").GetProperty("id").GetString() == "example.com", "rp id in creation options");
Check(json.GetProperty("authenticatorSelection").GetProperty("userVerification").GetString() == "required", "user verification required");
Check(json.GetProperty("authenticatorSelection").GetProperty("residentKey").GetString() == "required", "discoverable credential required");
Check(a.Challenge.Length >= 16 && !a.Challenge.SequenceEqual(b.Challenge), "fresh random challenge");
Check(CredentialCreateOptions.FromJson(a.ToJson()).Challenge.SequenceEqual(a.Challenge), "options survive JSON round-trip");
var assertOpts = rp.AuthenticationOptions([]);
Check(assertOpts.RpId == "example.com" && assertOpts.AllowCredentials.Count == 0, "usernameless assertion options");

// The recorded response answers a fixed challenge; swap it into generated options.
var regOptions = rp.RegistrationOptions(userHandle, "alice@example.com", []);
regOptions.Challenge = B64Url(S("registrationChallenge"));
var regJson = fx.GetProperty("registrationResponse").GetRawText();
var cred = await rp.VerifyRegistrationAsync(regOptions, regJson, _ => Task.FromResult(true));
Check(cred.CredentialId.SequenceEqual(B64Url(S("credentialId"))), "credential id stored");
Check(cred.PublicKeyCose.SequenceEqual(B64Url(S("credentialPublicKeyCose"))), "COSE public key stored");
Check(cred.SignCount == 0, "initial sign count");

var authOptions = rp.AuthenticationOptions([cred]);
authOptions.Challenge = B64Url(S("authenticationChallenge"));
var authJson = fx.GetProperty("authenticationResponse").GetRawText();
var updated = await rp.VerifyAuthenticationAsync(authOptions, authJson, cred);
Check(updated.SignCount == fx.GetProperty("expectedSignCountAfterAuthentication").GetUInt32(), "sign count advanced");

Check(await Throws(() => rp.VerifyRegistrationAsync(rp.RegistrationOptions(userHandle, "a", []), regJson, _ => Task.FromResult(true))), "wrong registration challenge rejected");
Check(await Throws(() => rp.VerifyRegistrationAsync(regOptions, regJson, _ => Task.FromResult(false))), "duplicate credential id rejected");
var evil = new PasskeyService("example.com", "Example", ["https://evil.example"]);
Check(await Throws(() => evil.VerifyRegistrationAsync(regOptions, regJson, _ => Task.FromResult(true))), "wrong origin rejected");
Check(await Throws(() => rp.VerifyAuthenticationAsync(rp.AuthenticationOptions([cred]), authJson, cred)), "wrong assertion challenge rejected");
Check(await Throws(() => rp.VerifyAuthenticationAsync(authOptions, authJson, cred with { SignCount = 5 })), "sign count regression rejected");
Check(await Throws(() => rp.VerifyAuthenticationAsync(authOptions, authJson, cred with { UserHandle = [1, 2, 3] })), "foreign user handle rejected");
