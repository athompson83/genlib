import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const run=(...args)=>execFileSync(process.execPath,args,{encoding:'utf8'}).trim();
test('relative dependency graph is reproducible and commit-bound',()=>{
 run('tools/repo-map.mjs','build');
 run('tools/repo-deps.mjs','build');
 run('tools/repo-deps.mjs','check');
 const graph=JSON.parse(readFileSync('.genlib/dependencies.json','utf8'));
 const map=JSON.parse(readFileSync('.genlib/repo-map.json','utf8'));
 assert.equal(graph.commit,map.commit);
 assert.ok(Array.isArray(graph.edges));
 const paths=new Set(map.files.map(x=>x.path));
 for(const edge of graph.edges){assert.ok(paths.has(edge.from));assert.ok(paths.has(edge.to))}
 const impact=JSON.parse(run('tools/repo-deps.mjs','impact','modules/common-api-clients/files/http.ts'));
 assert.equal(impact.commit,map.commit);
 assert.ok(Array.isArray(impact.transitiveDependents));
});
