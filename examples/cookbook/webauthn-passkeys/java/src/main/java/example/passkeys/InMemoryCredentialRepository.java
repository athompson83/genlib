// SPDX-License-Identifier: Apache-2.0
package example.passkeys;

import com.yubico.webauthn.CredentialRepository;
import com.yubico.webauthn.RegisteredCredential;
import com.yubico.webauthn.data.ByteArray;
import com.yubico.webauthn.data.PublicKeyCredentialDescriptor;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * Example storage. Replace with database tables keyed by credential id
 * (unique) and user handle; the columns are exactly RegisteredCredential's
 * fields: credentialId, userHandle, publicKeyCose, signatureCount, backup flags.
 */
public final class InMemoryCredentialRepository implements CredentialRepository {
  private final Map<String, ByteArray> handleByUsername = new ConcurrentHashMap<>();
  private final Map<ByteArray, RegisteredCredential> byId = new ConcurrentHashMap<>();

  public void addUser(String username, ByteArray userHandle) {
    handleByUsername.put(username, userHandle);
  }

  /** Stores or replaces a credential. Refuse ids already owned by another user. */
  public void save(RegisteredCredential credential) {
    RegisteredCredential existing = byId.get(credential.getCredentialId());
    if (existing != null && !existing.getUserHandle().equals(credential.getUserHandle())) {
      throw new IllegalStateException("credential id already registered to another account");
    }
    byId.put(credential.getCredentialId(), credential);
  }

  public Optional<RegisteredCredential> get(ByteArray credentialId) {
    return Optional.ofNullable(byId.get(credentialId));
  }

  @Override
  public Set<PublicKeyCredentialDescriptor> getCredentialIdsForUsername(String username) {
    ByteArray handle = handleByUsername.get(username);
    return byId.values().stream()
        .filter(c -> c.getUserHandle().equals(handle))
        .map(c -> PublicKeyCredentialDescriptor.builder().id(c.getCredentialId()).transports(c.getTransports()).build())
        .collect(Collectors.toSet());
  }

  @Override
  public Optional<ByteArray> getUserHandleForUsername(String username) {
    return Optional.ofNullable(handleByUsername.get(username));
  }

  @Override
  public Optional<String> getUsernameForUserHandle(ByteArray userHandle) {
    return handleByUsername.entrySet().stream().filter(e -> e.getValue().equals(userHandle)).map(Map.Entry::getKey).findFirst();
  }

  @Override
  public Optional<RegisteredCredential> lookup(ByteArray credentialId, ByteArray userHandle) {
    return get(credentialId).filter(c -> c.getUserHandle().equals(userHandle));
  }

  @Override
  public Set<RegisteredCredential> lookupAll(ByteArray credentialId) {
    return get(credentialId).map(Set::of).orElse(Set.of());
  }
}
