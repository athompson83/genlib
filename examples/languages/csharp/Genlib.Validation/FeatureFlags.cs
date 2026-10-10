// SPDX-License-Identifier: Apache-2.0
using System.Text;
using System.Text.RegularExpressions;

namespace Genlib.Validation;

/// <summary>One weighted variant of a flag; <see cref="Weight"/> is a positive integer.</summary>
public sealed record FlagVariant(string Name, int Weight);

/// <summary>Flag definition: key, kill switch, allow/deny lists, percentage rollout (0..100, two decimals) and variants.</summary>
public sealed record FeatureFlag(string Key) {
    public bool Enabled { get; init; } = true;
    public IReadOnlyList<string> Allow { get; init; } = Array.Empty<string>();
    public IReadOnlyList<string> Deny { get; init; } = Array.Empty<string>();
    public double RolloutPercent { get; init; } = 100;
    public IReadOnlyList<FlagVariant> Variants { get; init; } = Array.Empty<FlagVariant>();
}

/// <summary>Evaluation result; <see cref="Reason"/> is disabled, deny, allow, rollout or excluded and the bucket is always reported.</summary>
public sealed record FlagResult(bool On, string Reason, int Bucket, string? Variant);

/// <summary>
/// Deterministic, dependency-free flag evaluation. The bucket is FNV-1a 32 of "key:userId" mod 10000, so the same user always
/// gets the same answer for the same flag, and raising the rollout percentage only adds users (nobody already on is dropped).
/// </summary>
public static class FeatureFlags {
    private static readonly Regex KeyPattern = new(@"\A[A-Za-z0-9._-]{1,100}\z", RegexOptions.CultureInvariant);

    /// <summary>
    /// Evaluates in order: disabled, deny list, allow list, rollout bucket, excluded. A variant is chosen only when the flag is on
    /// and variants exist. Throws <see cref="ArgumentException"/> for an invalid key, percentage or variant.
    /// </summary>
    public static FlagResult EvaluateFlag(FeatureFlag flag, string userId) {
        if (!KeyPattern.IsMatch(flag.Key)) throw new ArgumentException("flag key must match [A-Za-z0-9._-]{1,100}", nameof(flag));
        double pct = flag.RolloutPercent;
        if (double.IsNaN(pct) || pct < 0 || pct > 100 || Math.Round(pct * 100) != pct * 100)
            throw new ArgumentException("rolloutPercent must be 0..100 with at most 2 decimals", nameof(flag));
        int basisPoints = (int)Math.Round(pct * 100);
        long totalWeight = 0;
        foreach (var v in flag.Variants) {
            if (string.IsNullOrEmpty(v.Name) || v.Weight < 1) throw new ArgumentException("variants need a name and a positive weight", nameof(flag));
            totalWeight += v.Weight;
        }
        int bucket = (int)(Hashing.Fnv1a32(Encoding.UTF8.GetBytes(flag.Key + ":" + userId)) % 10000);
        if (!flag.Enabled) return new FlagResult(false, "disabled", bucket, null);
        if (flag.Deny.Contains(userId)) return new FlagResult(false, "deny", bucket, null);
        if (flag.Allow.Contains(userId)) return new FlagResult(true, "allow", bucket, PickVariant(flag, userId, totalWeight));
        if (bucket < basisPoints) return new FlagResult(true, "rollout", bucket, PickVariant(flag, userId, totalWeight));
        return new FlagResult(false, "excluded", bucket, null);
    }

    private static string? PickVariant(FeatureFlag flag, string userId, long totalWeight) {
        if (flag.Variants.Count == 0) return null;
        long x = Hashing.Fnv1a32(Encoding.UTF8.GetBytes(flag.Key + ":variant:" + userId)) % totalWeight;
        foreach (var v in flag.Variants) {
            if (x < v.Weight) return v.Name;
            x -= v.Weight;
        }
        return null;
    }
}
