#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync,lstatSync,realpathSync,existsSync} from 'node:fs';
import {resolve,join,dirname,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const catalog=JSON.parse(readFileSync(join(root,'examples/languages/modules.json'),'utf8'));
const [cmd,id,...flags]=process.argv.slice(2);
const selected=catalog.modules.find(m=>m.id===id);
const arg=name=>{const i=flags.indexOf(name);return i<0?null:flags[i+1]};
const digest=s=>createHash('sha256').update(s).digest('hex');
const safePath=p=>{if(!p||isAbsolute(p)||p.split(/[\\/]/).some(x=>x==='..'||x==='.'||x===''))throw Error('Unsafe path: '+p);return p};
const sourcePath=p=>join(root,'examples/languages',safePath(p));
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
 if(cmd==='list'){console.log(JSON.stringify(catalog.modules.map(({id,language,runtime,status})=>({id,language,runtime,status})),null,2));}
 else if(cmd==='inspect'){if(!selected)throw Error('Unknown module');console.log(JSON.stringify(selected,null,2));}
 else if(cmd==='plan'||cmd==='add'){
  if(!selected)throw Error('Unknown module');
  const target=arg('--target');if(!target||!existsSync(target)||!lstatSync(target).isDirectory())throw Error('Existing target directory required');
  const includeTests=flags.includes('--with-tests');
  const paths=[...selected.files,...(includeTests?selected.tests:[])];
  const planned=paths.map(path=>({source:path,destination:destination(target,'genlib/'+path),sha256:digest(readFileSync(checkSource(path)))}));
  if(cmd==='add'){
   // Validate the entire plan before creating any destination.
   for(const p of planned){mkdirSync(dirname(p.destination),{recursive:true});writeFileSync(p.destination,readFileSync(checkSource(p.source)),{flag:'wx',mode:0o644});}
  }
  console.log(JSON.stringify({operation:cmd,id,target:realpathSync(target),files:planned},null,2));
 }else throw Error('Usage: list | inspect <id> | plan|add <id> --target <existing-directory> [--with-tests]');
}catch(e){console.error(e.message);process.exitCode=1}
