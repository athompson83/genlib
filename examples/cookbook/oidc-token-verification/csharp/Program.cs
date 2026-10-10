// SPDX-License-Identifier: Apache-2.0
// Runnable check (exit code 0 = pass). Local only: RSA keys generated here; discovery + JWKS
// served by HttpListener on 127.0.0.1.
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Cookbook.Oidc;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

const string Iss = "https://idp.example.test", Aud = "client-123";
var keys = new List<RsaSecurityKey>();
int fetches = 0;
RsaSecurityKey NewKey(string kid) { var k = new RsaSecurityKey(RSA.Create(2048)) { KeyId = kid }; lock (keys) keys.Add(k); return k; }

var l = new TcpListener(IPAddress.Loopback, 0); l.Start(); int port = ((IPEndPoint)l.LocalEndpoint).Port; l.Stop();
var baseUrl = $"http://127.0.0.1:{port}/";
var http = new HttpListener(); http.Prefixes.Add(baseUrl); http.Start();
_ = Task.Run(async () =>
{
    while (http.IsListening)
    {
        HttpListenerContext ctx;
        try { ctx = await http.GetContextAsync(); } catch { break; }
        string body;
        if (ctx.Request.Url!.AbsolutePath.EndsWith("openid-configuration"))
            body = JsonSerializer.Serialize(new { issuer = Iss, jwks_uri = baseUrl + "jwks" });
        else
        {
            Interlocked.Increment(ref fetches);
            lock (keys) body = JsonSerializer.Serialize(new { keys = keys.Select(k => { var j = JsonWebKeyConverter.ConvertFromRSASecurityKey(k); return new { kty = "RSA", kid = k.KeyId, use = "sig", alg = "RS256", n = j.N, e = j.E }; }) });
        }
        var bytes = Encoding.UTF8.GetBytes(body);
        ctx.Response.ContentType = "application/json";
        await ctx.Response.OutputStream.WriteAsync(bytes);
        ctx.Response.Close();
    }
});

string Sign(SecurityKey key, Action<Dictionary<string, object>>? edit = null, string alg = SecurityAlgorithms.RsaSha256)
{
    var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
    var c = new Dictionary<string, object> { ["iss"] = Iss, ["aud"] = Aud, ["sub"] = "user-1", ["iat"] = now, ["nbf"] = now, ["exp"] = now + 300, ["nonce"] = "n-1" };
    edit?.Invoke(c);
    var h = new JsonWebTokenHandler { SetDefaultTimesOnTokenCreation = false };
    return h.CreateToken(JsonSerializer.Serialize(c), new SigningCredentials(key, alg));
}

int failures = 0;
async Task Expect(string name, bool shouldPass, Func<Task> f)
{
    try { await f(); if (!shouldPass) { failures++; Console.WriteLine($"FAIL {name}: accepted"); } else Console.WriteLine($"ok   {name}"); }
    catch (Exception e) { if (shouldPass) { failures++; Console.WriteLine($"FAIL {name}: {e.GetType().Name} {e.Message}"); } else Console.WriteLine($"ok   {name} rejected ({e.GetType().Name})"); }
}

var k1 = NewKey("k1");
var v = new OidcVerifier(Iss, Aud, baseUrl + ".well-known/openid-configuration", TimeSpan.FromSeconds(5), TimeSpan.FromSeconds(1), requireHttps: false);
var nowS = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
await Expect("valid", true, async () => { var c = await v.VerifyAsync(Sign(k1), "n-1"); if ((string)c["sub"] != "user-1") throw new Exception("sub"); });
await Expect("aud", false, () => v.VerifyAsync(Sign(k1, c => c["aud"] = "other")));
await Expect("iss", false, () => v.VerifyAsync(Sign(k1, c => c["iss"] = "https://evil.test")));
await Expect("expired", false, () => v.VerifyAsync(Sign(k1, c => { c["exp"] = nowS - 30; c["nbf"] = nowS - 60; c["iat"] = nowS - 60; })));
await Expect("within skew", true, () => v.VerifyAsync(Sign(k1, c => { c["exp"] = nowS - 2; c["nbf"] = nowS - 60; c["iat"] = nowS - 60; })));
await Expect("nbf future", false, () => v.VerifyAsync(Sign(k1, c => c["nbf"] = nowS + 120)));
await Expect("nonce", false, () => v.VerifyAsync(Sign(k1), "other"));
var good = Sign(k1);
await Expect("tampered", false, () => v.VerifyAsync(good[..^4] + (good.EndsWith("AAAA") ? "BBBB" : "AAAA")));
await Expect("hs256", false, () => v.VerifyAsync(Sign(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(new string('x', 32))) { KeyId = "k1" }, null, SecurityAlgorithms.HmacSha256)));

await Task.Delay(1100); // let RefreshInterval elapse
int before = fetches;
var k2 = NewKey("k2");
await Expect("rotated kid", true, () => v.VerifyAsync(Sign(k2)));
if (fetches <= before) { failures++; Console.WriteLine("FAIL JWKS not refetched"); }
await Expect("unknown kid", false, () => v.VerifyAsync(Sign(new RsaSecurityKey(RSA.Create(2048)) { KeyId = "nope" })));
await Expect("hs config", false, () => { _ = new OidcVerifier(Iss, Aud, "https://x", TimeSpan.Zero, algorithms: new[] { "HS256" }); return Task.CompletedTask; });

http.Stop();
Console.WriteLine(failures == 0 ? "PASS" : $"{failures} FAILURE(S)");
return failures == 0 ? 0 : 1;
