import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { connectDatabase } from './db.mjs';

const root = resolve(import.meta.dirname);
let localConfig = {};
try {
  const file = await readFile(resolve(root, '.env.local'), 'utf8');
  for (const line of file.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (match) localConfig[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const config = { ...localConfig, ...process.env };
const port = Number(config.PORT || 4173);
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
const database = config.DB_MODE === 'mysql' ? await connectDatabase(config) : null;

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

async function bodyJson(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 7_000_000) throw new Error('请求内容过大。');
  }
  return JSON.parse(raw);
}

const server = createServer(async (request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end('Bad Request');
    return;
  }
  if (pathname === '/api/status' && request.method === 'GET') { json(response, 200, { mode: database ? 'mysql' : 'local', connected: Boolean(database) }); return; }
  if (/^\/api\/media\/[a-f0-9]{64}$/.test(pathname) && request.method === 'GET') {
    if (!database) { response.writeHead(404).end('Not Found'); return; }
    try {
      const widthText = new URL(request.url, 'http://localhost').searchParams.get('w');
      const width = widthText === null ? 0 : Number(widthText);
      if (widthText !== null && ![160, 320, 640].includes(width)) { response.writeHead(400).end('Invalid image width'); return; }
      const media = await database.media(pathname.slice('/api/media/'.length), width);
      if (!media) { response.writeHead(404).end('Not Found'); return; }
      response.writeHead(200, { 'Content-Type': media.mime, 'Content-Length': media.body.length, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
      response.end(media.body);
    } catch { response.writeHead(503).end('Media temporarily unavailable'); }
    return;
  }
  if (pathname === '/api/state' && request.method === 'GET') {
    if (!database) { json(response, 404, { error: '未启用数据库。' }); return; }
    try { json(response, 200, { data: await database.snapshot() }); }
    catch { json(response, 503, { error: '数据库暂时不可用。' }); }
    return;
  }
  if (pathname === '/api/action' && request.method === 'POST') {
    if (!database) { json(response, 404, { error: '未启用数据库。' }); return; }
    const origin = request.headers.origin;
    if (origin && origin !== `http://127.0.0.1:${port}`) { json(response, 403, { error: '来源无效。' }); return; }
    if (!request.headers['content-type']?.startsWith('application/json')) { json(response, 415, { error: '请求格式无效。' }); return; }
    try {
      const input = await bodyJson(request);
      json(response, 200, { result: await database.action(input.method, input.args) });
    } catch (error) {
      const validation = !('code' in error);
      json(response, validation ? 400 : 503, { error: validation ? error.message : '数据库操作失败。' });
    }
    return;
  }
  if (request.method !== 'GET') { response.writeHead(405).end('Method Not Allowed'); return; }
  const pageRoute = /^\/(?:canteens\/[^/]+|shops\/[^/]+(?:\/dishes\/[^/]+|\/posts)?|posts(?:\/[^/]+)?|directory(?:\/[^/]+)?|ranking|contribute|future|rules|admin)$/.test(pathname);
  if (pathname !== '/' && !pageRoute && !/^\/(?:index\.html|src\/[a-z0-9-]+\.(?:js|css))$/.test(pathname)) { response.writeHead(404).end('Not Found'); return; }
  const file = resolve(root, `.${pathname === '/' || pageRoute ? '/index.html' : pathname}`);
  if (file !== root && !file.startsWith(root + sep)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const info = await stat(file);
    const etag = `W/"${info.size.toString(16)}-${Math.trunc(info.mtimeMs).toString(16)}"`;
    if (request.headers['if-none-match'] === etag) { response.writeHead(304, { ETag: etag, 'Cache-Control': 'no-cache' }).end(); return; }
    const body = await readFile(file);
    response.writeHead(200, { 'Content-Type': `${types[extname(file)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-cache', ETag: etag });
    response.end(body);
  } catch {
    response.writeHead(404).end('Not Found');
  }
});
server.on('error', async (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`端口 ${port} 已被占用。请先停止原服务，或设置其他 PORT 后重试。`);
  } else console.error(error);
  process.exitCode = 1;
  await database?.close();
});
server.listen(port, '127.0.0.1', () => {
  console.log(`MVP preview: http://127.0.0.1:${port}`);
});
