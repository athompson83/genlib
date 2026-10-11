// SPDX-License-Identifier: Apache-2.0
namespace Genlib.Validation;

/// <summary>
/// Integer half-open intervals [Start, End) as <c>(long Start, long End)</c> tuples. Every interval needs Start &lt; End, otherwise
/// <see cref="ArgumentException"/>. Results are sorted and non-overlapping, with touching intervals merged.
/// </summary>
public static class IntervalMerge {
    private static void Validate(IEnumerable<(long Start, long End)> xs) {
        foreach (var (s, e) in xs) if (s >= e) throw new ArgumentException("bad interval");
    }

    /// <summary>Sorts and merges overlapping or touching intervals.</summary>
    public static List<(long Start, long End)> Merge(IEnumerable<(long Start, long End)> xs) {
        ArgumentNullException.ThrowIfNull(xs);
        var list = xs.ToList();
        Validate(list);
        list.Sort();
        var output = new List<(long Start, long End)>();
        foreach (var (s, e) in list) {
            if (output.Count > 0 && s <= output[^1].End) output[^1] = (output[^1].Start, Math.Max(output[^1].End, e));
            else output.Add((s, e));
        }
        return output;
    }

    /// <summary>The parts covered by both <paramref name="a"/> and <paramref name="b"/>.</summary>
    public static List<(long Start, long End)> Intersect(IEnumerable<(long Start, long End)> a, IEnumerable<(long Start, long End)> b) {
        var x = Merge(a); var y = Merge(b);
        var output = new List<(long Start, long End)>();
        int i = 0, j = 0;
        while (i < x.Count && j < y.Count) {
            long s = Math.Max(x[i].Start, y[j].Start), e = Math.Min(x[i].End, y[j].End);
            if (s < e) output.Add((s, e));
            if (x[i].End < y[j].End) i++; else j++;
        }
        return output.Count > 0 ? Merge(output) : output;
    }

    /// <summary>The parts of <paramref name="a"/> not covered by <paramref name="b"/>.</summary>
    public static List<(long Start, long End)> Subtract(IEnumerable<(long Start, long End)> a, IEnumerable<(long Start, long End)> b) {
        var x = Merge(a); var y = Merge(b);
        var output = new List<(long Start, long End)>();
        foreach (var (s, e) in x) {
            long cur = s;
            foreach (var (bs, be) in y) {
                if (be <= cur || bs >= e) continue;
                if (bs > cur) output.Add((cur, bs));
                cur = Math.Max(cur, be);
                if (cur >= e) break;
            }
            if (cur < e) output.Add((cur, e));
        }
        return output;
    }

    /// <summary>The parts of [<paramref name="lo"/>, <paramref name="hi"/>) not covered by <paramref name="xs"/>; requires lo &lt; hi.</summary>
    public static List<(long Start, long End)> Gaps(IEnumerable<(long Start, long End)> xs, long lo, long hi) {
        if (lo >= hi) throw new ArgumentException("bad bounds");
        return Subtract(new[] { (lo, hi) }, xs);
    }

    /// <summary>Total covered length after merging.</summary>
    public static long Total(IEnumerable<(long Start, long End)> xs) => Merge(xs).Sum(x => x.End - x.Start);

    /// <summary>True when the two intervals share at least one point (touching is not overlapping).</summary>
    public static bool Overlaps((long Start, long End) x, (long Start, long End) y) {
        Validate(new[] { x, y });
        return x.Start < y.End && y.Start < x.End;
    }

    /// <summary>True when <paramref name="p"/> lies inside one of the intervals.</summary>
    public static bool Contains(IEnumerable<(long Start, long End)> xs, long p) => Merge(xs).Any(x => x.Start <= p && p < x.End);
}
