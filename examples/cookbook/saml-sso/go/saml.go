// SPDX-License-Identifier: Apache-2.0

// Package samlsp is a thin service-provider wrapper around github.com/crewjam/saml.
// crewjam/saml validates the XML signature (goxmldsig) against IdP metadata certs,
// Response Destination, InResponseTo against the request IDs you pass, Issuer, Status,
// SubjectConfirmationData Recipient/NotOnOrAfter, Conditions and Audience
// (saml.MaxClockSkew, default 180s). This wrapper fixes the policy (no IdP-initiated
// login, Audience required) and keeps the request-ID bookkeeping explicit.
package samlsp

import (
	"crypto/x509"
	"encoding/base64"
	"encoding/xml"
	"errors"
	"fmt"
	"net/url"

	"github.com/crewjam/saml"
)

type Config struct {
	SPEntityID  string
	ACSURL      string
	IDPEntityID string
	IDPSSOURL   string                 // HTTP-Redirect SingleSignOnService
	IDPCerts    []*x509.Certificate    // signing certs; several during rollover
	IDPMetadata *saml.EntityDescriptor // optional: use instead of the three fields above (e.g. samlsp.FetchMetadata)
}

type SP struct{ sp saml.ServiceProvider }

func New(c Config) (*SP, error) {
	acs, err := url.Parse(c.ACSURL)
	if err != nil {
		return nil, err
	}
	md := c.IDPMetadata
	if md == nil {
		md = idpMetadata(c)
	}
	s := saml.ServiceProvider{
		EntityID:          c.SPEntityID,
		AcsURL:            *acs,
		IDPMetadata:       md,
		AllowIDPInitiated: false, // unsolicited responses are rejected
	}
	// crewjam accepts an assertion with no AudienceRestriction; require one that names us.
	s.ValidateAudienceRestriction = func(a *saml.Assertion) error {
		for _, ar := range a.Conditions.AudienceRestrictions {
			if ar.Audience.Value == c.SPEntityID {
				return nil
			}
		}
		return fmt.Errorf("audience %q not present", c.SPEntityID)
	}
	return &SP{sp: s}, nil
}

// LoginRedirect returns the IdP redirect URL and the AuthnRequest ID.
// Store the ID server-side (session) and pass it to ParseACS exactly once.
func (s *SP) LoginRedirect(relayState string) (*url.URL, string, error) {
	req, err := s.sp.MakeAuthenticationRequest(s.sp.GetSSOBindingLocation(saml.HTTPRedirectBinding), saml.HTTPRedirectBinding, saml.HTTPPostBinding)
	if err != nil {
		return nil, "", err
	}
	u, err := req.Redirect(relayState, &s.sp)
	return u, req.ID, err
}

var ErrNoPendingRequest = errors.New("saml: no pending AuthnRequest (unsolicited or replayed response)")

// ParseACS validates the base64 SAMLResponse form value posted to the ACS URL.
func (s *SP) ParseACS(samlResponseB64 string, pendingRequestIDs []string) (*saml.Assertion, error) {
	if len(pendingRequestIDs) == 0 {
		return nil, ErrNoPendingRequest
	}
	raw, err := base64.StdEncoding.DecodeString(samlResponseB64)
	if err != nil {
		return nil, err
	}
	a, err := s.sp.ParseXMLResponse(raw, pendingRequestIDs, s.sp.AcsURL)
	if err != nil {
		var ie *saml.InvalidResponseError
		if errors.As(err, &ie) {
			return nil, fmt.Errorf("saml: %w (%v)", err, ie.PrivateErr) // PrivateErr: log it, don't show it to users
		}
		return nil, err
	}
	return a, nil
}

// Metadata returns SP metadata XML for the IdP administrator.
func (s *SP) Metadata() ([]byte, error) {
	return xml.MarshalIndent(s.sp.Metadata(), "", "  ")
}

func idpMetadata(c Config) *saml.EntityDescriptor {
	kds := make([]saml.KeyDescriptor, 0, len(c.IDPCerts))
	for _, crt := range c.IDPCerts {
		kds = append(kds, saml.KeyDescriptor{Use: "signing", KeyInfo: saml.KeyInfo{X509Data: saml.X509Data{
			X509Certificates: []saml.X509Certificate{{Data: base64.StdEncoding.EncodeToString(crt.Raw)}}}}})
	}
	return &saml.EntityDescriptor{EntityID: c.IDPEntityID, IDPSSODescriptors: []saml.IDPSSODescriptor{{
		SSODescriptor: saml.SSODescriptor{RoleDescriptor: saml.RoleDescriptor{
			ProtocolSupportEnumeration: "urn:oasis:names:tc:SAML:2.0:protocol", KeyDescriptors: kds}},
		SingleSignOnServices: []saml.Endpoint{{Binding: saml.HTTPRedirectBinding, Location: c.IDPSSOURL}},
	}}}
}
