// SPDX-License-Identifier: Apache-2.0
// Create -> patch -> re-read round trip on a DOCX generated in memory (no fixtures, no network).
import assert from "node:assert/strict";
import { test } from "node:test";
import { createReport, extractText, replacePlaceholders } from "./docx-documents.ts";

test("create, replace placeholder, extract text", async () => {
  const created = await createReport({
    title: "Quarterly report",
    body: "Prepared for {{customer}}.",
    rows: [
      ["Item", "Qty"],
      ["Widgets", "3"],
    ],
  });
  assert.equal(created.subarray(0, 2).toString("latin1"), "PK"); // DOCX is a ZIP package

  const before = await extractText(created);
  assert.match(before, /Quarterly report/);
  assert.match(before, /\{\{customer\}\}/);

  const patched = await replacePlaceholders(created, { customer: "Ada <Lovelace> & Co" });
  const after = await extractText(patched);
  assert.match(after, /Prepared for Ada <Lovelace> & Co\./);
  assert.doesNotMatch(after, /\{\{customer\}\}/);
  assert.match(after, /Widgets/);
  assert.match(after, /Qty/);
});
