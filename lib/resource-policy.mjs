// Source evidence, service lifecycle and executable adoption are independent facts.
// This module never calls providers or turns a license label into permission.
export const LIFECYCLES = ['active', 'deprecated', 'retired', 'unknown'];
export const READINESS = ['cataloged', 'source-reviewed', 'recipe-available', 'integration-verified'];
export const LICENSE_POLICIES = ['any', 'permissive'];

const ALIASES = new Map([
  ['MIT LICENSE', 'MIT'], ['THE MIT LICENSE', 'MIT'],
  ['APACHE LICENSE 2.0', 'APACHE-2.0'], ['APACHE SOFTWARE LICENSE', 'APACHE-2.0'],
  ['APACHE 2.0', 'APACHE-2.0'], ['APACHE LICENSE, VERSION 2.0', 'APACHE-2.0'],
  ['BSD 3-CLAUSE LICENSE', 'BSD-3-CLAUSE'], ['BSD 2-CLAUSE LICENSE', 'BSD-2-CLAUSE'],
  ['MOZILLA PUBLIC LICENSE 2.0 (MPL 2.0)', 'MPL-2.0'],
  ['GNU AFFERO GENERAL PUBLIC LICENSE V3', 'AGPL-3.0'],
  ['GNU AFFERO GENERAL PUBLIC LICENSE V3 OR LATER (AGPLV3+)', 'AGPL-3.0-OR-LATER'],
]);

export function normalizedLicense(value) {
  if (typeof value !== 'string' || !value.trim() || ['NOASSERTION', 'UNKNOWN'].includes(value.trim().toUpperCase())) return null;
  const trimmed = value.trim().replace(/\s+/g, ' ').toUpperCase();
  return ALIASES.get(trimmed) ?? trimmed;
}

export function licenseMatches(recorded, declared) {
  const a = normalizedLicense(recorded), b = normalizedLicense(declared);
  if (!a || !b) return null;
  // Do not accept MIT+Commons-Clause, GPL/LGPL, or different versions merely
  // because a family token occurs in both strings. Unrecognized expressions need review.
  return a === b;
}

const PERMISSIVE = new Set(['MIT', 'APACHE-2.0', 'BSD-2-CLAUSE', 'BSD-3-CLAUSE', 'ISC', '0BSD', 'UNLICENSE', 'ZLIB', 'CC0-1.0']);
export function isPermissive(license) {
  const value = normalizedLicense(typeof license === 'object' && license ? license.id : license);
  if (!value) return false;
  return PERMISSIVE.has(value);
}

export function lifecycleOf(item) {
  return item.lifecycle ?? { status: 'unknown' };
}

export function readinessOf(item) {
  if (item.readiness) return item.readiness;
  if (item.genlib?.module || item.genlib?.integrations?.length) return { level: 'recipe-available' };
  return { level: item.verification === 'verified' ? 'source-reviewed' : 'cataloged' };
}

export function eligibleResource(item, { includeRetired = false, licensePolicy = 'any' } = {}) {
  if (!includeRetired && lifecycleOf(item).status === 'retired') return false;
  if (licensePolicy === 'permissive' && (item.integrationMode === 'license-review' || !isPermissive(item.license))) return false;
  return true;
}
