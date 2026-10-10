// SPDX-License-Identifier: Apache-2.0
// Runnable check: `dotnet run` exits non-zero on the first failed expectation.
using Cookbook.Passwords;

static void Check(bool condition, string what)
{
    if (!condition) { Console.Error.WriteLine($"FAIL: {what}"); Environment.Exit(1); }
    Console.WriteLine($"ok - {what}");
}

var h = Passwords.Hash("correct horse battery staple");
Check(h.StartsWith("$argon2id$v=19$m=19456,t=2,p=1$"), $"OWASP parameters encoded ({h})");
Check(Passwords.Verify(h, "correct horse battery staple") == (true, null), "correct password verifies without rehash");
Check(!Passwords.Verify(h, "wrong").Ok, "wrong password rejected");
Check(h != Passwords.Hash("correct horse battery staple"), "random salt");

Span<char> weakBuf = stackalloc char[Geralt.Argon2id.HashSize];
Geralt.Argon2id.ComputeHash(weakBuf, "pw"u8, 1, 8192 * 1024);
var weak = new string(weakBuf[..weakBuf.IndexOf('\0')]);
var upgraded = Passwords.Verify(weak, "pw");
Check(upgraded.Ok && upgraded.Rehash!.StartsWith("$argon2id$v=19$m=19456,t=2,p=1$"), "weaker parameters trigger rehash");

// argon2-cffi 25.1.0 (reference libargon2) output for "pw".
const string cffi = "$argon2id$v=19$m=19456,t=2,p=1$ecqUURt5rXczDOhwQxrhZw$w2dzt0CPmUdvSjkaj1rGvX6AKzIZ19bg8BnDrVw4KQc";
Check(Passwords.Verify(cffi, "pw") == (true, null), "reference implementation hash verifies");
// node-argon2 0.45.1 writes m,p,t; libsodium (like libargon2) only decodes m,t,p.
const string node = "$argon2id$v=19$m=19456,p=1,t=2$yicTHnSW1i8qRUmdNAbUyA$3x14rcRfaMq+Akio0EutaRBea5WF4RsLUtcQfs23CaA";
Check(!Passwords.Verify(node, "pw").Ok, "node-argon2 parameter order is not accepted (documented)");

var legacy = Passwords.BcryptHash("pw", 10);
var fromLegacy = Passwords.Verify(legacy, "pw");
Check(fromLegacy.Ok && fromLegacy.Rehash!.StartsWith("$argon2id$"), "bcrypt legacy hash upgrades");
Check(!Passwords.Verify(legacy, "nope").Ok, "bcrypt wrong password rejected");
try { Passwords.BcryptHash(new string('x', 73)); Check(false, "72-byte limit"); }
catch (ArgumentException) { Check(true, "bcrypt 72-byte limit enforced"); }
Check(!Passwords.Verify("not-a-hash", "pw").Ok, "malformed hash rejected");
