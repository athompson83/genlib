// SPDX-License-Identifier: Apache-2.0

// Package seofiles generates sitemap.xml, robots.txt (with AI-crawler rules)
// and llms.txt. Output is deterministic with "\n" newlines and no network
// access. robots.txt is advisory, so never rely on it for access control.
package seofiles

import (
	"errors"
	"fmt"
	"math"
	"regexp"
	"strings"
	"time"
)

// ChangeFreqs lists the sitemap changefreq values.
var ChangeFreqs = []string{"always", "hourly", "daily", "weekly", "monthly", "yearly", "never"}

// AICrawlers lists AI crawler user agents in output order.
var AICrawlers = []string{
	"GPTBot", "ChatGPT-User", "OAI-SearchBot", "ClaudeBot", "Claude-Web", "anthropic-ai",
	"Google-Extended", "PerplexityBot", "CCBot", "Bytespider", "Applebot-Extended", "Meta-ExternalAgent",
}

// MaxSitemapEntries is the sitemap protocol limit per file.
const MaxSitemapEntries = 50000

// AI crawler policies for RobotsTxt.
const (
	AIDefault  = "default"
	AIAllow    = "allow"
	AIDisallow = "disallow"
)

var (
	urlRE  = regexp.MustCompile(`(?i)^(https?)://[^/?#]+`)
	badRE  = regexp.MustCompile(`[\x00-\x20\x7f]`)
	dateRE = regexp.MustCompile(`^[0-9]{4}-[0-9]{2}-[0-9]{2}$`)
	xmlEsc = strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;", "'", "&apos;")
)

// Entry is one sitemap URL. Empty strings and a nil Priority are omitted.
type Entry struct {
	Loc        string
	LastMod    string
	ChangeFreq string
	Priority   *float64
}

// Rule is one robots.txt group.
type Rule struct {
	UserAgent string
	Allow     []string
	Disallow  []string
}

// Link is one llms.txt link; Description is optional.
type Link struct {
	Title       string
	URL         string
	Description string
}

// Section is one llms.txt "## name" section.
type Section struct {
	Name  string
	Links []Link
}

// IsAbsoluteHTTPURL reports whether s is an absolute http(s) URL with a host
// and no whitespace or control characters.
func IsAbsoluteHTTPURL(s string, httpsOnly bool) bool {
	if badRE.MatchString(s) {
		return false
	}
	m := urlRE.FindStringSubmatch(s)
	return m != nil && (!httpsOnly || strings.EqualFold(m[1], "https"))
}

// XMLEscape escapes & < > " and '.
func XMLEscape(s string) string { return xmlEsc.Replace(s) }

// FormatPriority renders one decimal, rounding half up on p*10.
func FormatPriority(p float64) string {
	tenths := int(math.Floor(p*10 + 0.5))
	return fmt.Sprintf("%d.%d", tenths/10, tenths%10)
}

func contains(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}

// SitemapXML renders a sitemaps.org urlset with a trailing newline.
func SitemapXML(entries []Entry) (string, error) {
	if len(entries) > MaxSitemapEntries {
		return "", fmt.Errorf("a sitemap holds at most %d entries", MaxSitemapEntries)
	}
	lines := []string{`<?xml version="1.0" encoding="UTF-8"?>`, `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`}
	for i, e := range entries {
		if !IsAbsoluteHTTPURL(e.Loc, false) {
			return "", fmt.Errorf("entry %d: loc must be an absolute http(s) URL", i)
		}
		lines = append(lines, "  <url>", "    <loc>"+XMLEscape(e.Loc)+"</loc>")
		if e.LastMod != "" {
			if _, err := time.Parse("2006-01-02", e.LastMod); err != nil || !dateRE.MatchString(e.LastMod) {
				return "", fmt.Errorf("entry %d: lastmod must be a valid YYYY-MM-DD date", i)
			}
			lines = append(lines, "    <lastmod>"+e.LastMod+"</lastmod>")
		}
		if e.ChangeFreq != "" {
			if !contains(ChangeFreqs, e.ChangeFreq) {
				return "", fmt.Errorf("entry %d: changefreq must be one of %s", i, strings.Join(ChangeFreqs, ", "))
			}
			lines = append(lines, "    <changefreq>"+e.ChangeFreq+"</changefreq>")
		}
		if e.Priority != nil {
			p := *e.Priority
			if math.IsNaN(p) || p < 0 || p > 1 {
				return "", fmt.Errorf("entry %d: priority must be a number from 0.0 to 1.0", i)
			}
			lines = append(lines, "    <priority>"+FormatPriority(p)+"</priority>")
		}
		lines = append(lines, "  </url>")
	}
	lines = append(lines, "</urlset>")
	return strings.Join(lines, "\n") + "\n", nil
}

func singleLine(s, label string) (string, error) {
	if strings.TrimSpace(s) == "" {
		return "", fmt.Errorf("%s must be a non-empty string", label)
	}
	if strings.ContainsAny(s, "\r\n") {
		return "", fmt.Errorf("%s must not contain newline characters", label)
	}
	return s, nil
}

func robotsPath(s, label string) (string, error) {
	p, err := singleLine(s, label)
	if err == nil && !strings.HasPrefix(p, "/") && !strings.HasPrefix(p, "*") {
		err = fmt.Errorf(`%s must start with "/" or "*"`, label)
	}
	return p, err
}

// RobotsTxt renders rule groups, an optional AI crawler group and Sitemap lines.
// aiCrawlers is AIDefault (or ""), AIAllow or AIDisallow.
func RobotsTxt(rules []Rule, aiCrawlers string, sitemaps []string) (string, error) {
	if aiCrawlers == "" {
		aiCrawlers = AIDefault
	}
	if aiCrawlers != AIDefault && aiCrawlers != AIAllow && aiCrawlers != AIDisallow {
		return "", errors.New(`aiCrawlers must be "allow", "disallow" or "default"`)
	}
	var lines []string
	for i, r := range rules {
		if len(r.Allow)+len(r.Disallow) == 0 {
			return "", fmt.Errorf("rule %d: add at least one allow or disallow path", i)
		}
		ua, err := singleLine(r.UserAgent, fmt.Sprintf("rule %d userAgent", i))
		if err != nil {
			return "", err
		}
		lines = append(lines, "User-agent: "+ua)
		for _, group := range []struct {
			name  string
			paths []string
		}{{"Allow", r.Allow}, {"Disallow", r.Disallow}} {
			for _, p := range group.paths {
				path, err := robotsPath(p, fmt.Sprintf("rule %d %s path", i, strings.ToLower(group.name)))
				if err != nil {
					return "", err
				}
				lines = append(lines, group.name+": "+path)
			}
		}
		lines = append(lines, "")
	}
	if aiCrawlers != AIDefault {
		for _, agent := range AICrawlers {
			lines = append(lines, "User-agent: "+agent)
		}
		if aiCrawlers == AIAllow {
			lines = append(lines, "Allow: /", "")
		} else {
			lines = append(lines, "Disallow: /", "")
		}
	}
	for _, u := range sitemaps {
		if !IsAbsoluteHTTPURL(u, false) {
			return "", errors.New("sitemaps must be absolute http(s) URLs")
		}
		lines = append(lines, "Sitemap: "+u)
	}
	if n := len(lines); n > 0 && lines[n-1] == "" {
		lines = lines[:n-1]
	}
	if len(lines) == 0 {
		return "", nil
	}
	return strings.Join(lines, "\n") + "\n", nil
}

// LlmsTxt renders an llms.txt file (https://llmstxt.org). An empty summary is omitted.
func LlmsTxt(title, summary string, sections []Section) (string, error) {
	t, err := singleLine(title, "title")
	if err != nil {
		return "", err
	}
	lines := []string{"# " + t, ""}
	if summary != "" {
		s, err := singleLine(summary, "summary")
		if err != nil {
			return "", err
		}
		lines = append(lines, "> "+s, "")
	}
	for i, sec := range sections {
		if len(sec.Links) == 0 {
			return "", fmt.Errorf("section %d: add at least one link", i)
		}
		name, err := singleLine(sec.Name, fmt.Sprintf("section %d name", i))
		if err != nil {
			return "", err
		}
		if i > 0 {
			lines = append(lines, "")
		}
		lines = append(lines, "## "+name, "")
		for j, l := range sec.Links {
			label := fmt.Sprintf("section %d link %d", i, j)
			lt, err := singleLine(l.Title, label+" title")
			if err != nil {
				return "", err
			}
			if !IsAbsoluteHTTPURL(l.URL, false) {
				return "", fmt.Errorf("%s url must be an absolute http(s) URL", label)
			}
			suffix := ""
			if l.Description != "" {
				d, err := singleLine(l.Description, label+" description")
				if err != nil {
					return "", err
				}
				suffix = ": " + d
			}
			lines = append(lines, "- ["+strings.ReplaceAll(lt, "]", `\]`)+"]("+l.URL+")"+suffix)
		}
	}
	for len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}
	return strings.Join(lines, "\n") + "\n", nil
}
