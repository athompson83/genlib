// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTitle,assertTrustedFrame} from '../core/normalize.mjs';
test('IPC function validates type and Unicode scalar length',()=>{
 assert.equal(normalizeTitle('  Label  '),'Label');
 for(const value of [null,{},[],42,' ','界'.repeat(201)]) assert.throws(()=>normalizeTitle(value));
 assert.equal(normalizeTitle('界'.repeat(200)).length,200);
});
test('subframes and unknown senders cannot invoke privileged capability',()=>{
 const main={};assert.doesNotThrow(()=>assertTrustedFrame(main,main));
 assert.throws(()=>assertTrustedFrame({},main));assert.throws(()=>assertTrustedFrame(null,main));
});
