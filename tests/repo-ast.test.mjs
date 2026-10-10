import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {extractImports,resolveImport,analyze} from '../tools/repo-ast.mjs';
test('AST finds import/export/require/literal dynamic imports but ignores comments',()=>{
 const source=`// import 'fake'
 import A from './alpha'; export {B} from './beta';
 const a=require('./gamma'); const b=import('./delta'); const c=import(variable);`;
 assert.deepEqual(extractImports(source,'src/main.ts'),['./alpha','./beta','./delta','./gamma']);
});
test('relative resolution handles index files and rejects package names',()=>{
 const paths=new Set(['src/alpha.ts','src/ui/index.tsx']);
 assert.equal(resolveImport('src/main.ts','./alpha',paths),'src/alpha.ts');
 assert.equal(resolveImport('src/main.ts','./ui',paths),'src/ui/index.tsx');
 assert.equal(resolveImport('src/main.ts','react',paths),null);
 assert.equal(resolveImport('src/main.ts','../../private',paths),null);
});
test('hash-keyed incremental cache reuses unchanged syntax',()=>{
 const dir=mkdtempSync(join(tmpdir(),'genlib-ast-'));
 try{
  const path=join(dir,'sample.ts');writeFileSync(path,`import { x } from './other';`);
  const files=[{path,sha256:'hash-one'}];
  const first=analyze(files,{});
  assert.equal(first.stats.parsed,1);
  const second=analyze(files,first.cache);
  assert.equal(second.stats.reused,1);
  assert.equal(second.stats.parsed,0);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
