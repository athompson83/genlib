// SPDX-License-Identifier: Apache-2.0
// Explicit Docker gate: a missing daemon is a failure, never a skipped success.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PostgreSqlContainer} from '@testcontainers/postgresql';
import pg from 'pg';
import {insertInventoryBatch} from '../../node/postgres.mjs';
test('PostgreSQL batch inserts are atomic and parameterized',{timeout:120000},async()=>{
 const container=await new PostgreSqlContainer(process.env.GENLIB_TEST_POSTGRES_IMAGE??'postgres:18.6-alpine3.24').start();
 const client=new pg.Client({connectionString:container.getConnectionUri()});
 try{
  await client.connect();await client.query(await readFile(new URL('../../fixtures/postgres.sql',import.meta.url),'utf8'));
  await insertInventoryBatch(client,[{id:'a',title:"Alice's item"}]);
  await assert.rejects(insertInventoryBatch(client,[{id:'b',title:'Before invalid'},{id:'c',title:''}]));
  const rows=(await client.query('SELECT id,title,completed FROM item ORDER BY id')).rows;
  assert.deepEqual(rows,[{id:'a',title:"Alice's item",completed:false}]);
  await assert.rejects(insertInventoryBatch(client,[{id:'a',title:'Duplicate'}]));
 }finally{await client.end();await container.stop();}
});
