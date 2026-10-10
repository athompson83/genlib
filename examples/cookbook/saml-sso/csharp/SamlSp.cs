// SPDX-License-Identifier: Apache-2.0
using System.Collections.Specialized;
using System.Security.Cryptography.X509Certificates;
using ITfoxtec.Identity.Saml2;
using ITfoxtec.Identity.Saml2.Schemas;
using Saml2Http = ITfoxtec.Identity.Saml2.Http.HttpRequest;

namespace Cookbook.Saml;

/// <summary>
/// Thin SP wrapper around ITfoxtec.Identity.Saml2. ITfoxtec (with Microsoft.IdentityModel.Tokens.Saml)
/// validates the XML signature against the pinned IdP certificates, Issuer (AllowedIssuer),
/// Audience (AllowedAudienceUris), Conditions and SubjectConfirmationData NotOnOrAfter, and
/// and assertion replay when given an ITokenReplayCache (none is built in on .NET Core; a small
/// in-memory one is supplied below - use a shared store when running more than one instance).
/// It does NOT check Response Destination, SubjectConfirmationData Recipient or InResponseTo
/// against the request you sent, so this wrapper does that from the validated assertion.
/// </summary>
public sealed class SamlSp
{
    private readonly Saml2Configuration _config;
    private readonly Uri _acs;

    public SamlSp(string spEntityId, Uri acsUrl, string idpEntityId, Uri idpSsoUrl, IEnumerable<X509Certificate2> idpSigningCerts,
        Microsoft.IdentityModel.Tokens.ITokenReplayCache? replayCache = null)
    {
        _acs = acsUrl;
        _config = new Saml2Configuration
        {
            Issuer = spEntityId,
            SingleSignOnDestination = idpSsoUrl,
            AllowedIssuer = idpEntityId,
            // Pin the IdP certificates from metadata instead of chain-building (IdP certs are usually self-signed).
            CertificateValidationMode = System.ServiceModel.Security.X509CertificateValidationMode.None,
            RevocationMode = X509RevocationMode.NoCheck,
            DetectReplayedTokens = true,
            TokenReplayCache = replayCache ?? new InMemoryReplayCache(),
        };
        _config.AllowedAudienceUris.Add(spEntityId);
        _config.SignatureValidationCertificates.AddRange(idpSigningCerts);
        if (_config.SignatureValidationCertificates.Count == 0) throw new ArgumentException("IdP signing certificate required");
    }

    /// <summary>Returns the redirect URL and the AuthnRequest ID to store server-side.</summary>
    public (Uri RedirectUrl, string RequestId) LoginRedirect(string relayState)
    {
        var req = new Saml2AuthnRequest(_config) { AssertionConsumerServiceUrl = _acs };
        var binding = new Saml2RedirectBinding { RelayState = relayState };
        binding.Bind(req);
        return (binding.RedirectLocation, req.Id.Value);
    }

    /// <summary>Validates a POSTed base64 SAMLResponse. <paramref name="pendingRequestId"/> is removed from the session (one-time).</summary>
    public Saml2AuthnResponse Validate(string samlResponseB64, string? pendingRequestId)
    {
        if (string.IsNullOrEmpty(pendingRequestId)) throw new Saml2RequestException("no pending AuthnRequest (unsolicited or replayed)");
        var request = new Saml2Http { Method = "POST", Form = new NameValueCollection { ["SAMLResponse"] = samlResponseB64 }, Query = new NameValueCollection() };
        var response = new Saml2AuthnResponse(_config);
        new Saml2PostBinding().Unbind(request, response); // signature, issuer, audience, lifetimes, replay
        if (response.Status != Saml2StatusCodes.Success) throw new Saml2RequestException($"IdP status {response.Status}");

        if (response.Destination is not null && response.Destination != _acs)
            throw new Saml2RequestException($"Destination mismatch: {response.Destination}");
        // Recipient / InResponseTo come from the signed assertion, not the (possibly unsigned) Response envelope.
        var confirmations = response.Saml2SecurityToken.Assertion.Subject.SubjectConfirmations
            .Where(c => c.Method == Saml2Constants.Saml2BearerToken && c.SubjectConfirmationData is not null).ToList();
        if (!confirmations.Any(c => c.SubjectConfirmationData.Recipient == _acs))
            throw new Saml2RequestException("SubjectConfirmationData Recipient missing or mismatched");
        if (!confirmations.Any(c => c.SubjectConfirmationData.InResponseTo?.Value == pendingRequestId))
            throw new Saml2RequestException("InResponseTo does not match the pending AuthnRequest");
        return response;
    }
}

/// <summary>Single-process replay cache (assertion string until its NotOnOrAfter).</summary>
public sealed class InMemoryReplayCache : Microsoft.IdentityModel.Tokens.ITokenReplayCache
{
    private readonly System.Collections.Concurrent.ConcurrentDictionary<string, DateTime> _seen = new();

    public bool TryAdd(string securityToken, DateTime expiresOn)
    {
        var now = DateTime.UtcNow;
        foreach (var kv in _seen) if (kv.Value < now) _seen.TryRemove(kv.Key, out _);
        return _seen.TryAdd(securityToken, expiresOn);
    }

    public bool TryFind(string securityToken) => _seen.ContainsKey(securityToken);
}
