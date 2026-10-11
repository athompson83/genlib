# SPDX-License-Identifier: Apache-2.0
"""Text chunking for retrieval (RAG): split at the largest natural boundary that fits, pack greedily,
optionally overlap whole pieces.

Boundary levels: paragraph breaks ("\\n\\n"), line breaks, sentence ends (. ! ? followed by whitespace),
spaces, then single code points. Lengths count Unicode code points; whitespace means ASCII space, tab,
LF, CR, FF and VT only.
"""

WHITESPACE = " \t\n\r\f\v"


def _split_keep(text: str, level: int) -> list[str]:
    """Pieces at one boundary level; each keeps its trailing separator so ''.join(pieces) == text."""
    if level in (0, 1, 3):
        sep = {0: "\n\n", 1: "\n", 3: " "}[level]
        out, start = [], 0
        while True:
            i = text.find(sep, start)
            if i < 0:
                break
            j = i + len(sep)
            while text.startswith(sep, j):  # a run of separators stays with the piece before it
                j += len(sep)
            out.append(text[start:j])
            start = j
        if start < len(text):
            out.append(text[start:])
        return out
    if level == 2:
        out, start, i = [], 0, 0
        while i < len(text):
            if text[i] in ".!?" and i + 1 < len(text) and text[i + 1] in WHITESPACE:
                j = i + 1
                while j < len(text) and text[j] in WHITESPACE:
                    j += 1
                out.append(text[start:j])
                start = i = j
                continue
            i += 1
        if start < len(text):
            out.append(text[start:])
        return out
    return list(text)


def _pieces(text: str, max_chars: int, level: int = 0) -> list[str]:
    if len(text) <= max_chars:
        return [text]
    out: list[str] = []
    for piece in _split_keep(text, level):
        out += [piece] if len(piece) <= max_chars else _pieces(piece, max_chars, level + 1)
    return out


def chunk_text(text: str, max_chars: int, overlap: int = 0) -> list[str]:
    """Chunks of at most max_chars code points, trimmed and never empty; overlap repeats whole trailing pieces."""
    if isinstance(max_chars, bool) or not isinstance(max_chars, int) or max_chars < 1:
        raise ValueError("max_chars must be >= 1")
    if isinstance(overlap, bool) or not isinstance(overlap, int) or not 0 <= overlap < max_chars:
        raise ValueError("overlap must be in 0..max_chars-1")
    chunks: list[str] = []
    cur: list[str] = []
    size = 0

    def emit() -> None:
        s = "".join(cur).strip(WHITESPACE)
        if s:
            chunks.append(s)

    for p in _pieces(text, max_chars):
        if cur and size + len(p) > max_chars:
            emit()
            keep: list[str] = []
            total = 0
            if overlap:
                for q in reversed(cur[1:]):  # never repeat the whole previous chunk
                    if total + len(q) > overlap:
                        break
                    keep.insert(0, q)
                    total += len(q)
            while keep and total + len(p) > max_chars:
                total -= len(keep.pop(0))
            cur, size = keep, total
        cur.append(p)
        size += len(p)
    if cur:
        emit()
    return chunks
