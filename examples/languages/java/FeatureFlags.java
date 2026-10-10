// SPDX-License-Identifier: Apache-2.0
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Deterministic feature-flag evaluation. The same flag and user always give the same answer, and raising
 * rolloutPercent only adds users (bucket = fnv1a32(key + ":" + userId) % 10000 is compared with percent * 100).
 */
public final class FeatureFlags {
    private static final Pattern KEY = Pattern.compile("[A-Za-z0-9._-]{1,100}");

    private FeatureFlags() {}

    /** A weighted variant; weight is a positive integer. */
    public record Variant(String name, int weight) {}

    /** The evaluation; variant is null when off or the flag has no variants. */
    public record Result(boolean on, String reason, int bucket, String variant) {}

    /** A flag definition. Build with the fluent setters. */
    public static final class Flag {
        final String key;
        boolean enabled = true;
        final List<String> allow = new ArrayList<>();
        final List<String> deny = new ArrayList<>();
        double rolloutPercent = 100;
        final List<Variant> variants = new ArrayList<>();

        public Flag(String key) { this.key = key; }
        public Flag enabled(boolean v) { enabled = v; return this; }
        public Flag allow(String... ids) { allow.addAll(List.of(ids)); return this; }
        public Flag deny(String... ids) { deny.addAll(List.of(ids)); return this; }
        /** 0..100 with at most two decimals. */
        public Flag rolloutPercent(double v) { rolloutPercent = v; return this; }
        public Flag variant(String name, int weight) { variants.add(new Variant(name, weight)); return this; }
    }

    private static long fnv1a32(String s) {
        int h = 0x811c9dc5;
        for (byte b : s.getBytes(StandardCharsets.UTF_8)) h = (h ^ (b & 0xff)) * 0x01000193;
        return Integer.toUnsignedLong(h);
    }

    /** Evaluates the flag for a user; throws IllegalArgumentException for an invalid key, percent or variant. */
    public static Result evaluateFlag(Flag flag, String userId) {
        if (flag == null || flag.key == null || !KEY.matcher(flag.key).matches()) throw new IllegalArgumentException("flag key must match [A-Za-z0-9._-]{1,100}");
        double pct = flag.rolloutPercent;
        if (!(pct >= 0 && pct <= 100) || Math.rint(pct * 100) != pct * 100) throw new IllegalArgumentException("rolloutPercent must be 0..100 with at most two decimals");
        long basisPoints = Math.round(pct * 100);
        long total = 0;
        for (Variant v : flag.variants) {
            if (v.name() == null || v.name().isEmpty() || v.weight() < 1) throw new IllegalArgumentException("variants need a name and a positive integer weight");
            total += v.weight();
        }
        if (userId == null) throw new IllegalArgumentException("userId is required");
        int bucket = (int) (fnv1a32(flag.key + ":" + userId) % 10000);
        if (!flag.enabled) return new Result(false, "disabled", bucket, null);
        if (flag.deny.contains(userId)) return new Result(false, "deny", bucket, null);
        if (flag.allow.contains(userId)) return new Result(true, "allow", bucket, variant(flag, userId, total));
        if (bucket < basisPoints) return new Result(true, "rollout", bucket, variant(flag, userId, total));
        return new Result(false, "excluded", bucket, null);
    }

    private static String variant(Flag flag, String userId, long total) {
        if (flag.variants.isEmpty()) return null;
        long x = fnv1a32(flag.key + ":variant:" + userId) % total;
        for (Variant v : flag.variants) {
            if (x < v.weight()) return v.name();
            x -= v.weight();
        }
        return null;
    }
}
