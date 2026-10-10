// SPDX-License-Identifier: Apache-2.0
using System.Text;

namespace Genlib.Validation;

/// <summary>
/// Text chunking for retrieval (RAG): split at the largest natural boundary that fits (blank lines, lines, sentences, spaces,
/// code points), pack greedily and optionally overlap whole pieces. Lengths count Unicode code points (runes); whitespace means
/// ASCII space, tab, LF, CR, FF and VT only.
/// </summary>
public static class TextChunking {
    private static readonly char[] Ws = { ' ', '\t', '\n', '\r', '\f', '\v' };
    private static readonly int[] Para = { '\n', '\n' }, Nl = { '\n' }, Space = { ' ' };

    /// <summary>
    /// Chunks of at most <paramref name="maxChars"/> code points, trimmed of surrounding whitespace, never empty. When
    /// <paramref name="overlap"/> &gt; 0 each chunk starts with the last whole pieces of the previous one totalling at most overlap.
    /// Throws <see cref="ArgumentOutOfRangeException"/> for maxChars &lt; 1 or overlap outside 0..maxChars-1.
    /// </summary>
    public static IReadOnlyList<string> ChunkText(string text, int maxChars, int overlap = 0) {
        ArgumentNullException.ThrowIfNull(text);
        if (maxChars < 1) throw new ArgumentOutOfRangeException(nameof(maxChars), "maxChars must be >= 1");
        if (overlap < 0 || overlap >= maxChars) throw new ArgumentOutOfRangeException(nameof(overlap), "overlap must be in 0..maxChars-1");
        int[] cp = text.EnumerateRunes().Select(r => r.Value).ToArray();
        var pieces = new List<(int Start, int End)>();
        Pieces(cp, 0, cp.Length, maxChars, 0, pieces);
        var chunks = new List<string>();
        var cur = new List<(int Start, int End)>();
        int size = 0;
        void Emit() {
            var sb = new StringBuilder();
            foreach (var (s, e) in cur) for (int i = s; i < e; i++) sb.Append(char.ConvertFromUtf32(cp[i]));
            string chunk = sb.ToString().Trim(Ws);
            if (chunk.Length > 0) chunks.Add(chunk);
        }
        foreach (var p in pieces) {
            int len = p.End - p.Start;
            if (cur.Count > 0 && size + len > maxChars) {
                Emit();
                var keep = new List<(int Start, int End)>();
                int total = 0;
                if (overlap > 0) {
                    for (int k = cur.Count - 1; k >= 1; k--) { // never repeat the whole previous chunk
                        int ql = cur[k].End - cur[k].Start;
                        if (total + ql > overlap) break;
                        keep.Insert(0, cur[k]);
                        total += ql;
                    }
                }
                while (keep.Count > 0 && total + len > maxChars) { total -= keep[0].End - keep[0].Start; keep.RemoveAt(0); }
                cur = keep;
                size = total;
            }
            cur.Add(p);
            size += len;
        }
        if (cur.Count > 0) Emit();
        return chunks;
    }

    private static bool IsWs(int c) => c is ' ' or '\t' or '\n' or '\r' or '\f' or '\v';

    private static void Pieces(int[] cp, int start, int end, int max, int level, List<(int Start, int End)> output) {
        if (end - start <= max) { output.Add((start, end)); return; }
        foreach (var (s, e) in Split(cp, start, end, level)) {
            if (e - s <= max) output.Add((s, e));
            else Pieces(cp, s, e, max, level + 1, output);
        }
    }

    private static bool At(int[] cp, int pos, int end, int[] sep) {
        if (pos + sep.Length > end) return false;
        for (int i = 0; i < sep.Length; i++) if (cp[pos + i] != sep[i]) return false;
        return true;
    }

    /// <summary>Pieces at one boundary level; each keeps its trailing separator so the pieces concatenate to the input.</summary>
    private static List<(int Start, int End)> Split(int[] cp, int start, int end, int level) {
        var output = new List<(int Start, int End)>();
        if (level is 0 or 1 or 3) {
            int[] sep = level == 0 ? Para : level == 1 ? Nl : Space;
            int s = start;
            while (true) {
                int found = -1;
                for (int k = s; k + sep.Length <= end; k++) if (At(cp, k, end, sep)) { found = k; break; }
                if (found < 0) break;
                int j = found + sep.Length;
                while (At(cp, j, end, sep)) j += sep.Length; // a run of separators stays with the piece before it
                output.Add((s, j));
                s = j;
            }
            if (s < end) output.Add((s, end));
            return output;
        }
        if (level == 2) { // sentences: after . ! ? followed by whitespace
            int s = start, i = start;
            while (i < end) {
                if (cp[i] is '.' or '!' or '?' && i + 1 < end && IsWs(cp[i + 1])) {
                    int j = i + 1;
                    while (j < end && IsWs(cp[j])) j++;
                    output.Add((s, j));
                    s = j;
                    i = j;
                    continue;
                }
                i++;
            }
            if (s < end) output.Add((s, end));
            return output;
        }
        for (int i = start; i < end; i++) output.Add((i, i + 1)); // level 4: single code points
        return output;
    }
}
