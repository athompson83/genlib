// SPDX-License-Identifier: Apache-2.0

// Package backoff computes retry delays: exponential backoff with full jitter
// and Retry-After header parsing. The caller injects randomness and time.
package backoff

import (
	"errors"
	"math"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Delay returns floor(randomFraction * min(capMs, baseMs * 2^attempt)) ("full jitter").
// The cap is applied before multiplying, so large attempts cannot overflow.
func Delay(attempt int, baseMs, capMs int64, randomFraction float64) (int64, error) {
	switch {
	case attempt < 0:
		return 0, errors.New("backoff: attempt must be >= 0")
	case baseMs <= 0:
		return 0, errors.New("backoff: baseMs must be > 0")
	case capMs < baseMs:
		return 0, errors.New("backoff: capMs must be >= baseMs")
	case math.IsNaN(randomFraction) || randomFraction < 0 || randomFraction >= 1:
		return 0, errors.New("backoff: randomFraction must be in [0, 1)")
	}
	ceiling := capMs
	if attempt < 63 && baseMs <= capMs>>uint(attempt) {
		ceiling = baseMs << uint(attempt)
	}
	return int64(randomFraction * float64(ceiling)), nil
}

var (
	seconds    = regexp.MustCompile(`^[0-9]+$`)
	imfFixdate = regexp.MustCompile(`^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), [0-9]{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2} GMT$`)
)

// RetryAfterMs converts a Retry-After value (delta-seconds or an IMF-fixdate)
// into a non-negative delay in milliseconds; any other value is an error.
func RetryAfterMs(headerValue string, nowMs int64) (int64, error) {
	value := strings.TrimSpace(headerValue)
	if seconds.MatchString(value) {
		n, err := strconv.ParseInt(value, 10, 64)
		if err != nil || n > math.MaxInt64/1000 {
			return 0, errors.New("backoff: Retry-After seconds out of range")
		}
		return n * 1000, nil
	}
	if imfFixdate.MatchString(value) {
		when, err := time.Parse(time.RFC1123, value)
		if err != nil || when.Format(time.RFC1123) != value {
			return 0, errors.New("backoff: Retry-After date is invalid")
		}
		if d := when.UnixMilli() - nowMs; d > 0 {
			return d, nil
		}
		return 0, nil
	}
	return 0, errors.New("backoff: Retry-After must be delta-seconds or an IMF-fixdate")
}
