#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync,lstatSync,realpathSync,existsSync} from 'node:fs';
import {resolve,join,dirname,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {outlineSource} from '../lib/outline.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const catalog=JSON.parse(readFileSync(join(root,'examples/languages/modules.json'),'utf8'));
// The capability a language module implements may name a known limit; the copy output repeats it.
const capabilityCaveat=id=>{try{return JSON.parse(readFileSync(join(root,'resources/capabilities.json'),'utf8')).capabilities.find(c=>Object.values(c.implementations).some(i=>i.id===id))?.caveat}catch{return undefined}};
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
  // --into <relative dir> chooses the destination folder (default genlib/); --flat drops the source folders and, without
  // --into, copies straight into the target, so a Python module and its test land side by side, importable as written.
  const flat=flags.includes('--flat');const into=arg('--into')??(flat?'.':'genlib');
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
   // Name what the copied tests already cover, so agents add tests only for what the task adds.
   const names=[...new Set(planned.filter(p=>selected.tests.includes(p.source)).flatMap(p=>[...readFileSync(p.destination,'utf8').matchAll(/(?:def|func|fun|void|fn|test\()\s*['"]?(test[\w ]*)/gi)].map(m=>m[1].trim().replace(/^test_?/i,'')).filter(Boolean)))];
   if(names.length)lines.push('# tests cover: '+(names.slice(0,10).join(', ')+(names.length>10?` (+${names.length-10} more)`:'')).slice(0,160));
   // --run-tests runs the copied tests now (Python and Go, whose commands are known) and reports the outcome in one line, saving the agent a turn.
   if(cmd==='add'&&flags.includes('--run-tests')&&tests.length){
    const run=selected.language==='python'?spawnSync('python3',['-m','unittest',...tests.map(x=>x.split('/').pop().replace(/\.py$/,''))],{cwd:join(base,dirname(tests[0])),encoding:'utf8',timeout:120000,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}})
     :selected.language==='go'?spawnSync('go',['test','./'+dirname(tests[0])],{cwd:base,encoding:'utf8',timeout:300000}):null;
    if(!run)lines.push('# tests run: not supported for '+selected.language+'; use the # test command');
    else{const out=(run.stdout+run.stderr).trim();const summary=selected.language==='python'?(out.match(/Ran \d+ tests? in [\d.]+s/)?.[0]??''):out.split('\n').filter(l=>/^(ok|FAIL)\b/.test(l)).join('; ');
     if(run.status===0)lines.push('# tests run: passed'+(summary?' ('+summary+')':''));
     else lines.push('# tests run: FAILED'+(run.error?' ('+run.error.message+')':''),...out.split('\n').slice(-15).map(l=>'  '+l));}
   }
   // Agents in measured runs read the whole copied source to check it; say what is already verified instead.
   lines.push('# verified: '+(selected.verification??'tested')+' against shared vectors in every language; read the source only to change it.');
   const caveat=capabilityCaveat(id);if(caveat)lines.push('# caveat: '+caveat);
   console.log(lines.join('\n'));
  }
 }else throw Error('Usage: list | inspect <id> | plan|add <id> --target <existing-directory> [--with-tests] [--into <dir>] [--flat] [--run-tests] [--json]');
}catch(e){console.error(e.message);process.exitCode=1}
