#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync,lstatSync,realpathSync,existsSync} from 'node:fs';
import {resolve,join,dirname,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {outlineSource} from '../lib/outline.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const catalog=JSON.parse(readFileSync(join(root,'examples/languages/modules.json'),'utf8'));
const [cmd,id,...flags]=process.argv.slice(2);
const selected=catalog.modules.find(m=>m.id===id);
const arg=name=>{const i=flags.indexOf(name);return i<0?null:flags[i+1]};
const digest=s=>createHash('sha256').update(s).digest('hex');
const safePath=p=>{if(!p||isAbsolute(p)||p.split(/[\\/]/).some(x=>x==='..'||x==='.'||x===''))throw Error('Unsafe path: '+p);return p};
// Modules live under examples/languages by default; base "cookbook" selects examples/cookbook.
const BASES={languages:'examples/languages',cookbook:'examples/cookbook'};
const base=m=>{const b=BASES[m?.base??'languages'];if(!b)throw Error('Unknown module base');return b};
const sourcePath=p=>join(root,base(selected),safePath(p));
const checkSource=p=>{const src=sourcePath(p);if(lstatSync(src).isSymbolicLink())throw Error('Source symlink rejected');return src};
const within=(base,path)=>path===base||path.startsWith(base+sep);
function destination(target,rel){
 const base=realpathSync(target);
 const parts=safePath(rel).split('/');
 let current=base;
 for(const part of parts.slice(0,-1)){
  current=join(current,part);
  if(existsSync(current)){
   if(lstatSync(current).isSymbolicLink()||!lstatSync(current).isDirectory())throw Error('Unsafe target parent');
   if(!within(base,realpathSync(current)))throw Error('Target escape');
  }
 }
 const output=join(base,...parts);
 if(!within(base,output))throw Error('Target escape');
 if(existsSync(output))throw Error('Destination already exists: '+output);
 return output;
}
try{
 if(cmd==='list'){console.log(JSON.stringify(catalog.modules.map(({id,language,runtime,status,base})=>({id,language,runtime,status,...(base?{base}:{})})),null,2));}
 else if(cmd==='inspect'){if(!selected)throw Error('Unknown module');console.log(JSON.stringify(selected,null,2));}
 else if(cmd==='plan'||cmd==='add'){
  if(!selected)throw Error('Unknown module');
  const target=arg('--target');if(!target||!existsSync(target)||!lstatSync(target).isDirectory())throw Error('Existing target directory required');
  const includeTests=flags.includes('--with-tests');
  // --into <relative dir> chooses the destination folder (default genlib/); --flat drops the source folders so a
  // Python module and its test land side by side, importable as written. Both stay inside the target.
  const into=arg('--into')??'genlib';const flat=flags.includes('--flat');
  const prefix=into==='.'?'':safePath(into.replace(/\/+$/,''))+'/';
  const paths=[...selected.files,...(includeTests?selected.tests:[])];
  const rel=path=>prefix+(flat?path.split('/').pop():path);
  if(flat&&new Set(paths.map(rel)).size!==paths.length)throw Error('--flat would overwrite: two files share a name');
  const planned=paths.map(path=>({source:path,destination:destination(target,rel(path)),sha256:digest(readFileSync(checkSource(path)))}));
  if(cmd==='add'){
   // Validate the entire plan before creating any destination.
   for(const p of planned){mkdirSync(dirname(p.destination),{recursive:true});writeFileSync(p.destination,readFileSync(checkSource(p.source)),{flag:'wx',mode:0o644});}
  }
  if(flags.includes('--json')){console.log(JSON.stringify({operation:cmd,id,target:realpathSync(target),files:planned},null,2));}
  else{
   // Compact text: what was copied, the public API and how to run the copied tests, so the agent need not read the source.
   const base=realpathSync(target),lines=[`${cmd==='add'?'added':'would add'} ${id} to ${base} (sha256 checked):`,...planned.map(p=>'  '+relative(base,p.destination))];
   const api=selected.files.flatMap(f=>{try{return outlineSource(readFileSync(checkSource(f),'utf8'),selected.language).map(e=>'  '+e.signature+(e.doc?'  // '+e.doc.slice(0,70):''))}catch{return[]}}).slice(0,12);
   if(api.length)lines.push('# api:',...api);
   const tests=planned.filter(p=>selected.tests.includes(p.source)).map(p=>relative(base,p.destination));
   const hint={python:t=>`cd ${join(base,dirname(t[0]))} && python3 -m unittest ${t.map(x=>x.split('/').pop().replace(/\.py$/,'')).join(' ')}`,go:t=>`cd ${base} && go test ./${dirname(t[0])}`};
   if(tests.length)lines.push('# test: '+(hint[selected.language]?.(tests)??'run '+tests.join(', ')+' with the project test runner'));
   console.log(lines.join('\n'));
  }
 }else throw Error('Usage: list | inspect <id> | plan|add <id> --target <existing-directory> [--with-tests] [--into <dir>] [--flat] [--json]');
}catch(e){console.error(e.message);process.exitCode=1}
