// SPDX-License-Identifier: Apache-2.0

/** Server-sent events (WHATWG HTML event stream): incremental parser and formatter. */
object Sse {
    /** One dispatched event: type (default "message"), data lines joined with "\n" and the last event id. */
    data class Event(val event: String, val data: String, val id: String)

    /** Incremental parser; text may arrive in arbitrary chunks, including a CRLF split across chunks. */
    class Parser {
        private val buf = StringBuilder()
        private val data = mutableListOf<String>()
        private var event = ""
        private var lastId = ""
        private var pendingCr = false
        private var first = true

        /** Latest valid retry value in milliseconds, or null until one arrives. */
        var retry: Long? = null
            private set

        /** Feeds a chunk of stream text and returns the events completed by it. */
        fun feed(chunk: String): List<Event> {
            var text = chunk
            val out = mutableListOf<Event>()
            if (first && text.isNotEmpty()) {
                if (text[0] == '﻿') text = text.substring(1)
                first = false
            }
            for (ch in text) {
                if (pendingCr) {
                    pendingCr = false
                    if (ch == '\n') continue
                }
                when (ch) {
                    '\r' -> { pendingCr = true; line(buf.toString(), out); buf.setLength(0) }
                    '\n' -> { line(buf.toString(), out); buf.setLength(0) }
                    else -> buf.append(ch)
                }
            }
            return out
        }

        private fun line(line: String, out: MutableList<Event>) {
            if (line.isEmpty()) {
                if (data.isNotEmpty()) out.add(Event(event.ifEmpty { "message" }, data.joinToString("\n"), lastId))
                data.clear()
                event = ""
                return
            }
            if (line.startsWith(":")) return
            val colon = line.indexOf(':')
            val field = if (colon < 0) line else line.substring(0, colon)
            var value = if (colon < 0) "" else line.substring(colon + 1)
            if (colon >= 0 && value.startsWith(" ")) value = value.substring(1)
            when (field) {
                "data" -> data.add(value)
                "event" -> event = value
                "id" -> if ('\u0000' !in value) lastId = value
                "retry" -> if (value.isNotEmpty() && value.all { it in '0'..'9' }) value.toLongOrNull()?.let { retry = it }
            }
        }
    }

    /** All complete events in text (an unterminated final event is dropped). */
    fun parse(text: String): List<Event> = Parser().feed(text)

    /** One event as stream text; null event, id or retry are omitted; each data line becomes a data: line. */
    fun format(data: String, event: String? = null, id: String? = null, retry: Long? = null): String {
        require(event == null || ('\r' !in event && '\n' !in event)) { "event must not contain line breaks" }
        require(id == null || ('\r' !in id && '\n' !in id)) { "id must not contain line breaks" }
        require(id == null || '\u0000' !in id) { "id must not contain NUL" }
        require(retry == null || retry >= 0) { "retry must be >= 0" }
        val out = StringBuilder()
        if (event != null) out.append("event: ").append(event).append('\n')
        if (id != null) out.append("id: ").append(id).append('\n')
        if (retry != null) out.append("retry: ").append(retry).append('\n')
        for (line in data.replace("\r\n", "\n").replace('\r', '\n').split("\n")) out.append("data: ").append(line).append('\n')
        return out.append('\n').toString()
    }

    /** A comment line (keep-alive ping) that dispatches no event: ": text\n\n", or ":\n\n" when empty. */
    fun formatComment(text: String = ""): String {
        require('\r' !in text && '\n' !in text) { "comment must be one line" }
        return ":" + (if (text.isEmpty()) "" else " $text") + "\n\n"
    }
}
