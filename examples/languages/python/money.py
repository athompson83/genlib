# SPDX-License-Identifier: Apache-2.0
"""Money as integer minor units: exact parsing, formatting, rate application and allocation.

No floating point anywhere. Results are checked against the signed 64-bit range so values stay
portable to databases and other languages. Rates round half to even (banker's rounding).
"""
import re

_EXPONENTS = {
    **dict.fromkeys(("USD", "EUR", "GBP", "CAD", "AUD", "CHF", "CNY", "INR", "MXN", "BRL", "SEK",
                     "NOK", "DKK", "NZD", "SGD", "HKD", "ZAR"), 2),
    **dict.fromkeys(("JPY", "KRW", "VND", "CLP", "ISK"), 0),
    **dict.fromkeys(("BHD", "KWD", "JOD", "OMR", "TND"), 3),
}
_DECIMAL = re.compile(r"(-?)([0-9]+)(?:\.([0-9]+))?")
_INT64_MIN, _INT64_MAX = -(2**63), 2**63 - 1


def _int(value, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise TypeError(f"{name} must be an integer")
    return value


def _int64(value: int) -> int:
    if not _INT64_MIN <= value <= _INT64_MAX:
        raise OverflowError("result exceeds the signed 64-bit range")
    return value


def exponent(currency: str) -> int:
    """ISO 4217 minor-unit exponent for a supported upper-case currency code."""
    if not isinstance(currency, str) or currency not in _EXPONENTS:
        raise ValueError(f"unsupported currency: {currency!r}")
    return _EXPONENTS[currency]


def _parse_decimal(text: str, max_fraction: int, name: str) -> tuple[int, int]:
    """Returns (scaled integer, scale) for -?DIGITS(.DIGITS)?."""
    match = _DECIMAL.fullmatch(text) if isinstance(text, str) else None
    if not match:
        raise ValueError(f"{name} must match -?DIGITS(.DIGITS)?: {text!r}")
    sign, whole, fraction = match.group(1), match.group(2), match.group(3) or ""
    if len(fraction) > max_fraction:
        raise ValueError(f"{name} has more than {max_fraction} fraction digits: {text!r}")
    value = int(whole + fraction)
    return (-value if sign else value), len(fraction)


def to_minor(amount: str, currency: str) -> int:
    """Decimal string to minor units; never rounds (extra fraction digits are an error)."""
    exp = exponent(currency)
    value, scale = _parse_decimal(amount, exp, "amount")
    return _int64(value * 10 ** (exp - scale))


def format_minor(minor: int, currency: str) -> str:
    """Minor units to a plain decimal string without symbol or grouping."""
    exp = exponent(currency)
    minor = _int64(_int(minor, "minor"))
    sign, digits = ("-" if minor < 0 else ""), str(abs(minor))
    if exp == 0:
        return sign + digits
    digits = digits.rjust(exp + 1, "0")
    return f"{sign}{digits[:-exp]}.{digits[-exp:]}"


def apply_rate(minor: int, rate: str) -> int:
    """minor * rate rounded half to even on the exact product (rate has at most 9 decimals)."""
    minor = _int64(_int(minor, "minor"))
    scaled, scale = _parse_decimal(rate, 9, "rate")
    product, divisor = minor * scaled, 10**scale
    quotient, remainder = divmod(abs(product), divisor)
    if remainder * 2 > divisor or (remainder * 2 == divisor and quotient % 2 == 1):
        quotient += 1
    return _int64(-quotient if product < 0 else quotient)


def allocate(total: int, ratios: list[int]) -> list[int]:
    """Splits total by non-negative integer ratios using the largest-remainder method.

    Shares are floor(|total| * r / sum); leftover units go one each to the entries with the largest
    remainder (|total| * r mod sum), ties to the lower index. Negative totals are allocated by magnitude
    and negated. The result always sums to total.
    """
    total = _int64(_int(total, "total"))
    if not isinstance(ratios, (list, tuple)) or not ratios:
        raise ValueError("ratios must be a non-empty list")
    for r in ratios:
        if _int(r, "ratio") < 0:
            raise ValueError("ratios must be non-negative")
    weight = sum(ratios)
    if weight <= 0:
        raise ValueError("ratios must have a positive sum")
    magnitude = abs(total)
    shares = [magnitude * r // weight for r in ratios]
    remainders = [magnitude * r % weight for r in ratios]
    order = sorted(range(len(ratios)), key=lambda i: (-remainders[i], i))
    for i in order[: magnitude - sum(shares)]:
        shares[i] += 1
    return [-s for s in shares] if total < 0 else shares
