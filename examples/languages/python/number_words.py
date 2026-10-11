# SPDX-License-Identifier: Apache-2.0
"""English number words in US style without "and": cardinals, ordinals, suffixes and money.

number_to_words() covers |n| < 10^15 with thousand/million/billion/trillion groups, hyphenated
21-99 ("forty-two"), "one hundred five" and omitted zero groups ("one million one"); negatives start
with "negative". ordinal_words() makes the last word ordinal ("twenty-first", "one hundredth",
"zeroth"). ordinal_suffix() gives "1st", "11th", "112th", "-22nd". money_words() spells an amount in
minor units: "one dollar and one cent", "zero dollars"; the minor part is omitted when it is 0 or
when the exponent is 0. Plurals only add "s", so pass irregular names already suited to the count.
"""

_ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven",
         "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"]
_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]
_SCALES = ["", "thousand", "million", "billion", "trillion"]
_IRREGULAR = {"one": "first", "two": "second", "three": "third", "five": "fifth", "eight": "eighth",
              "nine": "ninth", "twelve": "twelfth"}


class NumberWordsError(ValueError):
    """Raised for a number out of range or bad money arguments."""


def _is_int(n) -> bool:
    return isinstance(n, int) and not isinstance(n, bool)


def _under_1000(n: int) -> str:
    parts = []
    if n >= 100:
        parts.append(_ONES[n // 100] + " hundred")
        n %= 100
    if n >= 20:
        parts.append(_TENS[n // 10] + ("-" + _ONES[n % 10] if n % 10 else ""))
    elif n > 0:
        parts.append(_ONES[n])
    return " ".join(parts)


def number_to_words(n: int) -> str:
    """Spell an integer with |n| < 10^15 in English words."""
    if not _is_int(n) or abs(n) >= 10**15:
        raise NumberWordsError("number must be an integer with |n| < 10^15")
    if n == 0:
        return "zero"
    if n < 0:
        return "negative " + number_to_words(-n)
    groups = []
    i = 0
    while n > 0:
        g = n % 1000
        if g:
            groups.append(_under_1000(g) + (" " + _SCALES[i] if _SCALES[i] else ""))
        n //= 1000
        i += 1
    return " ".join(reversed(groups))


def _ordinal(word: str) -> str:
    if word in _IRREGULAR:
        return _IRREGULAR[word]
    if word.endswith("y"):
        return word[:-1] + "ieth"
    return word + "th"


def ordinal_words(n: int) -> str:
    """Spell a non-negative integer as an ordinal ("twenty-first")."""
    if not _is_int(n) or n < 0:
        raise NumberWordsError("ordinal needs a non-negative integer")
    words = number_to_words(n).split(" ")
    last = words[-1]
    if "-" in last:
        tens, unit = last.split("-")
        words[-1] = tens + "-" + _ordinal(unit)
    else:
        words[-1] = _ordinal(last)
    return " ".join(words)


def ordinal_suffix(n: int) -> str:
    """The integer followed by st, nd, rd or th ("1st", "12th", "-22nd")."""
    if not _is_int(n):
        raise NumberWordsError("ordinal suffix needs an integer")
    a = abs(n)
    suffix = "th" if a % 100 in (11, 12, 13) else {1: "st", 2: "nd", 3: "rd"}.get(a % 10, "th")
    return str(n) + suffix


def money_words(minor: int, major: str, minor_name: str, exponent: int = 2) -> str:
    """Spell an amount in minor units ("one hundred twenty-three dollars and forty-five cents")."""
    if not _is_int(minor) or minor < 0 or exponent not in (0, 1, 2, 3):
        raise NumberWordsError("minor must be a non-negative integer and exponent 0..3")
    whole, frac = divmod(minor, 10**exponent)
    out = number_to_words(whole) + " " + major + ("" if whole == 1 else "s")
    if exponent and frac:
        out += " and " + number_to_words(frac) + " " + minor_name + ("" if frac == 1 else "s")
    return out
