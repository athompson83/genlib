#!/usr/bin/env node
import {readFileSync} from 'node:fs';
const registry=JSON.parse(readFileSync(new URL('../resources/agent-recipes.json',import.meta.url),'utf8'));
const [cmd,...args]=process.argv.slice(2);
const query=args.join(' ').toLowerCase().trim();
if(cmd==='find'){
 if(!query){console.error('Search terms required');process.exitCode=2}
 else{
  const words=query.split(/[^a-z0-9]+/).filter(Boolean);
  const ranked=registry.entries.map(x=>({entry:x,score:words.reduce((n,w)=>n+(x.taskTerms.some(t=>t.includes(w))?3:0)+(x.id.includes(w)?4:0),0)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.entry.id.localeCompare(b.entry.id)).slice(0,5);
  console.log(JSON.stringify({query,matches:ranked.map(({entry,score})=>({...entry,score})),warning:"Inspect contracts and target app before copying"},null,2));
 }
}else if(cmd==='inspect'){
 const item=registry.entries.find(x=>x.id===query);
 if(!item){console.error('Unknown recipe');process.exitCode=1}else console.log(JSON.stringify(item,null,2));
}else if(cmd==='validate'){
 const ids=new Set();
 for(const x of registry.entries){if(ids.has(x.id)||!x.path||!x.taskTerms.length||!x.checks.length)throw Error('Invalid recipe');ids.add(x.id)}
 console.log(JSON.stringify({valid:true,entries:ids.size}));
}else{console.error('Usage: find <task> | inspect <id> | validate');process.exitCode=2}
