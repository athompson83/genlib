// SPDX-License-Identifier: Apache-2.0
/// Deterministic, dependency-free feature flag evaluation. The bucket is FNV-1a 32 of `key:userId` followed by the
/// MurmurHash3 fmix32 finalizer, mod 10000, so the same user always gets the same answer for the same flag, and raising
/// the rollout percentage only adds users (nobody who is already on is dropped).
///
/// BREAKING (behavior): earlier versions used plain FNV-1a, whose lowest bit is the parity of the input bytes, so 50/50
/// experiments with similar keys put the same users in the same half. The finalizer makes experiments independent but
/// changes every bucket and variant assignment; re-baseline running rollouts and experiments when upgrading.
library;

import 'dart:convert';

import 'hashing.dart' show fnv1a32;

// 32-bit multiply that stays exact on the web, where ints are doubles.
int _mul32(int a, int b) => (((a & 0xffff) * b) + ((((a >>> 16) * b) & 0xffff) << 16)) & 0xffffffff;

/// FNV-1a 32 over UTF-8, then the MurmurHash3 fmix32 finalizer so the low bits used by `% n` are well mixed.
int _bucketHash(String text) {
  var h = fnv1a32(utf8.encode(text));
  h ^= h >>> 16;
  h = _mul32(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = _mul32(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h;
}

/// One weighted variant; [weight] is a positive integer.
class FlagVariant {
  final String name;
  final int weight;
  const FlagVariant(this.name, this.weight);
}

/// Flag definition: key, kill switch, allow/deny lists, percentage rollout (0..100, two decimals) and variants.
class FeatureFlag {
  final String key;
  final bool enabled;
  final List<String> allow, deny;
  final num rolloutPercent;
  final List<FlagVariant> variants;
  const FeatureFlag(this.key,
      {this.enabled = true, this.allow = const [], this.deny = const [], this.rolloutPercent = 100, this.variants = const []});
}

/// Evaluation result; [reason] is `disabled`, `deny`, `allow`, `rollout` or `excluded`; [bucket] is always reported.
class FlagResult {
  final bool on;
  final String reason;
  final int bucket;
  final String? variant;
  const FlagResult(this.on, this.reason, this.bucket, this.variant);

  @override
  bool operator ==(Object other) =>
      other is FlagResult && other.on == on && other.reason == reason && other.bucket == bucket && other.variant == variant;

  @override
  int get hashCode => Object.hash(on, reason, bucket, variant);

  @override
  String toString() => 'FlagResult(on: $on, reason: $reason, bucket: $bucket, variant: $variant)';
}

final _key = RegExp(r'^[A-Za-z0-9._-]{1,100}$');

/// Evaluates in order: disabled, deny list, allow list, rollout bucket, excluded. A variant is chosen only when the
/// flag is on and variants exist. Throws [ArgumentError] for an invalid key, percentage or variant.
FlagResult evaluateFlag(FeatureFlag flag, String userId) {
  if (!_key.hasMatch(flag.key)) throw ArgumentError.value(flag.key, 'key', 'must match [A-Za-z0-9._-]{1,100}');
  final pct = flag.rolloutPercent;
  if (pct.isNaN || pct < 0 || pct > 100 || (pct * 100).roundToDouble() != pct * 100) {
    throw ArgumentError.value(pct, 'rolloutPercent', 'must be 0..100 with at most 2 decimals');
  }
  final basisPoints = (pct * 100).round();
  var totalWeight = 0;
  for (final v in flag.variants) {
    if (v.name.isEmpty || v.weight < 1) throw ArgumentError('variants need a name and a positive weight');
    totalWeight += v.weight;
  }
  final bucket = _bucketHash('${flag.key}:$userId') % 10000;
  String? variant() {
    if (flag.variants.isEmpty) return null;
    var x = _bucketHash('${flag.key}:variant:$userId') % totalWeight;
    for (final v in flag.variants) {
      if (x < v.weight) return v.name;
      x -= v.weight;
    }
    return null;
  }

  if (!flag.enabled) return FlagResult(false, 'disabled', bucket, null);
  if (flag.deny.contains(userId)) return FlagResult(false, 'deny', bucket, null);
  if (flag.allow.contains(userId)) return FlagResult(true, 'allow', bucket, variant());
  if (bucket < basisPoints) return FlagResult(true, 'rollout', bucket, variant());
  return FlagResult(false, 'excluded', bucket, null);
}
