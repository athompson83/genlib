#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const load=p=>{const g=JSON.parse(readFileSync(p,'utf8'));if(g.commit!==sha)throw Error('Stale artifact '+p);return g};
try{
 const map=load('.genlib/repo-map.json');
 const graph=(()=>{try{return load('.genlib/ast-dependencies.json')}catch(e){if(e.code!=='ENOENT')throw e;return load('.genlib/dependencies.json')}})();
 const group=p=>p.startsWith('.')?p.split('/').slice(0,2).join('/'):p.split('/')[0];
 const groups=new Map();
 for(const f of map.files)groups.set(group(f.path),(groups.get(group(f.path))||0)+1);
 const names=[...groups.keys()].sort(), ids=new Map(names.map((n,i)=>[n,'G'+i]));
 const lines=['flowchart TD','  ROOT["Repository '+sha.slice(0,10)+'"]'];
 for(const name of names){
  const safe=name.replace(/[\[\]"<>]/g,'');
  lines.push('  '+ids.get(name)+'["'+safe+' ('+groups.get(name)+' files)"]');
  lines.push('  ROOT --> '+ids.get(name));
 }
 const pairs=new Map();
 for(const e of graph.edges){
  const a=group(e.from),b=group(e.to);if(a===b||!ids.has(a)||!ids.has(b))continue;
  const key=a+'\0'+b;pairs.set(key,(pairs.get(key)||0)+1);
 }
 for(const [key,count] of [...pairs].sort(([a],[b])=>a.localeCompare(b))){
  const [a,b]=key.split('\0');lines.push('  '+ids.get(a)+' -->|'+count+' imports| '+ids.get(b));
 }
 const target='docs/diagrams/repository.mmd';
 mkdirSync(dirname(target),{recursive:true});writeFileSync(target,lines.join('\n')+'\n');
 console.log('Generated '+target+' from '+sha+' ('+pairs.size+' cross-group edges)');
}catch(e){console.error(e.message);process.exitCode=1}
