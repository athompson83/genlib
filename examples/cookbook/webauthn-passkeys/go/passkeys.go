// SPDX-License-Identifier: Apache-2.0

// Package passkeys is a thin relying-party wrapper over go-webauthn/webauthn.
// The library performs all protocol checks. Persist webauthn.SessionData
// server-side between Begin* and Finish*, and persist each webauthn.Credential
// (ID, PublicKey, Authenticator.SignCount, Flags, Transport) per account.
package passkeys

import (
	"errors"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
)

// Account is a minimal webauthn.User. ID must be a random, stable handle (<= 64 bytes).
type Account struct {
	ID          []byte
	Name        string
	Credentials []webauthn.Credential
}

func (a *Account) WebAuthnID() []byte                         { return a.ID }
func (a *Account) WebAuthnName() string                       { return a.Name }
func (a *Account) WebAuthnDisplayName() string                { return a.Name }
func (a *Account) WebAuthnCredentials() []webauthn.Credential { return a.Credentials }

var ErrPossibleClone = errors.New("passkeys: sign count did not increase; possible cloned authenticator")

type RP struct{ w *webauthn.WebAuthn }

// New validates the configuration (rpID must be a registrable suffix of each origin's host).
func New(rpID, rpName string, origins []string) (*RP, error) {
	if rpID == "" {
		return nil, errors.New("passkeys: rpID is required")
	}
	w, err := webauthn.New(&webauthn.Config{RPID: rpID, RPDisplayName: rpName, RPOrigins: origins})
	if err != nil {
		return nil, err
	}
	return &RP{w: w}, nil
}

// RegistrationOptions returns JSON-serialisable options for navigator.credentials.create
// and the session to store server-side.
func (rp *RP) RegistrationOptions(a *Account) (*protocol.CredentialCreation, *webauthn.SessionData, error) {
	return rp.w.BeginRegistration(a,
		webauthn.WithAuthenticatorSelection(protocol.AuthenticatorSelection{
			ResidentKey:      protocol.ResidentKeyRequirementRequired,
			UserVerification: protocol.VerificationRequired,
		}),
		webauthn.WithResidentKeyRequirement(protocol.ResidentKeyRequirementRequired),
		webauthn.WithConveyancePreference(protocol.PreferNoAttestation),
		webauthn.WithExclusions(webauthn.Credentials(a.Credentials).CredentialDescriptors()),
	)
}

// VerifyRegistration verifies the browser's JSON response; append the result to the account.
func (rp *RP) VerifyRegistration(a *Account, session webauthn.SessionData, body []byte) (*webauthn.Credential, error) {
	parsed, err := protocol.ParseCredentialCreationResponseBytes(body)
	if err != nil {
		return nil, err
	}
	return rp.w.CreateCredential(a, session, parsed)
}

// AuthenticationOptions starts a usernameless (discoverable credential) sign-in.
func (rp *RP) AuthenticationOptions() (*protocol.CredentialAssertion, *webauthn.SessionData, error) {
	return rp.w.BeginDiscoverableLogin(webauthn.WithUserVerification(protocol.VerificationRequired))
}

// LookupFunc loads the account owning credential rawID with user handle userHandle.
type LookupFunc func(rawID, userHandle []byte) (*Account, error)

// VerifyAuthentication verifies an assertion. Persist the returned credential
// (updated sign count). A non-increasing non-zero counter is rejected.
func (rp *RP) VerifyAuthentication(lookup LookupFunc, session webauthn.SessionData, body []byte) (*Account, *webauthn.Credential, error) {
	parsed, err := protocol.ParseCredentialRequestResponseBytes(body)
	if err != nil {
		return nil, nil, err
	}
	var found *Account
	user, cred, err := rp.w.ValidatePasskeyLogin(func(rawID, userHandle []byte) (webauthn.User, error) {
		acct, err := lookup(rawID, userHandle)
		found = acct
		return acct, err
	}, session, parsed)
	if err != nil {
		return nil, nil, err
	}
	_ = user
	if cred.Authenticator.CloneWarning {
		return nil, nil, ErrPossibleClone
	}
	return found, cred, nil
}
