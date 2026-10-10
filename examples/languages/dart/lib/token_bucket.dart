// SPDX-License-Identifier: Apache-2.0
/// Pure token-bucket rate limiter with an injected clock and integer millitokens.
library;

const _maxInt = 9223372036854775807;

/// Bucket state: tokens in thousandths and the time of the last refill.
class BucketState {
  final int tokensMilli, lastMs;
  const BucketState(this.tokensMilli, this.lastMs);
}

/// Outcome of [take]: the new state and, when denied, how long to wait.
class TakeResult {
  final bool allowed;
  final BucketState state;
  final int retryAfterMs;
  const TakeResult(this.allowed, this.state, this.retryAfterMs);
}

/// A full bucket at [nowMs].
BucketState newBucket(int capacity, int nowMs) => BucketState(_capMilli(capacity), nowMs);

/// Refills at [ratePerSecond] tokens per second (a clock going backwards adds nothing), then takes [cost] tokens if available.
TakeResult take(BucketState state, int nowMs, int cost, int capacity, int ratePerSecond) {
  final capMilli = _capMilli(capacity);
  if (ratePerSecond <= 0) throw RangeError.value(ratePerSecond, 'ratePerSecond', 'must be > 0');
  if (cost <= 0) throw RangeError.value(cost, 'cost', 'must be > 0');
  if (cost > capacity) throw RangeError.value(cost, 'cost', 'must not exceed capacity');
  if (state.tokensMilli < 0 || state.tokensMilli > capMilli) throw ArgumentError.value(state.tokensMilli, 'state', 'tokens out of range');
  var tokens = state.tokensMilli, last = state.lastMs;
  if (nowMs > last) {
    if (last < 0 && nowMs > _maxInt + last) {
      tokens = capMilli; // the gap itself would overflow; it certainly fills the bucket
    } else {
      final elapsed = nowMs - last, missing = capMilli - tokens;
      // elapsed < ceil(missing / rate) keeps elapsed * rate below missing + rate, so no overflow.
      tokens = elapsed >= _ceilDiv(missing, ratePerSecond) ? capMilli : tokens + elapsed * ratePerSecond;
    }
    last = nowMs;
  }
  final costMilli = cost * 1000;
  if (tokens >= costMilli) return TakeResult(true, BucketState(tokens - costMilli, last), 0);
  return TakeResult(false, BucketState(tokens, last), _ceilDiv(costMilli - tokens, ratePerSecond));
}

int _capMilli(int capacity) {
  if (capacity <= 0) throw RangeError.value(capacity, 'capacity', 'must be > 0');
  if (capacity > _maxInt ~/ 1000) throw RangeError.value(capacity, 'capacity', 'too large for millitokens');
  return capacity * 1000;
}

int _ceilDiv(int a, int b) => a ~/ b + (a % b != 0 ? 1 : 0);
