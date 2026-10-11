// SPDX-License-Identifier: Apache-2.0
import { Project } from 'ts-morph';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Rewrite exact static imports/re-exports. Does not change require(), dynamic imports, or identifiers. */
export function rewriteImports(source, from, to) {
  if (typeof source !== 'string' || !from || !to || from === to) throw new TypeError('Source and distinct module names are required');
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile('input.ts', source);
  let count = 0;
  for (const declaration of [...file.getImportDeclarations(), ...file.getExportDeclarations()]) {
    if (declaration.getModuleSpecifierValue() === from) {
      declaration.setModuleSpecifier(to);
      count++;
    }
  }
  return { source: file.getFullText(), count };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, from, to] = process.argv.slice(2);
  if (!input || !from || !to) throw new Error('Usage: node codemods/imports.mjs INPUT FROM TO (prints preview to stdout)');
  process.stdout.write(rewriteImports(readFileSync(input, 'utf8'), from, to).source);
}
