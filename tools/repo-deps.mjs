#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {dirname,posix} from 'node:path';
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const map=JSON.parse(readFileSync('.genlib/repo-map.json','utf8'));
if(map.commit!==head){console.error('Stale index: run node tools/repo-map.mjs build');process.exit(1)}
const byPath=new Map(map.files.map(f=>[f.path,f]));
const edges=[];
for(const file of map.files){
 for(const specifier of file.imports||[]){
  if(!specifier.startsWith('.'))continue;
  const base=posix.normalize(posix.join(posix.dirname(file.path),specifier));
  const candidates=[base,base+'.ts',base+'.tsx',base+'.js',base+'.jsx',base+'.mjs',base+'.json',base+'/index.ts',base+'/index.tsx',base+'/index.js'];
  const target=candidates.find(p=>byPath.has(p));
  if(target)edges.push({from:file.path,to:target,via:specifier});
 }
}
edges.sort((a,b)=>a.from.localeCompare(b.from)||a.to.localeCompare(b.to)||a.via.localeCompare(b.via));
const result={schemaVersion:1,commit:head,edges,unresolvedPolicy:'External, aliased and dynamic imports not represented'};
const cmd=process.argv[2]||'build';
if(cmd==='build'){
 mkdirSync('.genlib',{recursive:true});writeFileSync('.genlib/dependencies.json',JSON.stringify(result,null,2)+'\n');
 console.log('Resolved '+edges.length+' relative imports at '+head);
}else if(cmd==='check'){
 let old;try{old=JSON.parse(readFileSync('.genlib/dependencies.json','utf8'))}catch{console.error('Missing dependency graph');process.exit(1)}
 if(JSON.stringify(old)!==JSON.stringify(result)){console.error('Stale dependency graph');process.exit(1)}
 console.log('Dependency graph current');
}else if(cmd==='impact'){
 const target=process.argv[3];if(!byPath.has(target)){console.error('Provide an indexed path');process.exit(2)}
 const reverse=new Map();for(const e of edges){if(!reverse.has(e.to))reverse.set(e.to,new Set());reverse.get(e.to).add(e.from)}
 const seen=new Set([target]),queue=[target],affected=[];
 while(queue.length){const cur=queue.shift();for(const dep of reverse.get(cur)||[]){if(seen.has(dep))continue;seen.add(dep);affected.push(dep);queue.push(dep)}}
 console.log(JSON.stringify({commit:head,target,transitiveDependents:affected.sort(),caveat:'Resolved relative imports only; not a complete change impact proof'},null,2));
}else{console.error('Usage: build | check | impact <path>');process.exit(2)}
