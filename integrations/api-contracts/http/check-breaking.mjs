// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
function check(path) {
  const result=spawnSync('oasdiff',['breaking','schema/openapi.json',path,'--fail-on','ERR','--format','json'],{encoding:'utf8'});
  if(result.error) throw result.error;
  if(result.signal) throw new Error('oasdiff terminated: '+result.signal);
  return result;
}
assert.equal(check('schema/openapi.json').status,0,'Unchanged contract must pass');
const broken=check('fixtures/openapi-breaking.json');
assert.equal(broken.status,1,'Removed GET /items must be rejected');
assert.match(broken.stdout,/items/);
