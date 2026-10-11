# SPDX-License-Identifier: Apache-2.0
"""POSIX shell quoting and splitting with no expansion.

shell_quote() returns '' for the empty string, the argument unchanged when it only uses
A-Z a-z 0-9 @ % + = : , . / _ -, and otherwise wraps it in single quotes with each ' written as '\\''.
shell_split() splits on unquoted space, tab and newline. Single quotes are literal; inside double
quotes a backslash escapes only $ ` " \\ and newline (backslash-newline is removed); outside quotes a
backslash escapes the next character. Adjacent parts join into one word, '' makes an empty word and
'#' starts a comment only at the start of a word. Nothing is expanded: $VAR, * and ~ stay literal.
An unterminated quote or a trailing backslash raises ShellQuoteError. Never build a shell command by
string concatenation when you can pass an argument list to the process API instead.
"""

import re

_SAFE = re.compile(r"[A-Za-z0-9@%+=:,./_-]+")


class ShellQuoteError(ValueError):
    """Raised for an unterminated quote or a trailing backslash."""


def shell_quote(arg: str) -> str:
    """Quote one argument for a POSIX shell."""
    if arg == "":
        return "''"
    if _SAFE.fullmatch(arg):
        return arg
    return "'" + arg.replace("'", "'\\''") + "'"


def shell_join(args) -> str:
    """Quote each argument and join them with single spaces."""
    return " ".join(shell_quote(a) for a in args)


def shell_split(line: str) -> list[str]:
    """Split a command line into words like a POSIX shell, without any expansion."""
    words: list[str] = []
    cur: str | None = None
    i, n = 0, len(line)
    while i < n:
        c = line[i]
        if c in " \t\n":
            if cur is not None:
                words.append(cur)
                cur = None
            i += 1
            continue
        if c == "#" and cur is None:
            j = line.find("\n", i)
            i = n if j < 0 else j
            continue
        if cur is None:
            cur = ""
        if c == "'":
            j = line.find("'", i + 1)
            if j < 0:
                raise ShellQuoteError("unterminated single quote")
            cur += line[i + 1:j]
            i = j + 1
        elif c == '"':
            i += 1
            while True:
                if i >= n:
                    raise ShellQuoteError("unterminated double quote")
                d = line[i]
                if d == '"':
                    i += 1
                    break
                if d == "\\" and i + 1 < n and line[i + 1] in '$`"\\\n':
                    if line[i + 1] != "\n":
                        cur += line[i + 1]
                    i += 2
                    continue
                cur += d
                i += 1
        elif c == "\\":
            if i + 1 >= n:
                raise ShellQuoteError("trailing backslash")
            if line[i + 1] != "\n":
                cur += line[i + 1]
            elif cur == "":
                cur = None
            i += 2
        else:
            cur += c
            i += 1
    if cur is not None:
        words.append(cur)
    return words
