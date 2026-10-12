// SPDX-License-Identifier: Apache-2.0

// Package featureflags evaluates feature flags deterministically. The bucket
// is FNV-1a 32 of "key:userId" followed by the MurmurHash3 fmix32 finalizer,
// modulo 10000, so the same user always gets the same answer for the same
// flag, and raising the rollout percentage only adds users (nobody already in
// the rollout drops out). Variants use a separate "key:variant:userId" hash so
// assignment is independent of the rollout.
//
// BREAKING (behavior): earlier versions used plain FNV-1a, whose lowest bit is
// the parity of the input bytes, so 50/50 experiments with similar keys put
// the same users in the same half. The finalizer makes experiments independent
// but changes every bucket and variant assignment; re-baseline running
// rollouts and experiments when upgrading.
package featureflags

import (
	"errors"
	"math"
)

// Variant is a named arm with a positive integer weight.
type Variant struct {
	Name   string
	Weight int
}

// Flag is one flag. Nil Enabled means true; nil RolloutPercent means 100.
// RolloutPercent is 0..100 with at most two decimals.
type Flag struct {
	Key            string
	Enabled        *bool
	Allow, Deny    []string
	RolloutPercent *float64
	Variants       []Variant
}

// Result is the evaluation. Reason is "disabled", "deny", "allow", "rollout"
// or "excluded"; Variant is empty unless the flag is on and has variants.
type Result struct {
	On      bool
	Reason  string
	Bucket  uint32
	Variant string
}

// bucketHash is FNV-1a 32 over the UTF-8 bytes, then the MurmurHash3 fmix32
// finalizer so the low bits used by % n are well mixed.
func bucketHash(s string) uint32 {
	h := uint32(0x811c9dc5)
	for i := 0; i < len(s); i++ {
		h = (h ^ uint32(s[i])) * 0x01000193
	}
	h ^= h >> 16
	h *= 0x85ebca6b
	h ^= h >> 13
	h *= 0xc2b2ae35
	h ^= h >> 16
	return h
}

func validKey(k string) bool {
	if len(k) < 1 || len(k) > 100 {
		return false
	}
	for i := 0; i < len(k); i++ {
		c := k[i]
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '.' || c == '_' || c == '-') {
			return false
		}
	}
	return true
}

func contains(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}

// Evaluate checks disabled, deny, allow and then bucket < percent*100. It
// returns an error for an invalid key, percentage or variant.
func Evaluate(f Flag, userID string) (Result, error) {
	if !validKey(f.Key) {
		return Result{}, errors.New("featureflags: key must match [A-Za-z0-9._-]{1,100}")
	}
	pct := 100.0
	if f.RolloutPercent != nil {
		pct = *f.RolloutPercent
	}
	if !(pct >= 0 && pct <= 100) || math.Round(pct*100) != pct*100 {
		return Result{}, errors.New("featureflags: rolloutPercent must be 0..100 with at most 2 decimals")
	}
	total := 0
	for _, v := range f.Variants {
		if v.Name == "" || v.Weight < 1 || v.Weight > math.MaxInt32 {
			return Result{}, errors.New("featureflags: variants need a name and a positive integer weight")
		}
		total += v.Weight
	}
	bucket := bucketHash(f.Key+":"+userID) % 10000
	variant := func() string {
		if total == 0 {
			return ""
		}
		x := int(uint64(bucketHash(f.Key+":variant:"+userID)) % uint64(total))
		for _, v := range f.Variants {
			if x < v.Weight {
				return v.Name
			}
			x -= v.Weight
		}
		return ""
	}
	switch {
	case f.Enabled != nil && !*f.Enabled:
		return Result{false, "disabled", bucket, ""}, nil
	case contains(f.Deny, userID):
		return Result{false, "deny", bucket, ""}, nil
	case contains(f.Allow, userID):
		return Result{true, "allow", bucket, variant()}, nil
	case bucket < uint32(math.Round(pct*100)):
		return Result{true, "rollout", bucket, variant()}, nil
	}
	return Result{false, "excluded", bucket, ""}, nil
}
