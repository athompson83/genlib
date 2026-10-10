#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const sha=git('rev-parse','HEAD');
const graph=JSON.parse(readFileSync('.genlib/repo-map.json','utf8'));
if(graph.commit!==sha){console.error('Stale repository map');process.exit(1)}
const tasks=[
 {query:'notification preferences',expected:'modules/notification-preferences/files/core.ts'},
 {query:'stripe checkout',expected:'modules/common-api-clients/files/stripe.ts'},
 {query:'app shell',expected:'modules/app-shell/files/AppShell.tsx'},
 {query:'data table',expected:'modules/data-table/files/DataTable.tsx'},
 {query:'github',expected:'modules/common-api-clients/files/github.ts'}
];
const tokenize=s=>s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const score=(f,q)=>tokenize(q).reduce((n,w)=>n+(f.path.toLowerCase().includes(w)?5:0)+(f.symbols?.some(s=>s.toLowerCase().includes(w))?3:0),0);
const rows=tasks.map(t=>{
 const ranked=graph.files.map(f=>({path:f.path,score:score(f,t.query)})).filter(f=>f.score>0).sort((a,b)=>b.score-a.score||a.path.localeCompare(b.path)).slice(0,10);
 const rank=ranked.findIndex(x=>x.path===t.expected)+1;
 return {...t,rank:rank||null,top5:rank>0&&rank<=5};
});
const report={commit:sha,taskCount:rows.length,recallAt5:rows.filter(r=>r.top5).length/rows.length,rows,disclaimer:'This is a fixed-path retrieval smoke benchmark, not an LLM token/cost or task-success benchmark'};
console.log(JSON.stringify(report,null,2));
if(process.argv.includes('--require-perfect')&&report.recallAt5!==1)process.exit(1);
