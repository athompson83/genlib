import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { invariant, readRegular } from './safety.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SHARED = '.agents/skills';
const checked = '2026-10-11';
// These are host configuration contracts, not claims of live acceptance in each app.
const PROFILES = {
  claude: {
    title: 'Claude Code', skill: { project: '.claude/skills', user: '.claude/skills' },
    format: 'json', locations: { project: '.mcp.json', user: '~/.claude.json' },
    sources: ['https://code.claude.com/docs/en/skills', 'https://code.claude.com/docs/en/mcp'],
  },
  codex: {
    title: 'Codex', skill: { project: SHARED, user: SHARED },
    format: 'toml', locations: { project: '.codex/config.toml', user: '~/.codex/config.toml' },
    sources: ['https://developers.openai.com/codex/skills', 'https://developers.openai.com/codex/mcp'],
  },
  openclaw: {
    title: 'OpenClaw', skill: { project: SHARED, user: '.openclaw/skills' },
    format: 'json', locations: { project: null, user: '~/.openclaw/openclaw.json' },
    sources: ['https://docs.openclaw.ai/tools/skills', 'https://docs.openclaw.ai/cli/mcp/transports'],
    notes: ['Uses the native mcp.servers registry. MCP tool profiles or runtime adapters may restrict exposure. Custom state directories change personal locations.'],
  },
  hermes: {
    title: 'Hermes Agent (Nous Research)', skill: { project: SHARED, user: '.hermes/skills' },
    format: 'yaml', locations: { project: null, user: '~/.hermes/config.yaml' },
    sources: ['https://hermes-agent.nousresearch.com/docs/user-guide/features/skills', 'https://hermes-agent.nousresearch.com/docs/reference/mcp-config-reference'],
    notes: ['Project skills require hermes skills trust. HERMES_HOME or an active profile can change personal locations. Reload MCP after merging configuration.'],
  },
  antigravity: {
    title: 'Google Antigravity', skill: { project: SHARED, user: '.gemini/config/skills' },
    format: 'json', locations: { project: '.agents/mcp_config.json', user: '~/.gemini/config/mcp_config.json' },
    sources: ['https://www.antigravity.google/docs/skills/', 'https://www.antigravity.google/docs/mcp'],
    notes: ['Personal skill path is for the current IDE. Antigravity CLI uses ~/.gemini/antigravity-cli/skills. Project .agents/skills is shared.'],
  },
  vscode: {
    title: 'VS Code / GitHub Copilot', skill: { project: SHARED, user: SHARED },
    format: 'json', locations: { project: '.vscode/mcp.json', user: null },
    sources: ['https://code.visualstudio.com/docs/agent-customization/agent-skills', 'https://code.visualstudio.com/docs/agents/reference/mcp-configuration'],
    notes: ['For user scope, run MCP: Open User Configuration in VS Code. Its native file uses servers; the separate portable Copilot format uses mcpServers.'],
  },
  cursor: {
    title: 'Cursor', skill: { project: SHARED, user: '.cursor/skills' },
    format: 'json', locations: { project: '.cursor/mcp.json', user: '~/.cursor/mcp.json' },
    sources: ['https://cursor.com/docs/skills', 'https://cursor.com/docs/mcp'],
    notes: ['A local absolute MCP command must also exist in the remote worker to work there. Personal Cloud Agent skill sync has its own settings.'],
  },
  opencode: {
    title: 'OpenCode', skill: { project: SHARED, user: '.config/opencode/skills' },
    format: 'json', locations: { project: 'opencode.json', user: '~/.config/opencode/opencode.json' },
    sources: ['https://docs.opencode.ai/docs/skills/', 'https://docs.opencode.ai/docs/mcp-servers/'],
    notes: ['Merge into an existing opencode.json or opencode.jsonc; local command includes the executable and all arguments in one array.'],
  },
  cline: {
    title: 'Cline', skill: { project: '.cline/skills', user: '.cline/skills' },
    format: 'json', locations: { project: null, user: '~/.cline/data/settings/cline_mcp_settings.json' },
    sources: ['https://docs.cline.bot/customization/skills', 'https://docs.cline.bot/mcp/mcp-overview'],
    notes: ['The suggested personal MCP path is for Cline CLI. In the IDE, use Configure MCP Servers to open the active extension settings file. CLINE_MCP_SETTINGS_PATH may override CLI settings.'],
  },
  roo: {
    title: 'Roo Code', skill: { project: SHARED, user: SHARED },
    format: 'json', locations: { project: '.roo/mcp.json', user: null },
    sources: ['https://roocodeinc.github.io/Roo-Code/features/skills/', 'https://roocodeinc.github.io/Roo-Code/features/mcp/using-mcp-in-roo/'],
    notes: ['For personal MCP configuration use Edit Global MCP. Remote transport must explicitly be streamable-http.'],
  },
  generic: {
    title: 'Other MCP / Agent Skills hosts', skill: { project: SHARED, user: SHARED },
    format: 'json', locations: { project: null, user: null },
    sources: ['https://agentskills.io/specification', 'https://modelcontextprotocol.io/docs/learn/architecture'],
    notes: ['Connection values are transport settings, not a universal settings-file schema. Use the receiving host\'s documented MCP setup and Agent Skills discovery path, or the CLI fallback.'],
  },
  ollama: {
    title: 'Ollama through OpenCode', kind: 'model-runtime', via: 'opencode',
    sources: ['https://docs.ollama.com/integrations/opencode', 'https://docs.ollama.com/capabilities/tool-calling'],
    notes: ['Ollama runs the model. OpenCode loads the skill and executes MCP tools. OpenClaw and Hermes are other supported host choices; configure those profiles when using them.'],
  },
};
const ALIASES = { 'claude-code': 'claude', 'vs-code': 'vscode', copilot: 'vscode', 'github-copilot': 'vscode', 'google-antigravity': 'antigravity', 'hermes-agent': 'hermes', 'roo-code': 'roo', portable: 'generic' };

function profileFor(id) {
  const canonical = Object.hasOwn(ALIASES, id) ? ALIASES[id] : id;
  invariant(typeof canonical === 'string' && Object.hasOwn(PROFILES, canonical), 'INVALID_OPTION', 'Unknown harness. Use: ' + Object.keys(PROFILES).join(', '));
  return { id: canonical, ...PROFILES[canonical] };
}

export function listHarnesses() {
  return Object.keys(PROFILES).map(id => structuredClone({
    kind: 'harness', ...profileFor(id),
    validation: { documentationChecked: checked, harnessAcceptance: 'not-run' },
  }));
}

export function skillTargets(target, harness = 'both', scope = 'project') {
  invariant(['project', 'user'].includes(scope), 'INVALID_OPTION', 'Skill scope must be project or user. For user scope, --target is the existing home directory.');
  const selected = harness === 'both' ? ['codex', 'claude']
    : harness === 'all' ? Object.keys(PROFILES).filter(id => !PROFILES[id].via) : [harness];
  const unique = new Map();
  for (const selectedId of selected) {
    const requested = profileFor(selectedId);
    const profile = requested.via ? profileFor(requested.via) : requested;
    const directory = path.join(target, ...profile.skill[scope].split('/'), 'genlib-use');
    if (unique.has(directory)) unique.get(directory).harnesses.push(requested.id);
    else unique.set(directory, { harness: profile.id, directory, harnesses: [requested.id] });
  }
  return [...unique.values()];
}

function configText(value, label) {
  invariant(typeof value === 'string' && !/[\u0000-\u001f\u007f-\u009f]/.test(value), 'UNSAFE_PATH', label + ' must not contain control characters.');
  invariant(!value.includes('${') && !/\{(?:env|file):/.test(value), 'UNSAFE_PATH', label + ' contains a host interpolation expression.');
}

function existingDirectory(value, label) {
  configText(value, label);
  invariant(path.isAbsolute(value), 'UNSAFE_PATH', label + ' must be an absolute existing directory.');
  invariant(!value.split(/[\\/]/).some(part => part === '.' || part === '..'), 'UNSAFE_PATH', label + ' must not contain traversal segments.');
  // Native hosts interpolate environment expressions in config strings. Do not emit paths
  // whose meaning could change when the host reads them.
  let current = path.parse(value).root;
  for (const segment of ['', ...value.slice(current.length).split(path.sep).filter(Boolean)]) {
    if (segment) current = path.join(current, segment);
    let stat;
    try { stat = fs.lstatSync(current); } catch { invariant(false, 'TARGET_MISSING', label + ' does not exist.'); }
    invariant(stat.isDirectory() && !stat.isSymbolicLink(), 'UNSAFE_PATH', label + ' must not contain symlinks or non-directory ancestors.');
  }
  return path.normalize(value);
}

function endpoint(value) {
  configText(value, 'MCP URL');
  let url;
  try { url = new URL(value); } catch { /* required below */ }
  invariant(url && ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash,
    'INVALID_OPTION', 'MCP URL must be an HTTP(S) endpoint without credentials, query strings, or fragments.');
  invariant(url.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname),
    'INVALID_OPTION', 'Remote MCP endpoints require HTTPS; HTTP is allowed only on loopback.');
  return url.href;
}

function hostConfig(id, connection, transport) {
  const local = transport === 'stdio';
  const { command, args, url } = connection;
  if (id === 'generic') return local ? { command, args } : { url, transport: 'streamable-http' };
  if (id === 'opencode') return {
    $schema: 'https://opencode.ai/config.json',
    mcp: { genlib: local ? { type: 'local', command: [command, ...args], enabled: true } : { type: 'remote', url, enabled: true } },
  };
  if (id === 'openclaw') return { mcp: { servers: { genlib: local ? { command, args } : { url, transport: 'streamable-http' } } } };
  if (['codex', 'hermes'].includes(id)) return { mcp_servers: { genlib: connection } };
  if (id === 'vscode') return { servers: { genlib: local ? { type: 'stdio', command, args } : { type: 'http', url } } };
  const entry = local ? { ...(id === 'cursor' ? { type: 'stdio' } : {}), command, args }
    : id === 'antigravity' ? { serverUrl: url }
    : id === 'roo' ? { type: 'streamable-http', url }
    : id === 'claude' ? { type: 'http', url } : { url };
  return { mcpServers: { genlib: entry } };
}

function nativeContent(config, format) {
  if (format === 'toml') return '[mcp_servers.genlib]\n' + Object.entries(config.mcp_servers.genlib).map(([key, value]) => `${key} = ${JSON.stringify(value)}`).join('\n') + '\n';
  if (format === 'yaml') return 'mcp_servers:\n  genlib:\n' + Object.entries(config.mcp_servers.genlib).map(([key, value]) => `    ${key}: ${JSON.stringify(value)}`).join('\n') + '\n';
  return JSON.stringify(config, null, 2) + '\n';
}

export async function harnessConfiguration({ harness, root = ROOT, target, mode = 'sdk', transport = 'stdio', url, allowInstall = false } = {}) {
  const requested = profileFor(harness);
  const profile = requested.via ? profileFor(requested.via) : requested;
  invariant(['sdk', 'discovery'].includes(mode), 'INVALID_OPTION', 'Mode must be sdk or discovery.');
  invariant(['stdio', 'http'].includes(transport), 'INVALID_OPTION', 'Transport must be stdio or http.');
  invariant(typeof allowInstall === 'boolean', 'INVALID_OPTION', 'allowInstall must be boolean.');
  invariant(!(transport === 'http' && mode === 'discovery'), 'INVALID_OPTION', 'HTTP requires the SDK server; discovery is stdio only.');
  invariant(!(transport === 'http' && allowInstall), 'INVALID_OPTION', 'A client cannot authorize remote writes; configure write access at server startup for stdio or at the remote host.');
  invariant(!(mode === 'discovery' && allowInstall), 'INVALID_OPTION', 'The discovery server cannot install code; use the SDK mode.');
  invariant(!(transport === 'stdio' && url !== undefined), 'INVALID_OPTION', '--url requires --transport http.');
  invariant(!allowInstall || target, 'INVALID_OPTION', 'Install access requires an explicit --target project root.');
  root = existingDirectory(root, 'Genlib checkout');
  if (target !== undefined) target = existingDirectory(target, 'Target');
  let connection;
  const setup = [];
  if (transport === 'stdio') {
    const relativeEntry = mode === 'sdk' ? 'packages/genlib-mcp/server.mjs' : 'bin/genlib-mcp.mjs';
    await readRegular(root, relativeEntry, 512 * 1024);
    const entry = path.join(root, relativeEntry);
    configText(process.execPath, 'Node executable');
    const args = [entry, ...(mode === 'sdk' && target ? ['--project-root', target] : []), ...(allowInstall ? ['--allow-install'] : [])];
    connection = { command: process.execPath, args };
    if (mode === 'sdk') setup.push({ command: 'npm', args: ['ci', '--ignore-scripts', '--prefix', path.join(root, 'packages/genlib-mcp')] });
  } else connection = { url: endpoint(url) };
  const config = hostConfig(profile.id, connection, transport);
  return {
    schemaVersion: 1, requestedHarness: requested.id, harness: profile.id,
    ...(requested.via ? { runtime: 'ollama', launch: { command: 'ollama', args: ['launch', 'opencode'] } } : {}),
    mode, transport, format: profile.format,
    locations: { project: profile.locations.project && (target ? path.join(target, profile.locations.project) : profile.locations.project), user: profile.locations.user },
    config, content: nativeContent(config, profile.format), setup,
    access: { installEnabled: transport === 'http' ? 'server-controlled' : allowInstall, projectOperations: transport === 'http' ? 'server-controlled' : mode === 'discovery' ? 'unscoped-read-only' : Boolean(target) },
    instructions: 'Merge only the Genlib entry into the receiving host configuration. This command writes no settings, installs no dependencies, starts no server, and changes no permissions.',
    notes: [...(profile.notes ?? []), ...(requested.via ? requested.notes : []), ...(mode === 'discovery' ? ['Discovery allows local manifest reads through tool-supplied absolute paths. The configuration target does not enforce a scope; it only sets the suggested config location. Use SDK mode for a configured project boundary.'] : []), ...(transport === 'http' ? ['Configure any required authentication using the host\'s supported secret mechanism. No credentials or OAuth flow are generated here.'] : [])],
    sources: [...profile.sources, ...(requested.via ? requested.sources : [])],
    validation: { documentationChecked: checked, harnessAcceptance: 'not-run', next: 'Run genlib harness doctor in the server checkout, then confirm tool discovery in the receiving harness.' },
  };
}
