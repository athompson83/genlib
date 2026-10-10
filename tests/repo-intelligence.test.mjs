import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const run=(...args)=>execFileSync(process.execPath,args,{encoding:'utf8'}).trim();
test('repository map and diagram are reproducible',()=>{
 run('tools/repo-map.mjs','build');
 run('tools/repo-map.mjs','check');
 const graph=JSON.parse(readFileSync('.genlib/repo-map.json','utf8'));
 assert.ok(graph.files.length>30);
 assert.equal(new Set(graph.files.map(x=>x.path)).size,graph.files.length);
 run('tools/repo-diagram.mjs');
 const before=readFileSync('docs/diagrams/repository.mmd','utf8');
 assert.match(before,/flowchart TD/);
 run('tools/repo-diagram.mjs');
 assert.equal(readFileSync('docs/diagrams/repository.mmd','utf8'),before);
 assert.ok(JSON.parse(run('tools/repo-map.mjs','find','notification')).matches.length);
 assert.equal(JSON.parse(run('tools/repo-map.mjs','impact','modules/common-api-clients/files/http.ts')).commit,graph.commit);
});
