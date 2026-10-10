// SPDX-License-Identifier: Apache-2.0
package example.passkeys

import com.yubico.webauthn.AssertionRequest
import com.yubico.webauthn.AssertionResult
import com.yubico.webauthn.CredentialRepository
import com.yubico.webauthn.FinishAssertionOptions
import com.yubico.webauthn.FinishRegistrationOptions
import com.yubico.webauthn.RegisteredCredential
import com.yubico.webauthn.RelyingParty
import com.yubico.webauthn.StartAssertionOptions
import com.yubico.webauthn.StartRegistrationOptions
import com.yubico.webauthn.data.AuthenticatorSelectionCriteria
import com.yubico.webauthn.data.ByteArray
import com.yubico.webauthn.data.PublicKeyCredential
import com.yubico.webauthn.data.PublicKeyCredentialCreationOptions
import com.yubico.webauthn.data.PublicKeyCredentialDescriptor
import com.yubico.webauthn.data.RelyingPartyIdentity
import com.yubico.webauthn.data.ResidentKeyRequirement
import com.yubico.webauthn.data.UserIdentity
import com.yubico.webauthn.data.UserVerificationRequirement
import com.yubico.webauthn.exception.AssertionFailedException
import com.yubico.webauthn.exception.RegistrationFailedException
import java.util.Optional
import java.util.concurrent.ConcurrentHashMap

/** Example storage; back it with tables keyed by credential id (unique) and user handle. */
class InMemoryCredentialRepository : CredentialRepository {
    private val handles = ConcurrentHashMap<String, ByteArray>()
    private val byId = ConcurrentHashMap<ByteArray, RegisteredCredential>()

    fun addUser(username: String, handle: ByteArray) { handles[username] = handle }

    fun save(c: RegisteredCredential) {
        val existing = byId[c.credentialId]
        check(existing == null || existing.userHandle == c.userHandle) { "credential id belongs to another account" }
        byId[c.credentialId] = c
    }

    fun get(id: ByteArray): RegisteredCredential? = byId[id]

    override fun getCredentialIdsForUsername(username: String): Set<PublicKeyCredentialDescriptor> =
        byId.values.filter { it.userHandle == handles[username] }
            .map { PublicKeyCredentialDescriptor.builder().id(it.credentialId).transports(it.transports).build() }.toSet()

    override fun getUserHandleForUsername(username: String): Optional<ByteArray> = Optional.ofNullable(handles[username])

    override fun getUsernameForUserHandle(userHandle: ByteArray): Optional<String> =
        Optional.ofNullable(handles.entries.firstOrNull { it.value == userHandle }?.key)

    override fun lookup(credentialId: ByteArray, userHandle: ByteArray): Optional<RegisteredCredential> =
        Optional.ofNullable(byId[credentialId]?.takeIf { it.userHandle == userHandle })

    override fun lookupAll(credentialId: ByteArray): Set<RegisteredCredential> = setOfNotNull(byId[credentialId])
}

/**
 * Thin passkey relying party over Yubico java-webauthn-server. Keep request
 * objects server-side between start and finish (toJson()/fromJson()).
 */
class Passkeys(rpId: String, rpName: String, origins: Set<String>, private val repo: InMemoryCredentialRepository) {
    private val rp: RelyingParty = RelyingParty.builder()
        .identity(RelyingPartyIdentity.builder().id(rpId).name(rpName).build())
        .credentialRepository(repo)
        .origins(origins)
        .validateSignatureCounter(true)
        .build()

    fun registrationOptions(userHandle: ByteArray, username: String): PublicKeyCredentialCreationOptions {
        repo.addUser(username, userHandle)
        return rp.startRegistration(
            StartRegistrationOptions.builder()
                .user(UserIdentity.builder().name(username).displayName(username).id(userHandle).build())
                .authenticatorSelection(
                    AuthenticatorSelectionCriteria.builder()
                        .residentKey(ResidentKeyRequirement.REQUIRED)
                        .userVerification(UserVerificationRequirement.REQUIRED)
                        .build(),
                )
                .build(),
        )
    }

    fun verifyRegistration(request: PublicKeyCredentialCreationOptions, responseJson: String): RegisteredCredential {
        val r = rp.finishRegistration(
            FinishRegistrationOptions.builder()
                .request(request)
                .response(PublicKeyCredential.parseRegistrationResponseJson(responseJson))
                .build(),
        )
        if (!r.isUserVerified) throw RegistrationFailedException(IllegalArgumentException("user not verified"))
        return RegisteredCredential.builder()
            .credentialId(r.keyId.id)
            .userHandle(request.user.id)
            .publicKeyCose(r.publicKeyCose)
            .signatureCount(r.signatureCount)
            .transports(r.keyId.transports.orElse(null))
            .backupEligible(r.isBackupEligible)
            .backupState(r.isBackedUp)
            .build()
            .also(repo::save)
    }

    fun authenticationOptions(): AssertionRequest =
        rp.startAssertion(StartAssertionOptions.builder().userVerification(UserVerificationRequirement.REQUIRED).build())

    fun verifyAuthentication(request: AssertionRequest, responseJson: String): AssertionResult {
        val r = rp.finishAssertion(
            FinishAssertionOptions.builder()
                .request(request)
                .response(PublicKeyCredential.parseAssertionResponseJson(responseJson))
                .build(),
        )
        if (!r.isSuccess || !r.isUserVerified) throw AssertionFailedException("assertion not verified")
        repo.save(r.credential.toBuilder().signatureCount(r.signatureCount).backupState(r.isBackedUp).build())
        return r
    }
}
