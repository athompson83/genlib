import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const quick = words => JSON.parse(spawnSync(process.execPath, [root + 'bin/genlib.mjs', 'quick', ...words.split(' '), '--json'], { encoding: 'utf8' }).stdout);
const items = JSON.parse(readFileSync(root + 'resources/catalog/mapping-navigation.json', 'utf8')).items;
const byId = new Map(items.map(item => [item.id, item]));

test('the owner-named mapping tools are catalogued and are the top quick match', () => {
  for (const [query, id] of [['leaflet', 'leaflet'], ['openlayers', 'openlayers'], ['organic maps', 'organic-maps'], ['osmand', 'osmand'],
    ['comaps', 'comaps'], ['openfreemap', 'openfreemap'], ['opentripplanner', 'opentripplanner'], ['geoserver', 'geoserver'], ['gods eye view', 'gods-eye-view']]) {
    assert.equal(quick(query).best, `resource:${id}`, query);
  }
  assert.ok(byId.has('maplibre-native') && byId.has('martin'));
});

test("God's Eye View records keep license and provider terms visible", () => {
  const app = byId.get('gods-eye-view');
  assert.equal(app.integrationMode, 'license-review');
  assert.ok(app.cautions.some(text => /non-commercial/i.test(text)));
  const gev = items.filter(item => item.tags.includes('gods-eye-view'));
  assert.ok(gev.length >= 70, `only ${gev.length} God's Eye View records`);
  for (const service of gev.filter(item => item.kind === 'service')) {
    assert.ok(service.homepage || service.docs, service.id);
    assert.equal(service.repository === null || service.repository.startsWith('https://'), true, service.id);
  }
  assert.equal(byId.get('opensky-network-api').integrationMode, 'license-review');
});

test('map math requests reach the tested capabilities before external libraries', () => {
  assert.equal(quick('slippy map tile coordinates').best, 'capability:tile-math');
  assert.equal(quick('point in polygon geofence').best, 'capability:geometry');
  assert.equal(quick('decode polyline').best, 'capability:polyline');
});
