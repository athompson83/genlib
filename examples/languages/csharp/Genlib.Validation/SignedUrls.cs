// SPDX-License-Identifier: Apache-2.0
using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace Genlib.Validation;

/// <summary>Why a signed URL was rejected.</summary>
public enum SignedUrlErrorKind { Malformed, BadSignature, Expired }

/// <summary>A rejected signed URL; the message starts with "malformed", "bad signature" or "expired".</summary>
public sealed class SignedUrlException : Exception {
    public SignedUrlErrorKind Kind { get; }
    public SignedUrlException(SignedUrlErrorKind kind, string message) : base(message) { Kind = kind; }
}

/// <summary>Expiring signed URLs: <c>target?...&amp;expires=&lt;unix seconds&gt;&amp;signature=&lt;base64url HMAC-SHA256&gt;</c>.</summary>
public static class SignedUrls {
    private const string Marker = "&signature=";

    /// <summary>
    /// Signs <paramref name="target"/> (a path plus optional query, starting with "/", without "#") so it is valid until
    /// <paramref name="expiresUnixSeconds"/>. Throws <see cref="ArgumentException"/> for an empty secret, a bad target,
    /// or a query that already has an expires or signature parameter.
    /// </summary>
    public static string SignUrl(string target, string secret, long expiresUnixSeconds) {
        CheckSecret(secret);
        ArgumentNullException.ThrowIfNull(target);
        if (!target.StartsWith('/') || target.Contains('#')) throw new ArgumentException("target must start with \"/\" and contain no \"#\"", nameof(target));
        if (expiresUnixSeconds < 0) throw new ArgumentOutOfRangeException(nameof(expiresUnixSeconds), "expires must be >= 0");
        int q = target.IndexOf('?');
        if (q >= 0) {
            foreach (string pair in target[(q + 1)..].Split('&')) {
                if (pair.Length == 0) continue;
                string name = NameOf(pair);
                if (name is "expires" or "signature") throw new ArgumentException($"query already has an \"{name}\" parameter", nameof(target));
            }
        }
        string message = target + (q >= 0 ? "&" : "?") + "expires=" + expiresUnixSeconds.ToString(CultureInfo.InvariantCulture);
        return message + Marker + Mac(secret, message);
    }

    /// <summary>
    /// Verifies <paramref name="signed"/> at <paramref name="nowUnixSeconds"/>; throws <see cref="SignedUrlException"/> when malformed,
    /// when the signature does not match, or when now &gt; expires (checked after the signature, so "expired" implies authentic).
    /// </summary>
    public static void VerifyUrl(string signed, string secret, long nowUnixSeconds) {
        CheckSecret(secret);
        if (signed is null) throw new SignedUrlException(SignedUrlErrorKind.Malformed, "malformed: url is null");
        int at = signed.LastIndexOf(Marker, StringComparison.Ordinal);
        if (at < 0) throw new SignedUrlException(SignedUrlErrorKind.Malformed, "malformed: missing signature");
        string message = signed[..at], signature = signed[(at + Marker.Length)..];
        if (signature.Length != 43 || !signature.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_'))
            throw new SignedUrlException(SignedUrlErrorKind.Malformed, "malformed: signature must be 43 base64url characters");
        int q = message.IndexOf('?');
        if (!message.StartsWith('/') || q < 0) throw new SignedUrlException(SignedUrlErrorKind.Malformed, "malformed: missing query");
        string? expires = null;
        int count = 0;
        foreach (string pair in message[(q + 1)..].Split('&')) {
            if (NameOf(pair) != "expires") continue;
            count++;
            int eq = pair.IndexOf('=');
            expires = eq < 0 ? "" : pair[(eq + 1)..];
        }
        if (count != 1) throw new SignedUrlException(SignedUrlErrorKind.Malformed, "malformed: expected exactly one expires parameter");
        if (expires!.Length is 0 or > 18 || !expires.All(char.IsAsciiDigit))
            throw new SignedUrlException(SignedUrlErrorKind.Malformed, "malformed: expires is not decimal");
        if (!CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(Mac(secret, message)), Encoding.ASCII.GetBytes(signature)))
            throw new SignedUrlException(SignedUrlErrorKind.BadSignature, "bad signature");
        if (nowUnixSeconds > long.Parse(expires, NumberStyles.None, CultureInfo.InvariantCulture))
            throw new SignedUrlException(SignedUrlErrorKind.Expired, "expired");
    }

    private static string NameOf(string pair) {
        int eq = pair.IndexOf('=');
        return eq < 0 ? pair : pair[..eq];
    }

    private static string Mac(string secret, string message) =>
        Convert.ToBase64String(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(message)))
            .TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static void CheckSecret(string secret) {
        if (string.IsNullOrEmpty(secret)) throw new ArgumentException("secret must be non-empty", nameof(secret));
    }
}
