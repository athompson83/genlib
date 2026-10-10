// SPDX-License-Identifier: Apache-2.0
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

/** Deliberately local-only fixture. In-memory data is reset on process restart. */
export function inventoryServer({ token = 'genlib-fixture-token', pageSize = 2 } = {}) {
  const items = new Map();
  const reply = (res, status, value) => { res.writeHead(status, { 'content-type':'application/json', 'cache-control':'no-store' }); res.end(JSON.stringify(value)); };
  const fail = (res,status,code,message) => reply(res,status,{code,message});
  return createServer(async (req,res) => {
    try {
      if (req.headers.authorization !== 'Bearer '+token) return fail(res,401,'UNAUTHORIZED','Fixture token required');
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/items' && !['GET','POST'].includes(req.method)) { res.setHeader('allow','GET, POST'); return fail(res,405,'METHOD_NOT_ALLOWED','Use GET or POST'); }
      if (url.pathname.startsWith('/items/') && req.method !== 'GET') { res.setHeader('allow','GET'); return fail(res,405,'METHOD_NOT_ALLOWED','Use GET'); }
      if (req.method === 'GET' && url.pathname === '/items') {
        const raw = url.searchParams.get('cursor') ?? '0';
        if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) return fail(res,400,'INVALID_CURSOR','Cursor must be a non-negative safe integer');
        const cursor = Number(raw), all = [...items.values()];
        const page = { items: all.slice(cursor,cursor+pageSize) };
        if (cursor + pageSize < all.length) page.nextCursor = cursor + pageSize;
        return reply(res,200,page);
      }
      if (req.method === 'POST' && url.pathname === '/items') {
        let size=0, chunks=[];
        for await (const chunk of req) { size += chunk.length; if(size > 16384) return fail(res,400,'TOO_LARGE','Body exceeds 16 KiB'); chunks.push(chunk); }
        let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return fail(res,400,'INVALID_JSON','JSON body required'); }
        if (!body || typeof body.title !== 'string' || !body.title.trim() || [...body.title].length > 200 || Object.keys(body).some(k=>k!=='title')) return fail(res,400,'INVALID_TITLE','Supply only a title of 1..200 characters');
        const item = { id:randomUUID(), title:body.title.trim(), completed:false }; items.set(item.id,item); return reply(res,201,item);
      }
      if (req.method === 'GET' && url.pathname.startsWith('/items/')) {
        const item = items.get(decodeURIComponent(url.pathname.slice(7)));
        return item ? reply(res,200,item) : fail(res,404,'NOT_FOUND','Item not found');
      }
      return fail(res,404,'NOT_FOUND','Route not found');
    } catch { if(!res.headersSent) fail(res,400,'INVALID_REQUEST','Request could not be processed'); else res.end(); }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port=Number(process.env.PORT ?? 4317);
  inventoryServer().listen(port,'127.0.0.1',()=>process.stdout.write(`Local fixture: http://127.0.0.1:${port}\n`));
}
