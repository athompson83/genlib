// SPDX-License-Identifier: Apache-2.0
/** Dedicated checked-out pg Client required. This function owns its transaction. */
export async function insertInventoryBatch(client,rows) {
  if(!Array.isArray(rows)||rows.length>1000)throw new TypeError('At most 1000 rows required');
  await client.query('BEGIN');
  try{
    for(const row of rows){
      const title=typeof row.title==='string'?row.title.trim():'';
      if(typeof row.id!=='string'||!row.id||row.id.length>64||!title||[...title].length>200)throw new TypeError('Invalid inventory row');
      await client.query('INSERT INTO item(id,title) VALUES($1,$2)',[row.id,title]);
    }
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}
}
