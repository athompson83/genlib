// SPDX-License-Identifier: Apache-2.0
using System.Text;

namespace Cookbook.Passwords;

/// <summary>
/// Argon2id password hashing through Geralt (libsodium crypto_pwhash_str).
/// OWASP minimum: m=19456 KiB, t=2, p=1 (libsodium always uses p=1).
/// Output is a PHC string: $argon2id$v=19$m=19456,t=2,p=1$salt$hash.
/// </summary>
public static class Passwords
{
    public const int Iterations = 2;
    public const int MemoryBytes = 19456 * 1024;

    public static string Hash(string password)
    {
        Span<char> buffer = stackalloc char[Geralt.Argon2id.HashSize];
        Geralt.Argon2id.ComputeHash(buffer, Encoding.UTF8.GetBytes(password), Iterations, MemoryBytes);
        int end = buffer.IndexOf('\0');
        return new string(end < 0 ? buffer : buffer[..end]);
    }

    /// <summary>Returns (ok, rehash). Persist <c>rehash</c> when it is not null.</summary>
    public static (bool Ok, string? Rehash) Verify(string stored, string password)
    {
        if (stored.StartsWith("$2a$") || stored.StartsWith("$2b$") || stored.StartsWith("$2y$"))
        {
            bool legacyOk;
            try { legacyOk = BCrypt.Net.BCrypt.Verify(password, stored); }
            catch (BCrypt.Net.SaltParseException) { return (false, null); }
            return legacyOk ? (true, Hash(password)) : (false, null);
        }
        try
        {
            if (!Geralt.Argon2id.VerifyHash(stored, Encoding.UTF8.GetBytes(password))) return (false, null);
            return (true, Geralt.Argon2id.NeedsRehash(stored, Iterations, MemoryBytes) ? Hash(password) : null);
        }
        catch (Exception e) when (e is FormatException or ArgumentException)
        {
            return (false, null); // malformed or non-argon2id hash
        }
    }

    /// <summary>Fallback where libsodium cannot load. OWASP: cost >= 10; input limited to 72 bytes.</summary>
    public static string BcryptHash(string password, int cost = 12)
    {
        if (Encoding.UTF8.GetByteCount(password) > 72) throw new ArgumentException("bcrypt truncates input over 72 bytes");
        return BCrypt.Net.BCrypt.HashPassword(password, cost);
    }
}
