// SPDX-License-Identifier: Apache-2.0
// Service worker code for the receiving browser, as a string: write it into your service worker file (or
// importScripts a static copy of it). It shows a notification for each push and, on click, focuses or opens a
// URL on the service worker's own origin only.
//
// Expected payload (JSON): {"title": "...", "body": "...", "url": "/inbox/42", "tag": "...", "icon": "/icon.png"}
// A cross-origin, javascript: or malformed url is dropped, so a click opens nothing rather than another site.
// A non-JSON payload is shown as the body text.

export const serviceWorkerSnippet = String.raw`(() => {
  const sameOriginUrl = (raw, origin) => {
    if (raw === undefined || raw === null || raw === "") return origin + "/";
    if (typeof raw !== "string") return null;
    try {
      const url = new URL(raw, origin);
      return url.origin === origin && (url.protocol === "https:" || url.protocol === "http:") ? url.href : null;
    } catch {
      return null;
    }
  };
  const text = (value, max) => (typeof value === "string" ? value.slice(0, max) : "");

  self.addEventListener("push", (event) => {
    let data = {};
    if (event.data) {
      try {
        const parsed = event.data.json();
        data = parsed && typeof parsed === "object" ? parsed : { body: String(parsed) };
      } catch {
        data = { body: event.data.text() };
      }
    }
    const origin = self.location.origin;
    const options = { body: text(data.body, 500), data: { url: sameOriginUrl(data.url, origin) } };
    if (typeof data.tag === "string") options.tag = data.tag.slice(0, 64);
    const icon = typeof data.icon === "string" ? sameOriginUrl(data.icon, origin) : null;
    if (icon) options.icon = icon;
    event.waitUntil(self.registration.showNotification(text(data.title, 120) || "Notification", options));
  });

  self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const data = event.notification.data;
    const target = data && typeof data.url === "string" ? sameOriginUrl(data.url, self.location.origin) : null;
    if (!target) return;
    event.waitUntil(
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
        for (const client of windows) if (client.url === target && "focus" in client) return client.focus();
        return self.clients.openWindow(target);
      }),
    );
  });
})();
`;
