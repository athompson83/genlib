#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const load=p=>{const d=JSON.parse(readFileSync(p,'utf8'));if(d.commit!==head)throw new Error('Stale artifact: '+p);return d};
try{
 const map=load('.genlib/repo-map.json'),deps=load('.genlib/dependencies.json');
 const query=process.argv.slice(2).join(' ').trim();
 if(!query)throw new Error('Usage: node tools/repo-context.mjs <task keywords>');
 const words=query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
 const rank=f=>words.reduce((n,w)=>n+(f.path.toLowerCase().includes(w)?5:0)+(f.symbols?.some(s=>s.toLowerCase().includes(w))?3:0),0);
 const matches=map.files.map(f=>({path:f.path,score:rank(f)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.path.localeCompare(b.path)).slice(0,5);
 const chosen=new Set(matches.map(x=>x.path));
 const relationships=deps.edges.filter(e=>chosen.has(e.from)||chosen.has(e.to)).slice(0,25);
 const testCandidates=map.files.filter(f=>/test|spec/.test(f.path.toLowerCase())&&matches.some(m=>m.path.split('/').at(-1).replace(/\.[^.]+$/,'').toLowerCase().split(/[-_.]/).some(w=>w.length>3&&f.path.toLowerCase().includes(w)))).map(f=>f.path).slice(0,8);
 console.log(JSON.stringify({commit:head,query,files:matches,relatedImports:relationships,possibleTests:testCandidates,limits:'Lexical search and relative-import graph; inspect code and run full relevant checks'},null,2));
}catch(e){console.error(e.message);process.exit(1)}
