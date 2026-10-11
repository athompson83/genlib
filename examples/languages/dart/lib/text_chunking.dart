// SPDX-License-Identifier: Apache-2.0
/// Text chunking for retrieval (RAG): split at the largest natural boundary that fits (blank lines, lines, sentences,
/// spaces, code points), pack greedily and optionally overlap whole pieces. Lengths count Unicode code points (runes);
/// whitespace means ASCII space, tab, LF, CR, FF and VT only.
library;

typedef _Piece = (int, int); // [start, end) in code points

bool _isWs(int c) => c == 0x20 || c == 0x09 || c == 0x0A || c == 0x0D || c == 0x0C || c == 0x0B;

/// Chunks of at most [maxChars] code points, trimmed of surrounding whitespace, never empty. When [overlap] > 0 each chunk
/// starts with the last whole pieces of the previous one totalling at most overlap. Throws [RangeError] for maxChars < 1 or
/// overlap outside 0..maxChars-1.
List<String> chunkText(String text, int maxChars, {int overlap = 0}) {
  if (maxChars < 1) throw RangeError.value(maxChars, 'maxChars', 'must be >= 1');
  if (overlap < 0 || overlap >= maxChars) throw RangeError.value(overlap, 'overlap', 'must be in 0..maxChars-1');
  final cp = text.runes.toList();
  final pieces = <_Piece>[];
  _pieces(cp, 0, cp.length, maxChars, 0, pieces);
  final chunks = <String>[];
  var cur = <_Piece>[];
  var size = 0;
  void emit() {
    var s = cur.first.$1, e = cur.last.$2; // pieces in a chunk are always contiguous
    while (s < e && _isWs(cp[s])) {
      s++;
    }
    while (e > s && _isWs(cp[e - 1])) {
      e--;
    }
    if (e > s) chunks.add(String.fromCharCodes(cp, s, e));
  }

  for (final p in pieces) {
    final len = p.$2 - p.$1;
    if (cur.isNotEmpty && size + len > maxChars) {
      emit();
      final keep = <_Piece>[];
      var total = 0;
      if (overlap > 0) {
        for (var k = cur.length - 1; k >= 1; k--) {
          // never repeat the whole previous chunk
          final ql = cur[k].$2 - cur[k].$1;
          if (total + ql > overlap) break;
          keep.insert(0, cur[k]);
          total += ql;
        }
      }
      while (keep.isNotEmpty && total + len > maxChars) {
        total -= keep[0].$2 - keep[0].$1;
        keep.removeAt(0);
      }
      cur = keep;
      size = total;
    }
    cur.add(p);
    size += len;
  }
  if (cur.isNotEmpty) emit();
  return chunks;
}

void _pieces(List<int> cp, int start, int end, int max, int level, List<_Piece> out) {
  if (end - start <= max) {
    out.add((start, end));
    return;
  }
  for (final (s, e) in _split(cp, start, end, level)) {
    if (e - s <= max) {
      out.add((s, e));
    } else {
      _pieces(cp, s, e, max, level + 1, out);
    }
  }
}

bool _at(List<int> cp, int pos, int end, List<int> sep) {
  if (pos + sep.length > end) return false;
  for (var i = 0; i < sep.length; i++) {
    if (cp[pos + i] != sep[i]) return false;
  }
  return true;
}

/// Pieces at one boundary level; each keeps its trailing separator so the pieces concatenate to the input.
List<_Piece> _split(List<int> cp, int start, int end, int level) {
  final out = <_Piece>[];
  if (level == 0 || level == 1 || level == 3) {
    final sep = level == 0 ? const [0x0A, 0x0A] : (level == 1 ? const [0x0A] : const [0x20]);
    var s = start;
    while (true) {
      var found = -1;
      for (var k = s; k + sep.length <= end; k++) {
        if (_at(cp, k, end, sep)) {
          found = k;
          break;
        }
      }
      if (found < 0) break;
      var j = found + sep.length;
      while (_at(cp, j, end, sep)) {
        j += sep.length; // a run of separators stays with the piece before it
      }
      out.add((s, j));
      s = j;
    }
    if (s < end) out.add((s, end));
    return out;
  }
  if (level == 2) {
    // sentences: after . ! ? followed by whitespace
    var s = start, i = start;
    while (i < end) {
      final c = cp[i];
      if ((c == 0x2E || c == 0x21 || c == 0x3F) && i + 1 < end && _isWs(cp[i + 1])) {
        var j = i + 1;
        while (j < end && _isWs(cp[j])) {
          j++;
        }
        out.add((s, j));
        s = j;
        i = j;
        continue;
      }
      i++;
    }
    if (s < end) out.add((s, end));
    return out;
  }
  for (var i = start; i < end; i++) {
    out.add((i, i + 1)); // level 4: single code points
  }
  return out;
}
