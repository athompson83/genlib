// SPDX-License-Identifier: Apache-2.0
import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

/** Deliberately local-only fixture. In-memory data is reset on process restart. */
export function inventoryServer({ token = 'genlib-fixture-token', pageSize = 2 } = {}) {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error('Fixture page size must be 1–100.');
  const items = new Map(), uploads = new Map();
  const reply = (res, status, value, headers = {}) => { res.writeHead(status, { 'content-type':'application/json', 'cache-control':'no-store', ...headers }); res.end(JSON.stringify(value)); };
  const fail = (res,status,code,message) => reply(res,status,{code,message});
  const cached = (req, res, value) => {
    const bytes = JSON.stringify(value), tag = '"' + createHash('sha256').update(bytes).digest('hex') + '"';
    const headers = { etag: tag, 'cache-control': 'private, max-age=0, must-revalidate', vary: 'Authorization' };
    const matches = String(req.headers['if-none-match'] ?? '').split(',').map(value => value.trim().replace(/^W\//u, '')).some(value => value === '*' || value === tag);
    if (matches) { res.writeHead(304, headers); res.end(); }
    else reply(res, 200, value, headers);
  };
  const readBody = async (req, limit) => {
    let size = 0; const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) { const error = new Error('Body byte limit exceeded'); error.code = 'BODY_TOO_LARGE'; throw error; }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  };
  const uploadView = upload => ({ id: upload.id, filename: upload.filename, length: upload.length, offset: upload.offset, completed: upload.completed,
    ...(upload.sha256 ? { sha256: upload.sha256 } : {}) });
  return createServer({ maxHeaderSize: 16_384, requestTimeout: 10_000, headersTimeout: 5_000 }, async (req,res) => {
    try {
      // Authentication always precedes conditional-cache or upload-state handling.
      if (req.headers.authorization !== 'Bearer '+token) return fail(res,401,'UNAUTHORIZED','Fixture token required');
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/uploads') {
        if (req.method !== 'POST') { res.setHeader('allow', 'POST'); return fail(res,405,'METHOD_NOT_ALLOWED','Use POST'); }
        const body = JSON.parse((await readBody(req, 16_384)).toString('utf8'));
        if (!body || typeof body.filename !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/u.test(body.filename) ||
            !Number.isSafeInteger(body.length) || body.length < 0 || body.length > 1_048_576 || Object.keys(body).some(key => !['filename', 'length'].includes(key))) {
          return fail(res,400,'INVALID_UPLOAD','Supply a flat filename and length from 0 to 1048576 bytes');
        }
        if (uploads.size >= 128) return fail(res,409,'UPLOAD_CAPACITY','Fixture upload capacity reached');
        const upload = { id: randomUUID(), filename: body.filename, length: body.length, offset: 0, completed: false, chunks: [] };
        uploads.set(upload.id, upload);
        return reply(res,201,uploadView(upload), { location: '/uploads/' + upload.id, 'upload-offset': '0' });
      }
      const uploadPath = /^\/uploads\/([^/]+)(\/complete)?$/u.exec(url.pathname);
      if (uploadPath) {
        const upload = uploads.get(decodeURIComponent(uploadPath[1]));
        if (!upload) return fail(res,404,'NOT_FOUND','Upload not found');
        if (uploadPath[2]) {
          if (req.method !== 'POST') { res.setHeader('allow', 'POST'); return fail(res,405,'METHOD_NOT_ALLOWED','Use POST'); }
          if (upload.offset !== upload.length) return fail(res,409,'INCOMPLETE_UPLOAD','Upload is not complete');
          if (!upload.completed) {
            const hash = createHash('sha256'); for (const chunk of upload.chunks) hash.update(chunk);
            upload.sha256 = hash.digest('hex'); upload.completed = true; upload.chunks = [];
          }
          // Repeated completion returns the same record and digest without creating another object.
          return reply(res,200,uploadView(upload));
        }
        if (req.method === 'HEAD') { res.writeHead(200, { 'upload-offset': String(upload.offset), 'upload-length': String(upload.length), 'cache-control': 'no-store' }); res.end(); return; }
        if (req.method === 'GET') return reply(res,200,uploadView(upload));
        if (req.method !== 'PATCH') { res.setHeader('allow', 'GET, HEAD, PATCH'); return fail(res,405,'METHOD_NOT_ALLOWED','Use GET, HEAD or PATCH'); }
        if (req.headers['content-type'] !== 'application/octet-stream') return fail(res,415,'INVALID_CONTENT_TYPE','Use application/octet-stream');
        const offset = String(req.headers['upload-offset'] ?? '');
        if (!/^\d+$/u.test(offset) || !Number.isSafeInteger(Number(offset))) return fail(res,400,'INVALID_OFFSET','Supply the current integer Upload-Offset');
        const bytes = await readBody(req, 65_536);
        // Recheck after reading: a competing chunk/completion may have advanced the resource.
        if (upload.completed || upload.offset !== Number(offset)) return fail(res,409,'OFFSET_CONFLICT','Reload upload status before resuming');
        if (!bytes.length) return fail(res,400,'INVALID_CHUNK','Chunk must be nonempty');
        if (upload.offset + bytes.length > upload.length) return fail(res,409,'LENGTH_CONFLICT','Chunk exceeds the remaining declared upload length');
        upload.chunks.push(bytes); upload.offset += bytes.length;
        res.writeHead(204, { 'upload-offset': String(upload.offset), 'cache-control': 'no-store' }); res.end(); return;
      }
      if (url.pathname === '/items' && !['GET','POST'].includes(req.method)) { res.setHeader('allow','GET, POST'); return fail(res,405,'METHOD_NOT_ALLOWED','Use GET or POST'); }
      if (url.pathname.startsWith('/items/') && req.method !== 'GET') { res.setHeader('allow','GET'); return fail(res,405,'METHOD_NOT_ALLOWED','Use GET'); }
      if (req.method === 'GET' && url.pathname === '/items') {
        const raw = url.searchParams.get('cursor') ?? '0';
        if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) return fail(res,400,'INVALID_CURSOR','Cursor must be a non-negative safe integer');
        const cursor = Number(raw), all = [...items.values()];
        const page = { items: all.slice(cursor,cursor+pageSize) };
        if (cursor + pageSize < all.length) page.nextCursor = cursor + pageSize;
        return cached(req,res,page);
      }
      if (req.method === 'POST' && url.pathname === '/items') {
        let body; try { body = JSON.parse((await readBody(req,16_384)).toString('utf8')); } catch (error) { if (error.code === 'BODY_TOO_LARGE') throw error; return fail(res,400,'INVALID_JSON','JSON body required'); }
        if (!body || typeof body.title !== 'string' || !body.title.trim() || [...body.title].length > 200 || Object.keys(body).some(k=>k!=='title')) return fail(res,400,'INVALID_TITLE','Supply only a title of 1..200 characters');
        const item = { id:randomUUID(), title:body.title.trim(), completed:false }; items.set(item.id,item); return reply(res,201,item);
      }
      if (req.method === 'GET' && url.pathname.startsWith('/items/')) {
        const item = items.get(decodeURIComponent(url.pathname.slice(7)));
        return item ? cached(req,res,item) : fail(res,404,'NOT_FOUND','Item not found');
      }
      return fail(res,404,'NOT_FOUND','Route not found');
    } catch (error) { if(!res.headersSent) fail(res,error.code === 'BODY_TOO_LARGE' ? 413 : 400,'INVALID_REQUEST','Request could not be processed'); else res.end(); }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port=Number(process.env.PORT ?? 4317);
  inventoryServer().listen(port,'127.0.0.1',()=>process.stdout.write(`Local fixture: http://127.0.0.1:${port}\n`));
}
