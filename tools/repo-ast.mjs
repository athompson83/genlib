#!/usr/bin/env node
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {posix} from 'node:path';
// The parser needs TypeScript's JavaScript compiler API. TypeScript 7 ships only the native compiler,
// so prefer the pinned 5.x API alias and fall back to a 'typescript' package that still exposes it.
const ts=(()=>{const req=createRequire(import.meta.url);for(const name of ['typescript-ast','typescript']){try{const api=req(name);if(typeof api.createSourceFile==='function')return api}catch{}}throw new Error('TypeScript compiler API not found: run npm ci (typescript-ast alias)')})();
const supported=/\.(?:[cm]?[jt]sx?)$/;
export function extractImports(source,path){
 const kind=/\.tsx$/.test(path)?ts.ScriptKind.TSX:/\.jsx$/.test(path)?ts.ScriptKind.JSX:/\.ts$/.test(path)?ts.ScriptKind.TS:ts.ScriptKind.JS;
 const sf=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,kind);
 const imports=new Set();
 const add=x=>{if(x&&ts.isStringLiteralLike(x))imports.add(x.text)};
 const walk=node=>{
  if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node))add(node.moduleSpecifier);
  if(ts.isImportEqualsDeclaration(node)&&ts.isExternalModuleReference(node.moduleReference))add(node.moduleReference.expression);
  if(ts.isCallExpression(node)&&node.arguments.length===1&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(node.expression)&&node.expression.text==='require'))add(node.arguments[0]);
  ts.forEachChild(node,walk);
 };
 walk(sf);return [...imports].sort();
}
export function resolveImport(path,spec,known){
 if(!spec.startsWith('.'))return null;
 const base=posix.normalize(posix.join(posix.dirname(path),spec));
 if(base.startsWith('../')||base==='.genlib')return null;
 const stem=base.replace(/\.(?:[cm]?[jt]sx?)$/,'');
 const options=[base,...['.ts','.tsx','.mts','.cts','.js','.jsx','.mjs','.cjs','.json'].map(e=>stem+e),...['.ts','.tsx','.js','.jsx'].map(e=>posix.join(base,'index'+e))];
 return options.find(x=>known.has(x))||null;
}
export function analyze(files,cache={}){
 const known=new Set(files.map(x=>x.path)),nextCache={};let parsed=0,reused=0;const edges=[];
 for(const f of files){
  if(!supported.test(f.path))continue;
  const prior=cache[f.path];let imports;
  if(prior?.hash===f.sha256&&Array.isArray(prior.imports)){imports=prior.imports;reused++}
  else{imports=extractImports(readFileSync(f.path,'utf8'),f.path);parsed++}
  nextCache[f.path]={hash:f.sha256,imports};
  for(const spec of imports){const to=resolveImport(f.path,spec,known);if(to)edges.push({from:f.path,to,via:spec})}
 }
 edges.sort((a,b)=>a.from.localeCompare(b.from)||a.to.localeCompare(b.to)||a.via.localeCompare(b.via));
 return {edges,cache:nextCache,stats:{parsed,reused}};
}
function main(){
 const cmd=process.argv[2]||'build';
 const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const map=JSON.parse(readFileSync('.genlib/repo-map.json','utf8'));
 if(map.commit!==head)throw new Error('Stale map; regenerate before AST indexing');
 let prior={};try{prior=JSON.parse(readFileSync('.genlib/ast-cache.json','utf8')).files||{}}catch{}
 const result=analyze(map.files,prior);
 const graph={schemaVersion:2,engine:'typescript-ast',commit:head,edges:result.edges,limitations:'TS/JS syntax and literal dynamic imports; no path aliases or semantic resolution'};
 if(cmd==='build'){
  mkdirSync('.genlib',{recursive:true});
  writeFileSync('.genlib/ast-dependencies.json',JSON.stringify(graph,null,2)+'\n');
  writeFileSync('.genlib/ast-cache.json',JSON.stringify({schemaVersion:1,files:result.cache},null,2)+'\n');
  console.log(JSON.stringify({commit:head,...result.stats,edges:result.edges.length}));
 }else if(cmd==='check'){
  const saved=JSON.parse(readFileSync('.genlib/ast-dependencies.json','utf8'));
  if(JSON.stringify(saved)!==JSON.stringify(graph))throw new Error('AST graph stale');
  console.log('AST graph current');
 }else throw new Error('Usage: build | check');
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){try{main()}catch(e){console.error(e.message);process.exitCode=1}}
