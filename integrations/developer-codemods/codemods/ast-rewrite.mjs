// SPDX-License-Identifier: Apache-2.0
import { parse, Lang } from '@ast-grep/napi';
/** Replace exactly console.log(...) calls, preserving their arguments. Returns source, never writes files. */
export function replaceConsoleLog(source) {
  const root = parse(Lang.TypeScript, source).root();
  const edits = root.findAll({ rule: { pattern: 'console.log($$$ARGS)' } }).map(node =>
    node.replace(node.text().replace(/^console\.log/, 'logger.info')));
  return root.commitEdits(edits);
}
