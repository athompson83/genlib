// SPDX-License-Identifier: Apache-2.0

// Package sse parses and formats server-sent events following the WHATWG HTML
// "event stream" interpretation. The parser is incremental: text may arrive in
// arbitrary chunks, including a CRLF split across two chunks.
package sse

import (
	"errors"
	"strconv"
	"strings"
)

// Event is one dispatched event. Event defaults to "message"; ID is the last
// event id seen, which persists across events.
type Event struct {
	Event, Data, ID string
}

// Parser is an incremental event-stream parser. The zero value is ready to use.
type Parser struct {
	buf       strings.Builder
	data      []string
	hasData   bool
	event     string
	lastID    string
	retry     int64
	hasRetry  bool
	pendingCR bool
	started   bool
}

// NewParser returns an empty parser.
func NewParser() *Parser { return &Parser{} }

// Retry returns the latest valid retry value in milliseconds and whether one arrived.
func (p *Parser) Retry() (int64, bool) { return p.retry, p.hasRetry }

// Feed consumes a chunk of stream text and returns the events it completed.
func (p *Parser) Feed(text string) []Event {
	out := []Event{}
	if !p.started && text != "" {
		text = strings.TrimPrefix(text, "\uFEFF")
		p.started = true
	}
	for i := 0; i < len(text); i++ {
		c := text[i]
		if p.pendingCR {
			p.pendingCR = false
			if c == '\n' {
				continue
			}
		}
		switch c {
		case '\r':
			p.pendingCR = true
			out = p.line(out)
		case '\n':
			out = p.line(out)
		default:
			p.buf.WriteByte(c)
		}
	}
	return out
}

func (p *Parser) line(out []Event) []Event {
	line := p.buf.String()
	p.buf.Reset()
	if line == "" {
		if p.hasData {
			ev := p.event
			if ev == "" {
				ev = "message"
			}
			out = append(out, Event{Event: ev, Data: strings.Join(p.data, "\n"), ID: p.lastID})
		}
		p.data, p.hasData, p.event = nil, false, ""
		return out
	}
	if line[0] == ':' {
		return out
	}
	field, value := line, ""
	if i := strings.IndexByte(line, ':'); i >= 0 {
		field, value = line[:i], strings.TrimPrefix(line[i+1:], " ")
	}
	switch field {
	case "data":
		p.data, p.hasData = append(p.data, value), true
	case "event":
		p.event = value
	case "id":
		if !strings.ContainsRune(value, 0) {
			p.lastID = value
		}
	case "retry":
		if value != "" && strings.Trim(value, "0123456789") == "" {
			if n, err := strconv.ParseInt(value, 10, 64); err == nil {
				p.retry, p.hasRetry = n, true
			}
		}
	}
	return out
}

// Parse returns all complete events in text; an unterminated final event is dropped.
func Parse(text string) []Event { return NewParser().Feed(text) }

// FormatOptions holds the optional event fields; nil means absent.
type FormatOptions struct {
	Event *string
	ID    *string
	Retry *int64
}

// Format renders one event: event, id and retry lines (when given), one data line per line of data, then a blank line.
func Format(data string, opts FormatOptions) (string, error) {
	if opts.Event != nil && strings.ContainsAny(*opts.Event, "\r\n") {
		return "", errors.New("sse: event must not contain line breaks")
	}
	if opts.ID != nil && strings.ContainsAny(*opts.ID, "\r\n") {
		return "", errors.New("sse: id must not contain line breaks")
	}
	if opts.ID != nil && strings.ContainsRune(*opts.ID, 0) {
		return "", errors.New("sse: id must not contain NUL")
	}
	if opts.Retry != nil && *opts.Retry < 0 {
		return "", errors.New("sse: retry must be >= 0")
	}
	var b strings.Builder
	if opts.Event != nil {
		b.WriteString("event: " + *opts.Event + "\n")
	}
	if opts.ID != nil {
		b.WriteString("id: " + *opts.ID + "\n")
	}
	if opts.Retry != nil {
		b.WriteString("retry: " + strconv.FormatInt(*opts.Retry, 10) + "\n")
	}
	data = strings.ReplaceAll(strings.ReplaceAll(data, "\r\n", "\n"), "\r", "\n")
	for _, l := range strings.Split(data, "\n") {
		b.WriteString("data: " + l + "\n")
	}
	b.WriteString("\n")
	return b.String(), nil
}

// FormatComment renders a comment line (a keep-alive ping): ":\n\n" or ": text\n\n".
func FormatComment(text string) (string, error) {
	if strings.ContainsAny(text, "\r\n") {
		return "", errors.New("sse: comment must be one line")
	}
	if text == "" {
		return ":\n\n", nil
	}
	return ": " + text + "\n\n", nil
}
