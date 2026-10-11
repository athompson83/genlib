// The original storefront and utility recipes sit outside the module compiler (modules/) and the recipe
// compiler (examples/recipes/). They are compiled here under the same strict flags and exercised.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dirs = ['examples/storefront', 'examples/utilities'];
const files = dirs.flatMap(dir => readdirSync(join(root, dir)).filter(name => name.endsWith('.ts')).map(name => join(root, dir, name)));
const out = mkdtempSync(join(tmpdir(), 'genlib-source-examples-'));
after(() => rmSync(out, { recursive: true, force: true }));
const compilerOptions = {
  strict: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true, noImplicitReturns: true,
  noFallthroughCasesInSwitch: true, noUnusedLocals: true, noUnusedParameters: true, skipLibCheck: true,
  target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', lib: ['ES2022', 'DOM', 'DOM.Iterable'],
  rootDir: join(root, 'examples'), outDir: out,
};
writeFileSync(join(out, 'tsconfig.json'), JSON.stringify({ compilerOptions, files }));
execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', join(out, 'tsconfig.json')], { stdio: 'pipe' });
writeFileSync(join(out, 'package.json'), '{"type":"module"}');
const load = path => import(pathToFileURL(join(out, path)).href);

test('storefront and utility sources compile strictly and behave', async () => {
  assert.equal(files.length, 6);
  const { updateCart, cartSubtotal } = await load('storefront/cart.js');
  const cart = updateCart(updateCart([], 'p1', 'v1', 2), 'p2', 'v1', 1);
  assert.deepEqual(updateCart(cart, 'p1', 'v1', 0), [{ productId: 'p2', variantId: 'v1', quantity: 1 }]);
  assert.deepEqual(cartSubtotal([]), { minor: 0, currency: '' });
  assert.deepEqual(cartSubtotal([{ productId: 'p', variantId: 'v', quantity: 2, unitMinor: 250, currency: 'USD' }]), { minor: 500, currency: 'USD' });
  assert.throws(() => cartSubtotal([{ productId: 'p', variantId: 'v', quantity: 1, unitMinor: 1, currency: 'USD' }, { productId: 'q', variantId: 'v', quantity: 1, unitMinor: 1, currency: 'EUR' }]), /Currency mismatch/);
  const { invoiceTotals } = await load('storefront/invoice.js');
  assert.deepEqual(invoiceTotals([{ description: 'A', quantity: 3, unitMinor: 1000 }], 825), { subtotalMinor: 3000, taxMinor: 248, totalMinor: 3248 });
  // 900719925474503 x 825 / 10000 = 74309393851646.4975: exact rounding, where floating point gave ...647.
  assert.equal(invoiceTotals([{ description: 'Big', quantity: 1, unitMinor: 900719925474503 }], 825).taxMinor, 74309393851646);
  const { filterCatalog } = await load('storefront/catalog.js');
  const products = [
    { id: 'a', title: 'Blue mug', category: 'mugs', active: true, priceMinor: 900, currency: 'USD' },
    { id: 'b', title: 'Red mug', category: 'mugs', active: true, priceMinor: 700, currency: 'USD' },
    { id: 'c', title: 'Hidden', category: 'mugs', active: false, priceMinor: 100, currency: 'USD' },
  ];
  assert.deepEqual(filterCatalog(products, { category: 'mugs', sort: 'price-asc' }).map(product => product.id), ['b', 'a']);
  const { validateUpload } = await load('utilities/files.js');
  const policy = { maxBytes: 1000, extensions: ['.png'], mimeTypes: ['image/png'] };
  assert.equal(validateUpload({ name: 'a.png', size: 10, type: 'image/png' }, policy).ok, true);
  assert.equal(validateUpload({ name: 'a.exe', size: 10, type: 'image/png' }, policy).ok, false);
  const { exportCsv } = await load('utilities/export.js');
  assert.match(exportCsv([{ name: '=cmd' }], [{ header: 'Name', value: row => row.name }]), /'=cmd/);
  const { formatMoney } = await load('utilities/formatting.js');
  assert.equal(formatMoney(12345, 'USD'), '$123.45');
});
