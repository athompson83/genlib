import { JSDOM } from "jsdom";
import { act } from "react";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://example.test/" });
for (const key of ["window", "document", "HTMLElement", "HTMLInputElement", "Node", "Event", "KeyboardEvent", "MouseEvent"]) {
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === "window" ? dom.window : dom.window[key] });
}
Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");

export async function render(element) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => { root.render(element); });
  return {
    container,
    async rerender(next) { await act(async () => { root.render(next); }); },
    async cleanup() { await act(async () => { root.unmount(); }); container.remove(); },
  };
}

export async function click(element) {
  if (!element) throw new Error("Click target was not found.");
  await act(async () => { element.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true })); });
}

export async function type(input, value) {
  if (!input) throw new Error("Input target was not found.");
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

export async function submit(form) {
  if (!form) throw new Error("Form was not found.");
  await act(async () => { form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })); });
}

export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
