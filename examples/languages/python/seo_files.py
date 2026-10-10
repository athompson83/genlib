# SPDX-License-Identifier: Apache-2.0
"""sitemap.xml, robots.txt (with AI-crawler rules) and llms.txt generation.

Pure and deterministic: no network access, "\\n" newlines. Sitemaps follow
https://www.sitemaps.org/protocol.html and llms.txt follows https://llmstxt.org.
robots.txt is advisory: crawlers may ignore it, so never rely on it for access control.
"""
import math
import re
from collections.abc import Mapping, Sequence
from typing import Any, Optional

CHANGE_FREQS = ("always", "hourly", "daily", "weekly", "monthly", "yearly", "never")
#: Output lists these user agents exactly in this order.
AI_CRAWLERS = ("GPTBot", "ChatGPT-User", "OAI-SearchBot", "ClaudeBot", "Claude-Web", "anthropic-ai",
               "Google-Extended", "PerplexityBot", "CCBot", "Bytespider", "Applebot-Extended",
               "Meta-ExternalAgent")
MAX_SITEMAP_ENTRIES = 50000

_URL = re.compile(r"(https?)://[^/?#]+", re.IGNORECASE)
_BAD_URL_CHARS = re.compile(r"[\x00-\x20\x7f]")
_DATE = re.compile(r"([0-9]{4})-([0-9]{2})-([0-9]{2})")
_XML = {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"}


def is_absolute_http_url(value: Any, https_only: bool = False) -> bool:
    """Absolute http(s) URL with a host and no whitespace or control characters."""
    if not isinstance(value, str) or _BAD_URL_CHARS.search(value):
        return False
    match = _URL.match(value)
    return bool(match) and (not https_only or match.group(1).lower() == "https")


def xml_escape(value: str) -> str:
    """Escapes & < > " ' for XML text and attribute values."""
    return "".join(_XML.get(ch, ch) for ch in value)


def _is_date(value: str) -> bool:
    match = _DATE.fullmatch(value)
    if not match:
        return False
    year, month, day = (int(g) for g in match.groups())
    leap = (year % 4 == 0 and year % 100 != 0) or year % 400 == 0
    days = [31, 29 if leap else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    return 1 <= month <= 12 and 1 <= day <= days[month - 1]


def format_priority(priority: float) -> str:
    """One decimal, rounding half up on priority * 10 (0.25 -> "0.3", 0.85 -> "0.9")."""
    tenths = math.floor(priority * 10 + 0.5)
    return f"{tenths // 10}.{tenths % 10}"


def sitemap_xml(entries: Sequence[Mapping[str, Any]]) -> str:
    """Entries are dicts with loc and optional lastmod, changefreq, priority."""
    if isinstance(entries, (str, bytes)) or not isinstance(entries, Sequence):
        raise TypeError("entries must be a list")
    if len(entries) > MAX_SITEMAP_ENTRIES:
        raise ValueError(f"a sitemap holds at most {MAX_SITEMAP_ENTRIES} entries")
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for i, entry in enumerate(entries):
        unknown = set(entry) - {"loc", "lastmod", "changefreq", "priority"}
        if unknown:
            raise ValueError(f"entry {i}: unknown keys {sorted(unknown)}")
        loc = entry.get("loc")
        if not is_absolute_http_url(loc):
            raise ValueError(f"entry {i}: loc must be an absolute http(s) URL")
        lines += ["  <url>", f"    <loc>{xml_escape(loc)}</loc>"]
        lastmod = entry.get("lastmod")
        if lastmod is not None:
            if not isinstance(lastmod, str) or not _is_date(lastmod):
                raise ValueError(f"entry {i}: lastmod must be a valid YYYY-MM-DD date")
            lines.append(f"    <lastmod>{lastmod}</lastmod>")
        changefreq = entry.get("changefreq")
        if changefreq is not None:
            if changefreq not in CHANGE_FREQS:
                raise ValueError(f"entry {i}: changefreq must be one of {', '.join(CHANGE_FREQS)}")
            lines.append(f"    <changefreq>{changefreq}</changefreq>")
        priority = entry.get("priority")
        if priority is not None:
            if (isinstance(priority, bool) or not isinstance(priority, (int, float))
                    or not math.isfinite(priority) or not 0 <= priority <= 1):
                raise ValueError(f"entry {i}: priority must be a number from 0.0 to 1.0")
            lines.append(f"    <priority>{format_priority(priority)}</priority>")
        lines.append("  </url>")
    lines.append("</urlset>")
    return "\n".join(lines) + "\n"


def _single_line(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} must be a non-empty string")
    if "\r" in value or "\n" in value:
        raise ValueError(f"{label} must not contain newline characters")
    return value


def _robots_path(value: Any, label: str) -> str:
    path = _single_line(value, label)
    if not path.startswith(("/", "*")):
        raise ValueError(f'{label} must start with "/" or "*"')
    return path


def robots_txt(rules: Sequence[Mapping[str, Any]] = (), ai_crawlers: str = "default",
               sitemaps: Sequence[str] = ()) -> str:
    """Rules are dicts with userAgent and optional allow/disallow path lists."""
    if ai_crawlers not in ("allow", "disallow", "default"):
        raise ValueError('ai_crawlers must be "allow", "disallow" or "default"')
    lines: list[str] = []
    for i, rule in enumerate(rules):
        allow = list(rule.get("allow") or ())
        disallow = list(rule.get("disallow") or ())
        if not allow and not disallow:
            raise ValueError(f"rule {i}: add at least one allow or disallow path")
        lines.append(f"User-agent: {_single_line(rule.get('userAgent'), f'rule {i} userAgent')}")
        lines += [f"Allow: {_robots_path(p, f'rule {i} allow path')}" for p in allow]
        lines += [f"Disallow: {_robots_path(p, f'rule {i} disallow path')}" for p in disallow]
        lines.append("")
    if ai_crawlers != "default":
        lines += [f"User-agent: {agent}" for agent in AI_CRAWLERS]
        lines += ["Allow: /" if ai_crawlers == "allow" else "Disallow: /", ""]
    for url in sitemaps:
        if not is_absolute_http_url(url):
            raise ValueError("sitemaps must be absolute http(s) URLs")
        lines.append(f"Sitemap: {url}")
    if lines and lines[-1] == "":
        lines.pop()
    return "\n".join(lines) + "\n" if lines else ""


def llms_txt(title: str, summary: Optional[str] = None,
             sections: Sequence[Mapping[str, Any]] = ()) -> str:
    """Sections are dicts {name, links: [{title, url, description?}]}."""
    lines = [f"# {_single_line(title, 'title')}", ""]
    if summary:
        lines += [f"> {_single_line(summary, 'summary')}", ""]
    for i, section in enumerate(sections):
        links = section.get("links") or []
        if not links:
            raise ValueError(f"section {i}: add at least one link")
        if i > 0:
            lines.append("")
        lines += [f"## {_single_line(section.get('name'), f'section {i} name')}", ""]
        for j, link in enumerate(links):
            label = f"section {i} link {j}"
            link_title = _single_line(link.get("title"), f"{label} title").replace("]", "\\]")
            url = link.get("url")
            if not is_absolute_http_url(url):
                raise ValueError(f"{label} url must be an absolute http(s) URL")
            description = link.get("description")
            suffix = f": {_single_line(description, f'{label} description')}" if description else ""
            lines.append(f"- [{link_title}]({url}){suffix}")
    while lines and lines[-1] == "":
        lines.pop()
    return "\n".join(lines) + "\n"
