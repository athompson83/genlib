// Signature-only outlines of Genlib code: what an agent needs to call a module, recipe, language
// example or capability without reading its source. Each declaration becomes one line (its signature
// plus the first line of its doc comment), and every outline reports the source and outline sizes so
// the saving is measured rather than claimed.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog, loadModule } from './catalog.mjs';
import { LANGUAGES, commandsFor, loadCapabilities } from './capabilities.mjs';
import { invariant, object, parseJson, readRegular, rootDirectory } from './safety.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

const EXTENSIONS = { '.ts': 'typescript', '.tsx': 'typescript', '.mjs': 'typescript', '.js': 'typescript', '.py': 'python', '.go': 'go', '.rs': 'rust', '.java': 'java', '.kt': 'kotlin', '.cs': 'csharp', '.dart': 'dart', '.swift': 'swift' };

// Public top-level (or public member) declarations per language. Private names never appear.
const DECLARATIONS = {
  typescript: /^export\s+(?:default\s+)?(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|class|abstract\s+class|interface|type|enum)\s+[\w$]+/gm,
  python: /^(?:async\s+)?(?:def|class)\s+[A-Za-z]\w*/gm,
  go: /^(?:func\s+(?:\([^)]*\)\s*)?[A-Z]\w*|type\s+[A-Z]\w*|(?:var|const)\s+[A-Z]\w*)/gm,
  rust: /^[ \t]*pub\s+(?:async\s+)?(?:fn|struct|enum|trait|type|const)\s+\w+/gm,
  java: /^[ \t]*public\s+(?:[\w<>\[\],.? ]+?\s+)?(?:class|record|interface|enum)\s+\w+|^[ \t]*public\s+(?:static\s+)?(?:final\s+)?(?:<[^>]+>\s+)?[\w<>\[\],.?]+(?:<[^(]*>)?\s+\w+\s*\(/gm,
  kotlin: /^(?:[ \t]{0,4})(?:public\s+)?(?:inline\s+|suspend\s+|operator\s+)*(?:data\s+|sealed\s+|enum\s+|value\s+|abstract\s+|open\s+)?(?:fun|class|object|interface)\s+[\w<>.`]+/gm,
  csharp: /^[ \t]*public\s+(?:[\w<>\[\],.? ]+?\s+)?(?:class|record|struct|interface|enum)\s+\w+|^[ \t]*public\s+(?:static\s+)?(?:async\s+)?(?:override\s+)?[\w<>\[\],.?]+(?:<[^(]*>)?\s+\w+\s*\(/gm,
  dart: /^(?: {2})?(?:static\s+)?(?:(?:abstract|sealed|final|base)\s+)?(?:class|enum|mixin|extension)\s+[A-Za-z]\w*|^(?: {2})?(?:static\s+)?(?:final\s+)?[A-Za-z][\w<>?, ]*?\s+[a-zA-Z]\w*\s*\(/gm,
  swift: /^[ \t]*(?:public|open)\s+(?:static\s+|final\s+|override\s+|mutating\s+)*(?:func|struct|class|enum|protocol|init|var|let|typealias|actor)\b/gm,
};
// Keywords that look like declarations to the loose Dart and Kotlin patterns.
const NOT_DECLARATIONS = /^\s*(?:return|if|for|while|switch|catch|throw|else|new|await|assert|print|import|export\s+['"])\b/;
// Declarations whose body is the useful part (field lists), kept when short.
const BODY = { typescript: /^export\s+(?:declare\s+)?(?:interface|type|enum)\b/, go: /^type\s+\w+\s+(?:struct|interface)\b/, rust: /^\s*pub\s+(?:struct|enum)\b/ };
const MAX_SIGNATURE = 400;

function signatureAt(source, start, language) {
  const keepBody = BODY[language]?.test(source.slice(start, start + 120));
  const alias = language === 'typescript' && /^export\s+(?:declare\s+)?type\s/.test(source.slice(start, start + 40));
  let depth = 0, index = start;
  for (; index < source.length && index - start < 2000; index++) {
    const char = source[index];
    if (char === '(' || char === '[' || (alias && char === '{')) depth++;
    else if (char === ')' || char === ']' || (alias && char === '}')) depth--;
    else if (alias) { if (depth === 0 && (char === ';' || (char === '\n' && source[index + 1] === '\n'))) break; continue; }
    else if (depth === 0) {
      if (char === '{') {
        if (!keepBody) break;
        // Keep a short body (fields), otherwise stop at the brace.
        let braces = 0, end = index;
        for (; end < source.length && end - index < 1200; end++) {
          if (source[end] === '{') braces++;
          else if (source[end] === '}' && --braces === 0) break;
        }
        index = end - index < 1200 ? end + 1 : index;
        break;
      }
      if (char === ';' || (char === '\n' && language === 'python' && source[index - 1] === ':')) break;
      // `export const x = (...) => ...` keeps its parameters; other initializers stop at `=`.
      if (char === '=' && source[index + 1] !== '>' && source[index - 1] !== '=' && source[index - 1] !== '!' && source[index - 1] !== '<' && source[index - 1] !== '>') {
        const rest = source.slice(index + 1, index + 200);
        if (!/^\s*(?:async\s*)?(?:\(|<|function\b)/.test(rest) || language !== 'typescript') break;
      }
      if (char === '\n' && /^(?:go|rust|swift|kotlin|java|csharp|dart)$/.test(language) && !/[,(]\s*$/.test(source.slice(start, index))) break;
    }
  }
  // Comments inside a kept body would comment out the rest once collapsed onto one line.
  let text = source.slice(start, index).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[ \t])(?:\/\/|#)[^\n]*/gm, '$1').replace(/\s+/g, ' ').replace(/\s*=>\s*$/, '').replace(/[:\s]+$/, '').trim();
  if (text.length > MAX_SIGNATURE) text = text.slice(0, MAX_SIGNATURE - 1) + '…';
  return text;
}

// First line of the doc comment directly above a declaration (or a Python docstring below it).
function docAt(source, start, end, language) {
  const before = source.slice(Math.max(0, start - 1500), start).replace(/[ \t]*(?:@\w[^\n]*\n)*$/, '').split('\n');
  before.pop();
  const lines = [];
  while (before.length) {
    const line = before.pop().trim();
    if (/^(?:\/\/\/?|#(?!\[|!)|\*|\/\*\*?)/.test(line) && !/^\*\/$/.test(line)) lines.unshift(line);
    else if (line === '*/' && !lines.length) continue;
    else break;
  }
  let text = lines.map(line => line.replace(/^(?:\/\/\/?|#|\/\*\*?|\*\/?)\s?/, '').replace(/\*\/$/, '').trim()).filter(Boolean)
    .find(line => !/^(?:SPDX|Copyright|@)/.test(line));
  // A docstring's first line may itself contain quotes ('List of ["=", line]'); only the closing delimiter ends it.
  if (!text && language === 'python') text = /^\s*(?:"""|''')\s*([^\n]*?)\s*(?:"""|''')?\s*$/m.exec(source.slice(end, end + 400).replace(/^[^\n]*\n/, '').split('\n')[0])?.[1];
  text = text?.replace(/<\/?(?:summary|remarks|returns|para)>/g, '').replace(/<(?:paramref|typeparamref|see)\s+\w+="([^"]+)"\s*\/>/g, '$1');
  return text?.trim() ? text.trim().replace(/\s+/g, ' ').slice(0, 100) : undefined;
}

export function outlineSource(source, language) {
  const pattern = DECLARATIONS[language];
  invariant(pattern, 'INVALID_OPTION', 'No outline rules for language ' + language + '.');
  const declarations = [];
  for (const match of source.matchAll(new RegExp(pattern.source, pattern.flags))) {
    const line = source.slice(match.index, source.indexOf('\n', match.index) >>> 0 || undefined);
    if (NOT_DECLARATIONS.test(line) || /\b(?:private|internal|protected|fileprivate)\b/.test(line.split(/[({=]/)[0])) continue;
    if (language === 'python' && /^(?:async\s+)?def\s+_|^class\s+_/.test(line)) continue;
    const signature = signatureAt(source, match.index, language);
    if (!signature || declarations.some(item => item.signature === signature)) continue;
    const doc = docAt(source, match.index, match.index + match[0].length, language);
    declarations.push({ signature, ...(doc ? { doc } : {}) });
  }
  return declarations;
}

const read = async (root, file) => (await readRegular(root, file, 1024 * 1024)).toString('utf8');
const languageOf = file => EXTENSIONS[path.extname(file)];

async function implementationFiles(root, kind, id) {
  if (kind === 'language-example') {
    const catalog = parseJson(await readRegular(root, 'examples/languages/modules.json'), 'language examples');
    const example = catalog.modules.find(item => item.id === id);
    invariant(example, 'NOT_FOUND', 'No language example named ' + id + '.');
    const base = example.base === 'cookbook' ? 'examples/cookbook/' : 'examples/languages/';
    return { language: example.language, files: example.files.filter(file => languageOf(file) && !/\.d\.ts$/.test(file)).map(file => base + file) };
  }
  if (kind === 'recipe') {
    const recipes = parseJson(await readRegular(root, 'resources/agent-recipes.json'), 'recipes');
    const recipe = recipes.entries.find(item => item.id === id);
    invariant(recipe, 'NOT_FOUND', 'No recipe named ' + id + '.');
    return { language: 'typescript', files: [recipe.path] };
  }
  const context = await loadCatalog(root);
  invariant(context.catalog.items.some(item => item.id === id), 'NOT_FOUND', 'No module named ' + id + '.');
  const manifest = await loadModule(context, id);
  return { language: 'typescript', files: manifest.files.map(file => file.path).filter(file => languageOf(file) && !/\.(?:test|spec)\./.test(file)) };
}

// Resolves `type:id` or a bare id (capability, language example, recipe, then module).
export async function outline(root, ref, { language } = {}) {
  root = await rootDirectory(root ?? ROOT);
  invariant(typeof ref === 'string' && /^(?:[a-z-]+:)?[a-z0-9][\w.@-]{0,159}$/i.test(ref) && !ref.includes('..'), 'INVALID_OPTION', 'Provide one reference such as capability:totp, go-totp or webhook-verification.');
  invariant(!language || LANGUAGES.includes(language), 'INVALID_OPTION', 'Language must be one of: ' + LANGUAGES.join(', '));
  let [type, id] = ref.includes(':') ? ref.split(/:(.*)/s) : [undefined, ref];
  let next, note;
  const { capabilities } = await loadCapabilities(root);
  const capability = (!type || type === 'capability') && capabilities.find(item => item.id === id);
  if (capability) {
    const chosen = language ?? 'typescript';
    const impl = capability.implementations[chosen];
    invariant(impl && impl.kind !== 'unavailable', 'NOT_FOUND', `Capability ${id} has no ${chosen} implementation.`);
    if (!language) note = 'Defaulted to typescript; pass --language with one of: ' + LANGUAGES.filter(name => capability.implementations[name]?.kind !== 'unavailable').join(', ');
    next = commandsFor(impl);
    ({ type, id } = { type: impl.kind, id: impl.id });
  } else invariant(!type || ['language-example', 'recipe', 'module'].includes(type), 'INVALID_OPTION', 'Outline supports capability, module, recipe and language-example references.');
  const candidates = type ? [type] : ['language-example', 'recipe', 'module'];
  let found;
  for (const kind of candidates) {
    try { found = { kind, ...(await implementationFiles(root, kind, id)) }; break; } catch (error) { if (error.code !== 'NOT_FOUND' || kind === candidates.at(-1)) throw error; }
  }
  next ??= commandsFor({ kind: found.kind, id });
  let sourceBytes = 0;
  const files = [];
  for (const file of found.files) {
    const source = await read(root, file);
    sourceBytes += Buffer.byteLength(source);
    const fileLanguage = languageOf(file);
    files.push({ path: file, lines: source.split('\n').length, declarations: outlineSource(source, fileLanguage) });
  }
  const result = { ref: `${found.kind}:${id}`, language: found.language, ...(note ? { note } : {}), files, next };
  return { ...result, sourceBytes, outlineBytes: Buffer.byteLength(JSON.stringify(result)) };
}

export function formatOutline(result) {
  const lines = [`${result.ref} (${result.language}) source ${result.sourceBytes} B, outline ${result.outlineBytes} B`];
  if (result.note) lines.push('# ' + result.note);
  for (const file of result.files) {
    lines.push(file.path);
    for (const item of file.declarations) lines.push('  ' + item.signature + (item.doc ? '  // ' + item.doc : ''));
  }
  for (const command of result.next) lines.push('$ ' + command);
  return lines.join('\n');
}

export function isOutline(value) {
  return object(value) && typeof value.ref === 'string' && Array.isArray(value.files);
}
