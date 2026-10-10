// SPDX-License-Identifier: Apache-2.0
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace Cookbook.Oidc;

/// <summary>
/// Thin wrapper around Microsoft.IdentityModel. ConfigurationManager fetches the discovery
/// document + JWKS, caches it and refreshes it (rate limited by RefreshInterval) when the handler
/// reports an unknown kid. JsonWebTokenHandler validates signature, alg allow-list, iss, aud,
/// exp/nbf with ClockSkew. This class fixes the policy and adds the nonce check.
/// </summary>
public sealed class OidcVerifier
{
    private readonly JsonWebTokenHandler _handler = new();
    private readonly TokenValidationParameters _tvp;

    public OidcVerifier(string issuer, string audience, string discoveryUrl, TimeSpan clockSkew,
        TimeSpan? minRefreshInterval = null, bool requireHttps = true, IEnumerable<string>? algorithms = null)
    {
        var algs = (algorithms ?? new[] { SecurityAlgorithms.RsaSha256, SecurityAlgorithms.EcdsaSha256 }).ToArray();
        if (algs.Any(a => a.StartsWith("HS", StringComparison.OrdinalIgnoreCase) || a.Contains("hmac", StringComparison.OrdinalIgnoreCase) || a == "none"))
            throw new ArgumentException("symmetric or 'none' algorithms are not allowed with a public JWKS");
        var config = new ConfigurationManager<OpenIdConnectConfiguration>(
            discoveryUrl, new OpenIdConnectConfigurationRetriever(), new HttpDocumentRetriever { RequireHttps = requireHttps })
        {
            RefreshInterval = minRefreshInterval ?? TimeSpan.FromMinutes(5), // min gap between kid-miss refreshes
        };
        _tvp = new TokenValidationParameters
        {
            ConfigurationManager = config,
            ValidIssuer = issuer,
            ValidAudience = audience,
            ValidAlgorithms = algs,
            ClockSkew = clockSkew,
            RequireExpirationTime = true,
            RequireSignedTokens = true,
            ValidateIssuerSigningKey = true,
        };
    }

    /// <returns>claims on success; throws SecurityTokenException on failure.</returns>
    public async Task<IDictionary<string, object>> VerifyAsync(string token, string? expectedNonce = null)
    {
        var result = await _handler.ValidateTokenAsync(token, _tvp);
        if (!result.IsValid)
            throw result.Exception as SecurityTokenException ?? new SecurityTokenException("invalid token", result.Exception);
        // nonce binds an ID token to the authorization request (OIDC Core 3.1.3.7)
        if (expectedNonce is not null && (!result.Claims.TryGetValue("nonce", out var n) || n as string != expectedNonce))
            throw new SecurityTokenException("nonce mismatch");
        return result.Claims;
    }
}
