// SPDX-License-Identifier: Apache-2.0
module.exports = {
  forbidden: [
    { name: 'no-cycles', severity: 'error', from: {}, to: { circular: true } },
    { name: 'client-cannot-import-server', severity: 'error', from: { path: '(^|/)client/' }, to: { path: '(^|/)server/' } },
    { name: 'public-entrypoints-only', severity: 'error', from: { pathNot: '(^|/)features/([^/]+)/internal/' }, to: { path: '(^|/)features/[^/]+/internal/' } },
  ],
  options: { doNotFollow: { path: 'node_modules' }, exclude: { path: 'node_modules' } },
};
