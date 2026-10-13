import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createAuthService, AuthError } from './auth.mjs';
import { bindActor, visibleState } from './access.mjs';
const root = resolve(import.meta.dirname);
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
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
      const origin = request.headers.origin;
      const expected = `${config.AUTH_COOKIE_SECURE === 'true' ? 'https' : 'http'}://${request.headers.host}`;
      if (origin && origin !== expected) throw new AuthError('来源无效。', 403);
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
  if (pathname === '/api/action' && request.method === 'POST') {
    if (!database) { json(response, 404, { error: '未启用数据库。' }); return; }
    const origin = request.headers.origin;
    if (origin && origin !== `${config.AUTH_COOKIE_SECURE === 'true' ? 'https' : 'http'}://${request.headers.host}`) { json(response, 403, { error: '来源无效。' }); return; }
    if (!request.headers['content-type']?.startsWith('application/json')) { json(response, 415, { error: '请求格式无效。' }); return; }
    try {
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
