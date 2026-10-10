// SPDX-License-Identifier: Apache-2.0
using System.Text.Json;
using Fido2NetLib;
using Fido2NetLib.Objects;

namespace Cookbook.Passkeys;

/// <summary>Row to persist per credential. Credential id must be unique across all users.</summary>
public sealed record StoredCredential(byte[] CredentialId, byte[] UserHandle, byte[] PublicKeyCose,
    uint SignCount, AuthenticatorTransport[]? Transports, bool BackedUp);

/// <summary>
/// Thin passkey relying party over fido2-net-lib. The library performs all
/// protocol checks. Keep the options objects server-side between the two steps
/// (they serialise with ToJson()/FromJson()).
/// </summary>
public sealed class PasskeyService(string rpId, string rpName, IEnumerable<string> origins)
{
    private readonly Fido2 _fido2 = new(new Fido2Configuration
    {
        RPID = rpId,
        RPName = rpName,
        Origins = new HashSet<string>(origins),
    });

    public CredentialCreateOptions RegistrationOptions(byte[] userHandle, string userName, IEnumerable<StoredCredential> existing) =>
        _fido2.RequestNewCredential(new RequestNewCredentialParams
        {
            User = new Fido2User { Id = userHandle, Name = userName, DisplayName = userName },
            ExcludeCredentials = existing.Select(c => new PublicKeyCredentialDescriptor(PublicKeyCredentialType.PublicKey, c.CredentialId, c.Transports)).ToList(),
            AuthenticatorSelection = new AuthenticatorSelection
            {
                ResidentKey = ResidentKeyRequirement.Required,
                UserVerification = UserVerificationRequirement.Required,
            },
            AttestationPreference = AttestationConveyancePreference.None,
        });

    /// <param name="isIdUnused">Return false when the credential id is already stored for any user.</param>
    public async Task<StoredCredential> VerifyRegistrationAsync(CredentialCreateOptions options, string responseJson,
        Func<byte[], Task<bool>> isIdUnused, CancellationToken ct = default)
    {
        var response = JsonSerializer.Deserialize<AuthenticatorAttestationRawResponse>(responseJson)
            ?? throw new Fido2VerificationException("empty response");
        var cred = await _fido2.MakeNewCredentialAsync(new MakeNewCredentialParams
        {
            AttestationResponse = response,
            OriginalOptions = options,
            IsCredentialIdUniqueToUserCallback = (p, _) => isIdUnused(p.CredentialId),
        }, ct);
        return new StoredCredential(cred.Id, options.User.Id, cred.PublicKey, cred.SignCount, cred.Transports, cred.IsBackedUp);
    }

    /// <summary>Usernameless sign-in when <paramref name="allowed"/> is empty.</summary>
    public AssertionOptions AuthenticationOptions(IEnumerable<StoredCredential> allowed) =>
        _fido2.GetAssertionOptions(new GetAssertionOptionsParams
        {
            AllowedCredentials = allowed.Select(c => new PublicKeyCredentialDescriptor(PublicKeyCredentialType.PublicKey, c.CredentialId, c.Transports)).ToList(),
            UserVerification = UserVerificationRequirement.Required,
        });

    /// <summary>Verify an assertion against the stored row (look it up by the response id first). Persist the result.</summary>
    public async Task<StoredCredential> VerifyAuthenticationAsync(AssertionOptions options, string responseJson,
        StoredCredential stored, CancellationToken ct = default)
    {
        var response = JsonSerializer.Deserialize<AuthenticatorAssertionRawResponse>(responseJson)
            ?? throw new Fido2VerificationException("empty response");
        if (!response.RawId.AsSpan().SequenceEqual(stored.CredentialId)) throw new Fido2VerificationException("credential id mismatch");
        var result = await _fido2.MakeAssertionAsync(new MakeAssertionParams
        {
            AssertionResponse = response,
            OriginalOptions = options,
            StoredPublicKey = stored.PublicKeyCose,
            StoredSignatureCounter = stored.SignCount,
            IsUserHandleOwnerOfCredentialIdCallback = (p, _) =>
                Task.FromResult(p.UserHandle.AsSpan().SequenceEqual(stored.UserHandle) && p.CredentialId.AsSpan().SequenceEqual(stored.CredentialId)),
        }, ct);
        return stored with { SignCount = result.SignCount, BackedUp = result.IsBackedUp };
    }
}
