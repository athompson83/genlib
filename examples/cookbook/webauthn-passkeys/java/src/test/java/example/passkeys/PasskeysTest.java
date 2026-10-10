// SPDX-License-Identifier: Apache-2.0
package example.passkeys;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.yubico.webauthn.AssertionRequest;
import com.yubico.webauthn.RegisteredCredential;
import com.yubico.webauthn.data.ByteArray;
import com.yubico.webauthn.data.PublicKeyCredentialCreationOptions;
import com.yubico.webauthn.exception.AssertionFailedException;
import com.yubico.webauthn.exception.RegistrationFailedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class PasskeysTest {
  static final ObjectMapper JSON = new ObjectMapper();
  JsonNode fx;
  InMemoryCredentialRepository repo;
  Passkeys passkeys;
  ByteArray userHandle;

  @BeforeEach
  void setUp() throws Exception {
    fx = JSON.readTree(Files.readString(Path.of("../fixtures/passkey-es256-none.json")));
    repo = new InMemoryCredentialRepository();
    passkeys = new Passkeys(fx.get("rpId").asText(), "Example", Set.of(fx.get("origin").asText()), repo);
    userHandle = ByteArray.fromBase64Url(fx.get("userId").asText());
  }

  /** The recorded response answers a fixed challenge; swap it into a genuinely generated request. */
  PublicKeyCredentialCreationOptions recordedRegistrationRequest(Passkeys p) throws Exception {
    return p.registrationOptions(userHandle, "alice@example.com").toBuilder()
        .challenge(ByteArray.fromBase64Url(fx.get("registrationChallenge").asText())).build();
  }

  AssertionRequest recordedAssertionRequest() throws Exception {
    AssertionRequest req = passkeys.authenticationOptions();
    return req.toBuilder().publicKeyCredentialRequestOptions(req.getPublicKeyCredentialRequestOptions().toBuilder()
        .challenge(ByteArray.fromBase64Url(fx.get("authenticationChallenge").asText())).build()).build();
  }

  @Test
  void options() throws Exception {
    PublicKeyCredentialCreationOptions a = passkeys.registrationOptions(userHandle, "alice@example.com");
    PublicKeyCredentialCreationOptions b = passkeys.registrationOptions(userHandle, "alice@example.com");
    JsonNode json = JSON.readTree(a.toCredentialsCreateJson()).get("publicKey");
    assertEquals("example.com", json.get("rp").get("id").asText());
    assertEquals(fx.get("userId").asText(), json.get("user").get("id").asText());
    assertEquals("required", json.get("authenticatorSelection").get("residentKey").asText());
    assertEquals("required", json.get("authenticatorSelection").get("userVerification").asText());
    assertNotEquals(a.getChallenge(), b.getChallenge());
    assertTrue(a.getChallenge().size() >= 16);
    // Request state survives a JSON round-trip (for a session store).
    assertEquals(a, PublicKeyCredentialCreationOptions.fromJson(a.toJson()));
    JsonNode get = JSON.readTree(passkeys.authenticationOptions().toCredentialsGetJson()).get("publicKey");
    assertEquals("example.com", get.get("rpId").asText());
    assertEquals("required", get.get("userVerification").asText());
  }

  @Test
  void recordedCeremony() throws Exception {
    RegisteredCredential cred = passkeys.verifyRegistration(recordedRegistrationRequest(passkeys), fx.get("registrationResponse").toString());
    assertEquals(fx.get("credentialId").asText(), cred.getCredentialId().getBase64Url());
    assertEquals(fx.get("credentialPublicKeyCose").asText(), cred.getPublicKeyCose().getBase64Url());
    assertEquals(0, cred.getSignatureCount());
    var result = passkeys.verifyAuthentication(recordedAssertionRequest(), fx.get("authenticationResponse").toString());
    assertEquals("alice@example.com", result.getUsername());
    assertEquals(fx.get("expectedSignCountAfterAuthentication").asLong(), repo.get(cred.getCredentialId()).orElseThrow().getSignatureCount());
  }

  @Test
  void rejections() throws Exception {
    assertThrows(RegistrationFailedException.class, () ->
        passkeys.verifyRegistration(passkeys.registrationOptions(userHandle, "alice@example.com"), fx.get("registrationResponse").toString()));
    Passkeys evil = new Passkeys("example.com", "Example", Set.of("https://evil.example"), new InMemoryCredentialRepository());
    assertThrows(RegistrationFailedException.class, () ->
        evil.verifyRegistration(recordedRegistrationRequest(evil), fx.get("registrationResponse").toString()));

    RegisteredCredential cred = passkeys.verifyRegistration(recordedRegistrationRequest(passkeys), fx.get("registrationResponse").toString());
    assertThrows(AssertionFailedException.class, () ->
        passkeys.verifyAuthentication(passkeys.authenticationOptions(), fx.get("authenticationResponse").toString()));
    repo.save(cred.toBuilder().signatureCount(5).build()); // stored counter ahead: possible clone
    assertThrows(AssertionFailedException.class, () ->
        passkeys.verifyAuthentication(recordedAssertionRequest(), fx.get("authenticationResponse").toString()));
  }
}
