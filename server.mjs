import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
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

createServer(async (request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end('Bad Request');
    return;
  }
  if (pathname === '/api/status' && request.method === 'GET') { json(response, 200, { mode: database ? 'mysql' : 'local', connected: Boolean(database) }); return; }
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
  const pageRoute = /^\/(?:canteens\/[^/]+|shops\/[^/]+(?:\/dishes\/[^/]+)?|posts(?:\/[^/]+)?|directory(?:\/[^/]+)?|contribute|future|rules|admin)$/.test(pathname);
  if (pathname !== '/' && !pageRoute && !/^\/(?:index\.html|src\/[a-z0-9-]+\.(?:js|css))$/.test(pathname)) { response.writeHead(404).end('Not Found'); return; }
  const file = resolve(root, `.${pathname === '/' || pageRoute ? '/index.html' : pathname}`);
  if (file !== root && !file.startsWith(root + sep)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, { 'Content-Type': `${types[extname(file)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-store' });
    response.end(body);
  } catch {
    response.writeHead(404).end('Not Found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`MVP preview: http://127.0.0.1:${port}`);
});
