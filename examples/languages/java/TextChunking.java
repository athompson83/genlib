// SPDX-License-Identifier: Apache-2.0

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Text chunking for retrieval (RAG): split at the largest natural boundary that fits (paragraph, line,
 * sentence, word, code point), pack greedily, optionally overlap whole pieces. Lengths count code points.
 */
public final class TextChunking {
    private TextChunking() {}

    private static boolean ws(int c) { return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f' || c == 0x0B; }

    private static boolean startsWith(int[] t, int at, int[] sep) {
        if (at + sep.length > t.length) return false;
        for (int k = 0; k < sep.length; k++) if (t[at + k] != sep[k]) return false;
        return true;
    }

    private static int find(int[] t, int[] sep, int start) {
        for (int i = start; i + sep.length <= t.length; i++) if (startsWith(t, i, sep)) return i;
        return -1;
    }

    private static List<int[]> splitKeep(int[] t, int level) {
        List<int[]> out = new ArrayList<>();
        if (level == 0 || level == 1 || level == 3) {
            int[] sep = level == 0 ? new int[] {'\n', '\n'} : level == 1 ? new int[] {'\n'} : new int[] {' '};
            int start = 0;
            while (true) {
                int i = find(t, sep, start);
                if (i < 0) break;
                int j = i + sep.length;
                while (startsWith(t, j, sep)) j += sep.length;
                out.add(Arrays.copyOfRange(t, start, j));
                start = j;
            }
            if (start < t.length) out.add(Arrays.copyOfRange(t, start, t.length));
            return out;
        }
        if (level == 2) {
            int start = 0;
            int i = 0;
            while (i < t.length) {
                if ((t[i] == '.' || t[i] == '!' || t[i] == '?') && i + 1 < t.length && ws(t[i + 1])) {
                    int j = i + 1;
                    while (j < t.length && ws(t[j])) j++;
                    out.add(Arrays.copyOfRange(t, start, j));
                    start = j;
                    i = j;
                    continue;
                }
                i++;
            }
            if (start < t.length) out.add(Arrays.copyOfRange(t, start, t.length));
            return out;
        }
        for (int c : t) out.add(new int[] {c});
        return out;
    }

    private static List<int[]> pieces(int[] t, int max, int level) {
        List<int[]> out = new ArrayList<>();
        if (t.length <= max) { out.add(t); return out; }
        for (int[] p : splitKeep(t, level)) {
            if (p.length <= max) out.add(p); else out.addAll(pieces(p, max, level + 1));
        }
        return out;
    }

    private static void emit(List<int[]> cur, List<String> chunks) {
        int n = 0;
        for (int[] p : cur) n += p.length;
        int[] all = new int[n];
        int at = 0;
        for (int[] p : cur) { System.arraycopy(p, 0, all, at, p.length); at += p.length; }
        int a = 0;
        int b = n;
        while (a < b && ws(all[a])) a++;
        while (b > a && ws(all[b - 1])) b--;
        if (b > a) chunks.add(new String(all, a, b - a));
    }

    /** Chunks of at most maxChars code points, trimmed of ASCII whitespace, never empty; overlap repeats whole trailing pieces. */
    public static List<String> chunkText(String text, int maxChars, int overlap) {
        if (maxChars < 1) throw new IllegalArgumentException("maxChars must be >= 1");
        if (overlap < 0 || overlap >= maxChars) throw new IllegalArgumentException("overlap must be in 0..maxChars-1");
        List<int[]> pieces = pieces(text.codePoints().toArray(), maxChars, 0);
        List<String> chunks = new ArrayList<>();
        List<int[]> cur = new ArrayList<>();
        int size = 0;
        for (int[] p : pieces) {
            if (!cur.isEmpty() && size + p.length > maxChars) {
                emit(cur, chunks);
                List<int[]> keep = new ArrayList<>();
                int total = 0;
                if (overlap > 0) {
                    for (int k = cur.size() - 1; k >= 1; k--) {
                        int[] q = cur.get(k);
                        if (total + q.length > overlap) break;
                        keep.add(0, q);
                        total += q.length;
                    }
                }
                while (!keep.isEmpty() && total + p.length > maxChars) total -= keep.remove(0).length;
                cur = keep;
                size = total;
            }
            cur.add(p);
            size += p.length;
        }
        if (!cur.isEmpty()) emit(cur, chunks);
        return chunks;
    }

    /** Chunks of at most maxChars code points with no overlap. */
    public static List<String> chunkText(String text, int maxChars) { return chunkText(text, maxChars, 0); }
}
