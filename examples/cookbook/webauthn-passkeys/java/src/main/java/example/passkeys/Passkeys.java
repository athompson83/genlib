// SPDX-License-Identifier: Apache-2.0
package example.passkeys;

import com.yubico.webauthn.AssertionRequest;
import com.yubico.webauthn.AssertionResult;
import com.yubico.webauthn.FinishAssertionOptions;
import com.yubico.webauthn.FinishRegistrationOptions;
import com.yubico.webauthn.RegisteredCredential;
import com.yubico.webauthn.RegistrationResult;
import com.yubico.webauthn.RelyingParty;
import com.yubico.webauthn.StartAssertionOptions;
import com.yubico.webauthn.StartRegistrationOptions;
import com.yubico.webauthn.data.AuthenticatorSelectionCriteria;
import com.yubico.webauthn.data.ByteArray;
import com.yubico.webauthn.data.PublicKeyCredential;
import com.yubico.webauthn.data.PublicKeyCredentialCreationOptions;
import com.yubico.webauthn.data.RelyingPartyIdentity;
import com.yubico.webauthn.data.ResidentKeyRequirement;
import com.yubico.webauthn.data.UserIdentity;
import com.yubico.webauthn.data.UserVerificationRequirement;
import com.yubico.webauthn.exception.AssertionFailedException;
import com.yubico.webauthn.exception.RegistrationFailedException;
import java.io.IOException;
import java.util.Set;

/**
 * Thin passkey relying party over Yubico java-webauthn-server. The library
 * performs all protocol checks. Keep the request objects server-side between
 * start and finish (they serialise with toJson()/fromJson()).
 */
public final class Passkeys {
  private final RelyingParty rp;
  private final InMemoryCredentialRepository repo;

  public Passkeys(String rpId, String rpName, Set<String> origins, InMemoryCredentialRepository repo) {
    this.repo = repo;
    this.rp = RelyingParty.builder()
        .identity(RelyingPartyIdentity.builder().id(rpId).name(rpName).build())
        .credentialRepository(repo)
        .origins(origins)
        .validateSignatureCounter(true) // throw on a non-increasing non-zero counter
        .build();
  }

  /** Send {@code request.toCredentialsCreateJson()} to the browser; store {@code request.toJson()}. */
  public PublicKeyCredentialCreationOptions registrationOptions(ByteArray userHandle, String username) {
    repo.addUser(username, userHandle);
    return rp.startRegistration(StartRegistrationOptions.builder()
        .user(UserIdentity.builder().name(username).displayName(username).id(userHandle).build())
        .authenticatorSelection(AuthenticatorSelectionCriteria.builder()
            .residentKey(ResidentKeyRequirement.REQUIRED)
            .userVerification(UserVerificationRequirement.REQUIRED)
            .build())
        .build());
  }

  public RegisteredCredential verifyRegistration(PublicKeyCredentialCreationOptions request, String responseJson)
      throws IOException, RegistrationFailedException {
    RegistrationResult r = rp.finishRegistration(FinishRegistrationOptions.builder()
        .request(request)
        .response(PublicKeyCredential.parseRegistrationResponseJson(responseJson))
        .build());
    if (!r.isUserVerified()) throw new RegistrationFailedException(new IllegalArgumentException("user not verified"));
    RegisteredCredential cred = RegisteredCredential.builder()
        .credentialId(r.getKeyId().getId())
        .userHandle(request.getUser().getId())
        .publicKeyCose(r.getPublicKeyCose())
        .signatureCount(r.getSignatureCount())
        .transports(r.getKeyId().getTransports().orElse(null))
        .backupEligible(r.isBackupEligible())
        .backupState(r.isBackedUp())
        .build();
    repo.save(cred);
    return cred;
  }

  /** Usernameless (discoverable) sign-in. Send toCredentialsGetJson(); store toJson(). */
  public AssertionRequest authenticationOptions() {
    return rp.startAssertion(StartAssertionOptions.builder().userVerification(UserVerificationRequirement.REQUIRED).build());
  }

  /** Verifies the assertion and persists the new signature count. */
  public AssertionResult verifyAuthentication(AssertionRequest request, String responseJson)
      throws IOException, AssertionFailedException {
    AssertionResult r = rp.finishAssertion(FinishAssertionOptions.builder()
        .request(request)
        .response(PublicKeyCredential.parseAssertionResponseJson(responseJson))
        .build());
    if (!r.isSuccess() || !r.isUserVerified()) throw new AssertionFailedException("assertion not verified");
    repo.save(r.getCredential().toBuilder().signatureCount(r.getSignatureCount()).backupState(r.isBackedUp()).build());
    return r;
  }
}
