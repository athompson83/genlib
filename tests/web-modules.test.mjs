import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createElement as h, act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { render, click, type, submit, deferred } from "./web-dom.mjs";
import { AppShell } from "../.build/modules/app-shell/files/AppShell.js";
import { DataTable, selectTableRows } from "../.build/modules/data-table/files/DataTable.js";
import { ValidatedForm } from "../.build/modules/validated-form/files/ValidatedForm.js";

const tableColumns = [
  { id: "name", header: "Name", value: (row) => row.name, sortable: true },
  { id: "tasks", header: "Tasks", value: (row) => row.tasks, sortable: true, searchable: false, align: "end" },
];
const tableRows = [
  { id: "zoe", name: "Zoe", tasks: 3 },
  { id: "ada", name: "Ada", tasks: 1 },
  { id: "miko", name: "Miko", tasks: 2 },
  { id: "nora", name: "Nora", tasks: 4 },
];
const rowId = (row) => row.id;
const visibleNames = (container) => Array.from(container.querySelectorAll("tbody tr"), (row) => row.querySelector("td")?.textContent);
const button = (container, text) => Array.from(container.querySelectorAll("button")).find((node) => node.textContent === text);
const table = (overrides = {}) => h(DataTable, { rows: tableRows, columns: tableColumns, rowId, caption: "Team", pageSize: 2, ...overrides });

function profileForm(overrides = {}) {
  return h(ValidatedForm, {
    formLabel: "Profile",
    initialValues: { name: "" },
    fieldLabels: { name: "Name" },
    validate: (values) => values.name.trim() ? {} : { name: "Enter a name." },
    onSubmit: () => ({ ok: true }),
    ...overrides,
  }, ({ values, field, setValue, reset }) => h("div", { className: "gl-form__field" },
    h("label", { htmlFor: field("name").id }, "Name"),
    h("input", { ...field("name", "profile-name-hint"), value: values.name, onChange: (event) => setValue("name", event.target.value) }),
    h("p", { id: "profile-name-hint" }, "Use your preferred name."),
    h("button", { type: "button", onClick: reset }, "Reset"),
  ));
}

test("every web stylesheet variable resolves to a supplied semantic theme token", async () => {
  const root = new URL("../modules/", import.meta.url);
  const theme = await readFile(new URL("theme-tokens/files/theme.css", root), "utf8");
  const definitions = new Set(Array.from(theme.matchAll(/(--gl-[a-z0-9-]+)\s*:/g), (match) => match[1]));
  assert.ok(definitions.size > 15);
  for (const id of ["app-shell", "data-table", "validated-form"]) {
    const stylesheet = await readFile(new URL(`${id}/files/${id}.css`, root), "utf8");
    for (const [, name] of stylesheet.matchAll(/var\(\s*(--gl-[a-z0-9-]+)/g)) {
      assert.ok(definitions.has(name), `${id} uses an undefined theme token: ${name}`);
    }
  }
  assert.match(theme, /data-genlib-theme="dark"/);
  assert.match(theme, /data-genlib-theme="light"/);
});

test("shell SSR supplies named navigation, an active page, and a working skip destination", () => {
  const template = document.createElement("template");
  template.innerHTML = renderToStaticMarkup(h(AppShell, {
    brand: "Example",
    items: [{ id: "overview", label: "Overview", href: "#overview" }],
    activeItemId: "overview",
  }, h("h1", null, "Workspace")));
  assert.equal(template.content.querySelectorAll("main").length, 1);
  assert.equal(template.content.querySelector("nav").getAttribute("aria-label"), "Primary");
  assert.equal(template.content.querySelector('a[aria-current="page"]').textContent, "Overview");
  const skip = template.content.querySelector(".gl-shell__skip");
  assert.equal(skip.getAttribute("href"), `#${template.content.querySelector("main").id}`);
  assert.equal(template.content.querySelector("main").tabIndex, -1);
});

test("shell disclosure toggles, closes on Escape with focus return, and observes link selection", async (t) => {
  const selections = [];
  const view = await render(h(AppShell, {
    brand: "Example",
    items: [{ id: "overview", label: "Overview", href: "#overview" }],
    onNavigate: (item) => selections.push(item.id),
  }, h("h1", null, "Workspace")));
  t.after(view.cleanup);
  const toggle = button(view.container, "Menu");
  const navigation = view.container.querySelector("aside");
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(toggle.getAttribute("aria-controls"), navigation.id);
  await click(toggle);
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  assert.equal(navigation.dataset.open, "true");
  await act(async () => { navigation.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(document.activeElement, toggle);
  await click(toggle);
  await click(view.container.querySelector("nav a"));
  assert.deepEqual(selections, ["overview"]);
  assert.equal(navigation.dataset.open, "false");
});

test("table selection is immutable, stable, numeric-aware, case-insensitive, and null-last", () => {
  const rows = Object.freeze([
    Object.freeze({ id: "b", name: "Beta", tasks: 12 }),
    Object.freeze({ id: "a1", name: "Alpha", tasks: 2 }),
    Object.freeze({ id: "a2", name: "alpha", tasks: 2 }),
    Object.freeze({ id: "none", name: "Missing", tasks: null }),
  ]);
  assert.deepEqual(selectTableRows(rows, tableColumns, " ALPHA ").map(rowId), ["a1", "a2"]);
  assert.deepEqual(selectTableRows(rows, tableColumns, "12"), [], "excluded numeric column must not participate in search");
  assert.deepEqual(selectTableRows(rows, tableColumns, "", { columnId: "tasks", direction: "asc" }).map(rowId), ["a1", "a2", "b", "none"]);
  assert.deepEqual(selectTableRows(rows, tableColumns, "", { columnId: "tasks", direction: "desc" }).map(rowId), ["b", "a1", "a2", "none"]);
  assert.deepEqual(rows.map(rowId), ["b", "a1", "a2", "none"]);
  const noSort = tableColumns.map((column) => ({ ...column, sortable: false }));
  assert.deepEqual(selectTableRows(rows, noSort, "", { columnId: "tasks", direction: "asc" }).map(rowId), rows.map(rowId));
});

test("table pagination, sorting, and searching update rows and accessible status together", async (t) => {
  const view = await render(table());
  t.after(view.cleanup);
  assert.deepEqual(visibleNames(view.container), ["Zoe", "Ada"]);
  assert.equal(button(view.container, "Previous").disabled, true);
  await click(button(view.container, "Next"));
  assert.deepEqual(visibleNames(view.container), ["Miko", "Nora"]);
  await click(view.container.querySelector('button[aria-label="Sort Name ascending"]'));
  assert.deepEqual(visibleNames(view.container), ["Ada", "Miko"]);
  assert.equal(view.container.querySelector("th").getAttribute("aria-sort"), "ascending");
  assert.equal(button(view.container, "Previous").disabled, true);
  await click(view.container.querySelector('button[aria-label="Sort Name descending"]'));
  assert.deepEqual(visibleNames(view.container), ["Zoe", "Nora"]);
  assert.equal(view.container.querySelector("th").getAttribute("aria-sort"), "descending");
  const input = view.container.querySelector('input[type="search"]');
  assert.equal(view.container.querySelector("label").htmlFor, input.id);
  assert.equal(input.getAttribute("aria-controls"), view.container.querySelector("table").id);
  await type(input, "mi");
  assert.deepEqual(visibleNames(view.container), ["Miko"]);
  assert.equal(view.container.querySelector('[role="status"]').textContent, "Showing 1–1 of 1 records");
  assert.equal(button(view.container, "Next").disabled, true);
  await type(input, "not present");
  assert.deepEqual(visibleNames(view.container), ["No matching records."]);
  assert.equal(view.container.querySelector('[role="status"]').textContent, "0 records");
  assert.equal(button(view.container, "Previous").disabled, true);
});

test("table clamps pages after data changes and distinguishes an empty dataset", async (t) => {
  const view = await render(table({ pageSize: 1 }));
  t.after(view.cleanup);
  await click(button(view.container, "Next"));
  await click(button(view.container, "Next"));
  assert.deepEqual(visibleNames(view.container), ["Miko"]);
  await view.rerender(table({ rows: tableRows.slice(0, 1), pageSize: 1 }));
  assert.deepEqual(visibleNames(view.container), ["Zoe"]);
  await view.rerender(table({ pageSize: 1 }));
  assert.deepEqual(visibleNames(view.container), ["Zoe"], "the old page must not return when the dataset expands");
  await view.rerender(table({ rows: [], searchable: false }));
  assert.equal(view.container.querySelector('input[type="search"]'), null);
  assert.deepEqual(visibleNames(view.container), ["No records yet."]);
});

test("table escapes caller text and safely handles invalid page sizes", () => {
  const html = renderToStaticMarkup(table({
    rows: [{ id: "unsafe", name: "<script>untrusted()</script>", tasks: 1 }],
    pageSize: Number.NaN,
  }));
  assert.match(html, /&lt;script&gt;untrusted\(\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Page 1 of 1/);
  assert.throws(() => renderToStaticMarkup(table({ columns: [] })), /at least one column/);
});

test("invalid form data blocks persistence and links summary errors to fields and hints", async (t) => {
  let calls = 0;
  const view = await render(profileForm({ onSubmit: () => { calls += 1; } }));
  t.after(view.cleanup);
  await submit(view.container.querySelector("form"));
  assert.equal(calls, 0);
  const input = view.container.querySelector("input");
  const summary = view.container.querySelector('[role="alert"]');
  assert.ok(summary.textContent.includes("Name: Enter a name."));
  assert.equal(document.activeElement, summary);
  assert.equal(input.getAttribute("aria-invalid"), "true");
  const descriptions = input.getAttribute("aria-describedby").split(" ").map((id) => document.getElementById(id)?.textContent);
  assert.deepEqual(descriptions, ["Use your preferred name.", "Name: Enter a name."]);
  await click(summary.querySelector("a"));
  assert.equal(document.activeElement, input);
  await type(input, "Ada");
  assert.equal(input.getAttribute("aria-invalid"), null);
  assert.equal(view.container.querySelector('[role="alert"]'), null);
  await submit(view.container.querySelector("form"));
  assert.equal(calls, 1);
  assert.equal(view.container.querySelector('[role="status"]').textContent, "Saved.");
});

test("async validation and submission share one busy period and block same-tick duplicates", async (t) => {
  const validation = deferred();
  const saving = deferred();
  let validationCalls = 0;
  const submissions = [];
  const view = await render(profileForm({
    initialValues: { name: "Ada" },
    validate: () => { validationCalls += 1; return validation.promise; },
    onSubmit: (values) => { submissions.push({ ...values }); return saving.promise; },
  }));
  t.after(view.cleanup);
  const form = view.container.querySelector("form");
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  assert.equal(validationCalls, 1);
  assert.equal(submissions.length, 0);
  assert.equal(form.getAttribute("aria-busy"), "true");
  assert.equal(view.container.querySelector("fieldset").disabled, true);
  await type(view.container.querySelector("input"), "Changed during validation");
  await act(async () => { validation.resolve({}); await validation.promise; });
  assert.deepEqual(submissions, [{ name: "Ada" }]);
  assert.equal(form.getAttribute("aria-busy"), "true");
  await submit(form);
  assert.equal(submissions.length, 1);
  await act(async () => { saving.resolve({ ok: true }); await saving.promise; });
  assert.equal(form.getAttribute("aria-busy"), "false");
  assert.equal(view.container.querySelector("fieldset").disabled, false);
  assert.equal(view.container.querySelector('[role="status"]').textContent, "Saved.");
});

test("explicit server field and form errors remain editable and can be corrected", async (t) => {
  let calls = 0;
  const view = await render(profileForm({
    initialValues: { name: "Existing" },
    onSubmit: () => ++calls === 1
      ? { ok: false, fieldErrors: { name: "That name is already used." }, formError: "Choose another name." }
      : { ok: true },
  }));
  t.after(view.cleanup);
  await submit(view.container.querySelector("form"));
  assert.match(view.container.querySelector('[role="alert"]').textContent, /already used/);
  assert.match(view.container.querySelector('[role="alert"]').textContent, /Choose another name/);
  assert.equal(view.container.querySelector('[role="status"]').textContent, "");
  await type(view.container.querySelector("input"), "New name");
  assert.equal(view.container.querySelector('[role="alert"]'), null);
  await submit(view.container.querySelector("form"));
  assert.equal(calls, 2);
  assert.equal(view.container.querySelector('[role="status"]').textContent, "Saved.");
});

test("unexpected submission exceptions use a safe message and allow retry", async (t) => {
  let calls = 0;
  const view = await render(profileForm({
    initialValues: { name: "Ada" },
    submissionErrorMessage: "Please retry the request.",
    onSubmit: async () => {
      calls += 1;
      if (calls === 1) throw new Error("Secret connection details should not be rendered");
      return { ok: true };
    },
  }));
  t.after(view.cleanup);
  await submit(view.container.querySelector("form"));
  assert.match(view.container.querySelector('[role="alert"]').textContent, /Please retry the request/);
  assert.doesNotMatch(view.container.textContent, /Secret connection details/);
  assert.equal(view.container.querySelector("fieldset").disabled, false);
  await submit(view.container.querySelector("form"));
  assert.equal(view.container.querySelector('[role="alert"]'), null);
  assert.equal(view.container.querySelector('[role="status"]').textContent, "Saved.");
});

test("invalid validation mappings fail closed before submission", async (t) => {
  let calls = 0;
  const view = await render(profileForm({
    validate: () => ({ unknownField: "A validator returned a field that does not exist." }),
    onSubmit: () => { calls += 1; },
  }));
  t.after(view.cleanup);
  await submit(view.container.querySelector("form"));
  assert.equal(calls, 0);
  assert.match(view.container.querySelector('[role="alert"]').textContent, /Something went wrong/);
});

test("reset restores original values without adopting changed initialValues props", async (t) => {
  const view = await render(profileForm({ initialValues: { name: "Original" } }));
  t.after(view.cleanup);
  await type(view.container.querySelector("input"), "Edited");
  await view.rerender(profileForm({ initialValues: { name: "Another record" } }));
  assert.equal(view.container.querySelector("input").value, "Edited");
  await click(button(view.container, "Reset"));
  assert.equal(view.container.querySelector("input").value, "Original");
});

test("unmounting during validation does not start a later persistence request", async () => {
  const validation = deferred();
  let calls = 0;
  const view = await render(profileForm({
    validate: () => validation.promise,
    onSubmit: () => { calls += 1; },
  }));
  await submit(view.container.querySelector("form"));
  await view.cleanup();
  await act(async () => { validation.resolve({}); await validation.promise; });
  assert.equal(calls, 0);
});
