// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Code, ConnectError} from '@connectrpc/connect';

export const fixture = JSON.parse(readFileSync(new URL('./conformance.json', import.meta.url), 'utf8'));
const errorCodes = {invalid_argument: Code.InvalidArgument, not_found: Code.NotFound, unauthenticated: Code.Unauthenticated};

// The Go runner consumes this same JSON and uses its generated client. IDs are
// deliberately opaque: compare them within a service instance, not across stores.
export async function runConformance(clientForToken) {
  assert.equal(fixture.version, 1);
  const client = clientForToken(fixture.token);
  const initial = await client.listItems({});
  assert.equal(initial.items.length, 0, 'conformance needs an empty fixture repository');
  assert.equal(initial.nextCursor, 0);
  const items = [];
  const ids = new Set();
  for (const example of fixture.create) {
    const {item} = await client.createItem({title: example.title});
    assert.ok(item?.id);
    assert.equal(ids.has(item.id), false, 'unique generated ID');
    ids.add(item.id);
    assert.equal(item.title, example.expectedTitle);
    assert.equal(item.completed, false);
    assert.deepEqual((await client.getItem({id: item.id})).item, item);
    items.push(item);
  }
  for (const example of fixture.pages) {
    const result = await client.listItems({cursor: example.cursor, pageSize: example.pageSize});
    assert.deepEqual(result.items, example.indices.map(index => items[index]));
    assert.equal(result.nextCursor, example.nextCursor);
  }
  for (const example of fixture.errors) {
    assert.ok(Object.hasOwn(errorCodes, example.code), `known error code: ${example.code}`);
    const errorClient = clientForToken(example.token ?? fixture.token);
    await assert.rejects(
      () => errorClient[example.method](example.request),
      error => error instanceof ConnectError && error.code === errorCodes[example.code],
      example.name,
    );
  }
  const final = await client.listItems({pageSize: 100});
  assert.deepEqual(final.items, items, 'rejected requests must not mutate storage');
  return {created: items.length, pages: fixture.pages.length, errors: fixture.errors.length};
}
