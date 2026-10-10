// SPDX-License-Identifier: Apache-2.0
using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace Genlib.Validation;

/// <summary>Why a webhook signature was rejected.</summary>
public enum WebhookErrorKind { Malformed, BadSignature, Expired }

/// <summary>A rejected webhook; the message starts with "malformed", "bad signature" or "expired".</summary>
public sealed class WebhookException : Exception {
    public WebhookErrorKind Kind { get; }
    public WebhookException(WebhookErrorKind kind, string message) : base(message) { Kind = kind; }
}

/// <summary>Stripe-style <c>t=&lt;ts&gt;,v1=&lt;hex HMAC-SHA256(secret, "ts.body")&gt;</c> webhook signatures.</summary>
public static class WebhookSignature {
    /// <summary>Signs <paramref name="body"/> at <paramref name="timestampSeconds"/> and returns the signature header.</summary>
    public static string SignWebhook(string secret, long timestampSeconds, string body) {
        CheckSecret(secret);
        ArgumentNullException.ThrowIfNull(body);
        if (timestampSeconds < 0) throw new ArgumentOutOfRangeException(nameof(timestampSeconds), "timestamp must be >= 0");
        string ts = timestampSeconds.ToString(CultureInfo.InvariantCulture);
        return "t=" + ts + ",v1=" + Convert.ToHexString(Mac(secret, ts, body)).ToLowerInvariant();
    }

    /// <summary>
    /// Verifies a signature header; throws <see cref="WebhookException"/> when malformed, when no v1 matches,
    /// or when |now - t| exceeds the tolerance (checked after the signature, so "expired" implies authentic).
    /// </summary>
    public static void VerifyWebhook(string header, string body, string secret, long nowSeconds, long toleranceSeconds = 300) {
        CheckSecret(secret);
        ArgumentNullException.ThrowIfNull(body);
        if (toleranceSeconds < 0) throw new ArgumentOutOfRangeException(nameof(toleranceSeconds), "tolerance must be >= 0");
        if (header is null) throw new WebhookException(WebhookErrorKind.Malformed, "malformed: header is null");
        string? ts = null;
        var signatures = new List<byte[]>();
        foreach (string rawPair in header.Split(',')) {
            int eq = rawPair.IndexOf('=');
            if (eq < 0) throw new WebhookException(WebhookErrorKind.Malformed, "malformed: expected key=value pairs");
            string key = rawPair[..eq].Trim(), value = rawPair[(eq + 1)..].Trim();
            if (key == "t") {
                if (ts is not null) throw new WebhookException(WebhookErrorKind.Malformed, "malformed: more than one t");
                if (value.Length is 0 or > 18 || !value.All(char.IsAsciiDigit)) throw new WebhookException(WebhookErrorKind.Malformed, "malformed: t is not a decimal timestamp");
                ts = value;
            } else if (key == "v1") {
                if (value.Length != 64 || !value.All(c => c is >= '0' and <= '9' or >= 'a' and <= 'f'))
                    throw new WebhookException(WebhookErrorKind.Malformed, "malformed: v1 must be 64 lowercase hex characters");
                signatures.Add(Convert.FromHexString(value));
            }
        }
        if (ts is null) throw new WebhookException(WebhookErrorKind.Malformed, "malformed: missing t");
        if (signatures.Count == 0) throw new WebhookException(WebhookErrorKind.Malformed, "malformed: missing v1");
        byte[] expected = Mac(secret, ts, body);
        bool match = false;
        foreach (byte[] sig in signatures) match |= CryptographicOperations.FixedTimeEquals(expected, sig);
        if (!match) throw new WebhookException(WebhookErrorKind.BadSignature, "bad signature");
        long t = long.Parse(ts, NumberStyles.None, CultureInfo.InvariantCulture);
        if (Math.Abs((decimal)nowSeconds - t) > toleranceSeconds) throw new WebhookException(WebhookErrorKind.Expired, "expired");
    }

    private static byte[] Mac(string secret, string ts, string body) =>
        HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(ts + "." + body));

    private static void CheckSecret(string secret) {
        if (string.IsNullOrEmpty(secret)) throw new ArgumentException("secret must be non-empty", nameof(secret));
    }
}
