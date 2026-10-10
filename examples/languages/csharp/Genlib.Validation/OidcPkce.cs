// SPDX-License-Identifier: Apache-2.0
// Scope: builds and checks the browser leg of OAuth 2.0 authorization code + PKCE (OIDC) only.
// ID token and access token VERIFICATION must use a vetted library (see the Tier B cookbook).
// Never decode a token to make an auth decision here.
using System.Security.Cryptography;
using System.Text;

namespace Genlib.Validation;

/// <summary>Error returned by the authorization server or detected while checking the callback.</summary>
public sealed class OidcCallbackException : Exception {
    public string Error { get; }
    public string? ErrorDescription { get; }
    public OidcCallbackException(string error, string? description = null)
        : base(description is null ? error : $"{error}: {description}") { Error = error; ErrorDescription = description; }
}

public sealed record AuthorizationRequest(
    string AuthorizationEndpoint, string ClientId, string RedirectUri, IReadOnlyList<string> Scope,
    string State, string Nonce, string CodeChallenge, IReadOnlyList<KeyValuePair<string, string>>? ExtraParams = null);

public static class OidcPkce {
    private const string Unreserved = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

    /// <summary>Creates an RFC 7636 code verifier of 43-128 unreserved characters (unbiased CSPRNG selection).</summary>
    public static string GenerateCodeVerifier(int length = 64) {
        if (length < 43 || length > 128) throw new ArgumentOutOfRangeException(nameof(length), "verifier length must be 43-128");
        var chars = new char[length];
        int limit = 256 - 256 % Unreserved.Length;
        Span<byte> one = stackalloc byte[1];
        for (int i = 0; i < length;) {
            RandomNumberGenerator.Fill(one);
            if (one[0] < limit) chars[i++] = Unreserved[one[0] % Unreserved.Length];
        }
        return new string(chars);
    }

    /// <summary>base64url(SHA-256(ASCII verifier)) without padding.</summary>
    public static string CodeChallengeS256(string verifier) {
        ArgumentNullException.ThrowIfNull(verifier);
        if (verifier.Length < 43 || verifier.Length > 128 || verifier.Any(c => Unreserved.IndexOf(c) < 0))
            throw new ArgumentException("verifier must be 43-128 unreserved characters", nameof(verifier));
        return Base64Url(SHA256.HashData(Encoding.ASCII.GetBytes(verifier)));
    }

    /// <summary>Random base64url token (no padding) for state and nonce values.</summary>
    public static string RandomToken(int bytes = 32) {
        if (bytes < 16 || bytes > 256) throw new ArgumentOutOfRangeException(nameof(bytes), "token must be 16-256 bytes");
        return Base64Url(RandomNumberGenerator.GetBytes(bytes));
    }

    /// <summary>Splits a space-separated scope string into a list.</summary>
    public static IReadOnlyList<string> ParseScope(string scope) => scope.Split(' ', StringSplitOptions.RemoveEmptyEntries);

    public static string BuildAuthorizationUrl(AuthorizationRequest request) {
        ArgumentNullException.ThrowIfNull(request);
        string endpoint = request.AuthorizationEndpoint ?? throw new ArgumentException("authorizationEndpoint is required");
        if (!Uri.TryCreate(endpoint, UriKind.Absolute, out var uri) || endpoint.Contains('#'))
            throw new ArgumentException("authorizationEndpoint must be an absolute URL without fragment");
        bool loopback = uri.Scheme == "http" && (uri.Host == "localhost" || uri.Host == "127.0.0.1");
        if (uri.Scheme != "https" && !loopback)
            throw new ArgumentException("authorizationEndpoint must use https (http only for localhost/127.0.0.1)");
        Require(request.ClientId, "clientId"); Require(request.RedirectUri, "redirectUri");
        Require(request.State, "state"); Require(request.Nonce, "nonce"); Require(request.CodeChallenge, "codeChallenge");
        var scopes = request.Scope.SelectMany(s => ParseScope(s)).ToList();
        if (!scopes.Contains("openid")) throw new ArgumentException("scope must contain openid");
        var parts = new List<(string, string)> {
            ("response_type", "code"), ("client_id", request.ClientId), ("redirect_uri", request.RedirectUri),
            ("scope", string.Join(' ', scopes)), ("state", request.State), ("nonce", request.Nonce),
            ("code_challenge", request.CodeChallenge), ("code_challenge_method", "S256"),
        };
        foreach (var kv in request.ExtraParams ?? Array.Empty<KeyValuePair<string, string>>()) {
            Require(kv.Key, "extra parameter name");
            if (parts.Any(p => p.Item1 == kv.Key)) throw new ArgumentException($"extra parameter '{kv.Key}' would override a protocol parameter");
            parts.Add((kv.Key, kv.Value ?? ""));
        }
        string query = string.Join('&', parts.Select(p => Totp.PercentEncode(p.Item1) + "=" + Totp.PercentEncode(p.Item2)));
        string separator = !endpoint.Contains('?') ? "?" : (endpoint.EndsWith('?') || endpoint.EndsWith('&')) ? "" : "&";
        return endpoint + separator + query;
    }

    /// <summary>Returns the authorization code after checking error, code presence and state (constant time).</summary>
    public static string ParseCallback(string callbackUrl, string expectedState) {
        ArgumentNullException.ThrowIfNull(callbackUrl);
        if (string.IsNullOrEmpty(expectedState)) throw new ArgumentException("expectedState is required", nameof(expectedState));
        string query = callbackUrl;
        int hash = query.IndexOf('#'); if (hash >= 0) query = query[..hash];
        int q = query.IndexOf('?');
        query = q >= 0 ? query[(q + 1)..] : "";
        var values = new Dictionary<string, string>();
        foreach (var pair in query.Split('&', StringSplitOptions.RemoveEmptyEntries)) {
            int eq = pair.IndexOf('=');
            string key = FormDecode(eq >= 0 ? pair[..eq] : pair), value = FormDecode(eq >= 0 ? pair[(eq + 1)..] : "");
            if (!values.TryAdd(key, value)) throw new OidcCallbackException("invalid_callback", $"duplicate parameter '{key}'");
        }
        if (values.TryGetValue("error", out var error))
            throw new OidcCallbackException(error, values.TryGetValue("error_description", out var d) ? d : null);
        if (!values.TryGetValue("code", out var code) || code.Length == 0) throw new OidcCallbackException("missing_code");
        byte[] actual = Encoding.UTF8.GetBytes(values.TryGetValue("state", out var s) ? s : "");
        if (!CryptographicOperations.FixedTimeEquals(actual, Encoding.UTF8.GetBytes(expectedState)))
            throw new OidcCallbackException("state_mismatch");
        return code;
    }

    /// <summary>application/x-www-form-urlencoded body for the token request.</summary>
    public static string TokenRequestBody(string code, string redirectUri, string clientId, string codeVerifier) {
        Require(code, "code"); Require(redirectUri, "redirectUri"); Require(clientId, "clientId"); Require(codeVerifier, "codeVerifier");
        return "grant_type=authorization_code&code=" + Totp.PercentEncode(code, true)
            + "&redirect_uri=" + Totp.PercentEncode(redirectUri, true)
            + "&client_id=" + Totp.PercentEncode(clientId, true)
            + "&code_verifier=" + Totp.PercentEncode(codeVerifier, true);
    }

    private static void Require(string? value, string name) {
        if (string.IsNullOrEmpty(value)) throw new ArgumentException($"{name} is required");
    }

    private static string Base64Url(byte[] data) => Convert.ToBase64String(data).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static string FormDecode(string value) {
        try { return Uri.UnescapeDataString(value.Replace('+', ' ')); }
        catch (UriFormatException) { throw new OidcCallbackException("invalid_callback", "malformed percent-encoding"); }
    }
}
