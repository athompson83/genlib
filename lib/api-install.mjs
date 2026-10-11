// Install steps for an API index record, derived from its structured fields so the commands match the
// spec version: openapi-typescript 7 and openapi-python-client read OpenAPI 3.x only, so a Swagger 2.0
// spec is converted with swagger2openapi first. Each step names the receiving language it serves.
export const API_TOOLS = Object.freeze({
  convert: 'swagger2openapi@7.0.8',
  fetch: 'openapi-fetch@0.17.0',
  typescript: 'openapi-typescript@7.13.0',
  python: 'openapi-python-client@0.29.1',
});

// Some directory paths contain spaces or parentheses ("version unknown", "v4 (Hunt Valley)"); encode them so
// each command stays one valid shell word.
export const shellUrl = url => encodeURI(url).replace(/[()'!*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

export function apiSteps(api) {
  const swagger2 = /^2(\.|$)/.test(String(api.openapiVersion ?? ''));
  const local = `openapi/${api.id}.json`;
  const convert = swagger2 ? `mkdir -p openapi && npx ${API_TOOLS.convert} ${shellUrl(api.spec)} -o ${local} && ` : '';
  const spec = swagger2 ? local : shellUrl(api.spec);
  const from = swagger2 ? 'Swagger 2.0 spec, converted to OpenAPI 3.0 first' : 'OpenAPI spec';
  return [
    ...(api.sdk ? [{ language: 'typescript', kind: 'sdk', command: `npm install ${api.sdk.npm}@${api.sdk.version}   # official SDK` }] : []),
    { language: 'typescript', kind: 'generated', command: `npm install ${API_TOOLS.fetch} && ${convert}npx ${API_TOOLS.typescript} ${spec} -o src/api/${api.id}.ts   # typed client from the ${from}` },
    { language: 'python', kind: 'generated', command: `${convert}uvx ${API_TOOLS.python} generate ${swagger2 ? '--path' : '--url'} ${spec}   # Python client from the ${from}` },
  ];
}

const LANGUAGE = { javascript: 'typescript', typescript: 'typescript', python: 'python' };

// The steps for a receiving project's languages. A project in a language without a recorded client gets
// one honest line pointing at the spec instead of npm or pip commands it cannot use.
export function apiInstallFor(api, languages) {
  const steps = apiSteps(api);
  if (!languages?.length) return steps.map(step => step.command);
  const wanted = new Set(languages.map(language => LANGUAGE[language]).filter(Boolean));
  const chosen = steps.filter(step => wanted.has(step.language)).map(step => step.command);
  if (chosen.length) return chosen;
  const language = languages[0];
  return [`# no ${language} client recorded for ${api.id}: check ${api.docs ?? 'the provider docs'} for an official ${language} SDK, or generate one from ${shellUrl(api.spec)}${/^2(\.|$)/.test(String(api.openapiVersion ?? '')) ? ` (Swagger 2.0: convert with npx ${API_TOOLS.convert} first)` : ''}`];
}
