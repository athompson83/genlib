#!/usr/bin/env node
import {readFileSync,existsSync,lstatSync,realpathSync} from 'node:fs';
import {join,resolve,dirname,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {installCopy,planCopy,readLock} from '../lib/install.mjs';
import {removeModule} from '../lib/lifecycle.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const recipes=JSON.parse(readFileSync(join(root,'resources/agent-recipes.json'),'utf8')).entries;
const [cmd,id,...args]=process.argv.slice(2);
const opt=n=>{const i=args.indexOf(n);return i<0?undefined:args[i+1]};
const digest=b=>createHash('sha256').update(b).digest('hex');
try{
 if(!['plan','add','remove'].includes(cmd))throw Error('Usage: plan|add <recipe> --target <existing-directory> [--into <dir, default genlib>] | remove <recipe> --target <existing-directory> [--dry-run]');
 const target=opt('--target');if(!target||!existsSync(target)||lstatSync(target).isSymbolicLink()||!lstatSync(target).isDirectory())throw Error('Existing non-symlink target required');
 if(cmd==='remove'){
  // Same rollback as genlib remove: unedited files are deleted, edited ones kept, shared ones kept for other owners.
  if(!id||(await readLock(target)).modules[id]?.kind!=='recipe')throw Error(`${id} is not recorded as a recipe in .genlib/lock.json`);
  console.log(JSON.stringify(await removeModule(null,target,id,{dryRun:args.includes('--dry-run')}),null,2));
 }else{
  const recipe=recipes.find(x=>x.id===id);if(!recipe||recipe.kind!=='source-example')throw Error('Only reviewed source examples may be copied');
  const base=realpathSync(target);
  const path=recipe.path;
  if(isAbsolute(path)||path.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('Unsafe source path');
  const src=join(root,path);
  if(!existsSync(src)||lstatSync(src).isSymbolicLink()||!lstatSync(src).isFile())throw Error('Unsafe source file');
  // One file lands under --into (default genlib/), named as in Genlib, without Genlib's own folder tree.
  const into=(opt('--into')??'genlib').replace(/\/+$/,'');
  if(isAbsolute(into)||into.split(/[\\/]/).some(p=>!p||p==='.'||p==='..'||p.toLowerCase()==='.git'))throw Error('Unsafe --into directory');
  const relative=into+'/'+path.split('/').at(-1);
  const body=readFileSync(src),sha256=digest(body);
  // Ownership, hashes, the lock and the receipt follow the module installer: an identical file Genlib already tracks is
  // reused ("unchanged"); an untracked or edited file at the destination is a conflict; symlinks are never followed.
  const spec={kind:'recipe',id,manifestSha256:digest(JSON.stringify({kind:'recipe',id,path,sha256})),out:into,root,files:[{target:relative,bytes:body}]};
  const copy=cmd==='add'?await installCopy(target,spec):await planCopy(target,spec);
  if(copy.conflicts.length)throw Error('Target conflict: '+copy.conflicts.join(' '));
  console.log(JSON.stringify({action:cmd,id,source:path,destination:join(base,...relative.split('/')),sha256,file:copy.files[0].action,...(copy.status?{status:copy.status}:{}),lock:copy.lock,...(copy.receipt?{receipt:copy.receipt}:{}),requiresIntegrationChecks:recipe.checks},null,2));
 }
}catch(e){console.error(e.message);process.exitCode=1}
