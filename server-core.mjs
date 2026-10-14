import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createAuthService, AuthError } from './auth.mjs';
import { bindActor, visibleState } from './access.mjs';
import { buildZip } from './zip.mjs';
const root = resolve(import.meta.dirname);
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

// Proxy deployments must configure the site's exact public origin.
// Forwarded headers and other tenants' hosted domains are not authorization.
function assertSameOrigin(request, config) {
  const origin = request.headers.origin;
  if (!origin) return;
  let originUrl;
  try { originUrl = new URL(origin); } catch { throw new AuthError('来源无效。', 403); }
  if (!['http:', 'https:'].includes(originUrl.protocol) || originUrl.origin !== origin) throw new AuthError('来源无效。', 403);
  const allowed = String(config.AUTH_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (allowed.length && allowed.includes(origin)) return;
  const directProtocol = request.socket.encrypted ? 'https:' : 'http:';
  if (origin === `${directProtocol}//${request.headers.host}`) return;
  throw new AuthError('来源无效。', 403);
}

async function bodyJson(request, limit = 7_000_000) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (Buffer.byteLength(raw) > limit) throw new Error('请求内容过大。');
  }
  return JSON.parse(raw);
}


export function createAppServer({ database = null, config = {}, auth = database ? createAuthService({store: database.authStore, config}) : null } = {}) {
return createServer(async (request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end('Bad Request');
    return;
  }
  if (pathname.startsWith('/api/auth/')) {
    if (!auth) { json(response, 404, { error: '当前为本地演示模式。' }); return; }
    try {
      if (pathname === '/api/auth/me' && request.method === 'GET') { json(response, 200, { user: await auth.user(request), mailReady: auth.ready }); return; }
      if (request.method !== 'POST') throw new AuthError('请求方式无效。', 405);
      assertSameOrigin(request, config);
      if (!request.headers['content-type']?.startsWith('application/json')) throw new AuthError('请求格式无效。', 415);
      const input = await bodyJson(request, 4096);
      const ip = request.socket.remoteAddress || 'unknown';
      if (pathname === '/api/auth/send-code') { json(response, 200, await auth.send(input, ip, await auth.user(request))); return; }
      if (pathname === '/api/auth/login') { const result = await auth.login(input, ip); response.setHeader('Set-Cookie', result.cookie); json(response, 200, { user: result.user }); return; }
      const purpose = { '/api/auth/register': 'register', '/api/auth/reset-password': 'reset-password', '/api/auth/change-password': 'change-password' }[pathname];
      if (purpose) { const result = await auth.complete(input, ip, purpose, await auth.user(request)); response.setHeader('Set-Cookie', result.cookie); json(response, 200, result.user ? { user: result.user } : { success: true }); return; }
      if (pathname === '/api/auth/logout') { response.setHeader('Set-Cookie', await auth.logout(request)); json(response, 200, { success: true }); return; }
      throw new AuthError('接口不存在。', 404);
    } catch (error) { if (error.retryAfter) response.setHeader('Retry-After', error.retryAfter); json(response, error.status || 503, { error: error instanceof AuthError ? error.message : '登录服务暂时不可用。', retryAfter: error.retryAfter || 0 }); }
    return;
  }
  if (pathname === '/api/status' && request.method === 'GET') { json(response, 200, { mode: database ? 'file' : 'local', connected: Boolean(database) }); return; }
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
    try { json(response, 200, { data: visibleState(await database.snapshot(), await auth.user(request)) }); }
    catch { json(response, 503, { error: '数据库暂时不可用。' }); }
    return;
  }
  if (pathname === '/api/export' && request.method === 'GET') {
    if (!database) { json(response, 404, { error: '当前为本地演示模式，无服务器端数据。' }); return; }
    try {
      const user = await auth.user(request);
      if (!user || user.role !== 'admin') { json(response, 403, { error: '只有管理员可以导出数据。' }); return; }
      const { snapshot, mediaFiles } = await database.exportAll();
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const entries = [{ name: 'app-data.json', body: Buffer.from(JSON.stringify(snapshot, null, 2), 'utf8') }];
      for (const file of mediaFiles) entries.push({ name: `media/${file.hash}`, body: file.body });
      const zip = buildZip(entries);
      const filename = `canteen-export-${stamp}.zip`;
      response.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Content-Length': zip.length,
        'Cache-Control': 'no-store'
      });
      response.end(zip);
    } catch {
      json(response, 500, { error: '导出失败，请稍后重试。' });
    }
    return;
  }
  if (pathname === '/api/action' && request.method === 'POST') {
    if (!database) { json(response, 404, { error: '未启用数据库。' }); return; }
    try {
      assertSameOrigin(request, config);
      if (!request.headers['content-type']?.startsWith('application/json')) { json(response, 415, { error: '请求格式无效。' }); return; }
      const input = await bodyJson(request);
      const user = await auth.user(request);
      const args = bindActor(input.method, input.args, user);
      json(response, 200, { result: await database.action(input.method, args, user) });
    } catch (error) {
      const validation = !('code' in error);
      json(response, error.status || (validation ? 400 : 503), { error: validation ? error.message : '数据库操作失败。' });
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

}
