#!/usr/bin/env node
import {readFileSync,existsSync,lstatSync,realpathSync,mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve,dirname,relative,isAbsolute,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const recipes=JSON.parse(readFileSync(join(root,'resources/agent-recipes.json'),'utf8')).entries;
const [cmd,id,...args]=process.argv.slice(2);
const opt=n=>{const i=args.indexOf(n);return i<0?undefined:args[i+1]};
const within=(base,path)=>path.startsWith(base+sep);
try{
 if(!['plan','add'].includes(cmd))throw Error('Usage: plan|add <recipe> --target <existing-directory>');
 const recipe=recipes.find(x=>x.id===id);if(!recipe||recipe.kind!=='source-example')throw Error('Only reviewed source examples may be copied');
 const target=opt('--target');if(!target||!existsSync(target)||lstatSync(target).isSymbolicLink()||!lstatSync(target).isDirectory())throw Error('Existing non-symlink target required');
 const base=realpathSync(target);
 const path=recipe.path;
 if(isAbsolute(path)||path.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('Unsafe source path');
 const src=join(root,path);
 if(!existsSync(src)||lstatSync(src).isSymbolicLink()||!lstatSync(src).isFile())throw Error('Unsafe source file');
 const dest=join(base,'genlib',path);
 let cursor=base;
 for(const part of ['genlib',...path.split('/').slice(0,-1)]){
  cursor=join(cursor,part);
  if(existsSync(cursor)&&(lstatSync(cursor).isSymbolicLink()||!lstatSync(cursor).isDirectory()))throw Error('Unsafe target parent');
 }
 if(!within(base,dest)||existsSync(dest))throw Error('Target conflict or escape');
 const body=readFileSync(src),sha256=createHash('sha256').update(body).digest('hex');
 if(cmd==='add'){mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,body,{flag:'wx',mode:0o644})}
 console.log(JSON.stringify({action:cmd,id,source:path,destination:dest,sha256,requiresIntegrationChecks:recipe.checks},null,2));
}catch(e){console.error(e.message);process.exitCode=1}
