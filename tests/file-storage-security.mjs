import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep, basename } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { JsonStore } from '../store.mjs';
import { connectDatabase } from '../db.mjs';
import { initialState } from '../src/repository.js';
import { createAuthService } from '../auth.mjs';
import { hashPassword } from '../passwords.mjs';
import { createAppServer } from '../server-core.mjs';

const directory = await mkdtemp(join(tmpdir(), 'canteen-security-test-'));
let server, database;
try {
  const store = new JsonStore(join(directory, 'transactions'));
  await store.load();
  await store.persist();
  await assert.rejects(store.transaction(async data => { data.revision = 42; data.users.push({ role: 'admin' }); throw new Error('callback failed'); }));
  assert.equal((await store.read(data => data.revision)), 0);
  await store.transaction(async data => { data.state = JSON.stringify(initialState()); });
  assert.equal(JSON.parse(await readFile(store.file, 'utf8')).revision, 0);
  assert.equal(store.data.users.length, 0);

  class FailingStore extends JsonStore {
    async persist(data) { if (this.failWrite) throw new Error('simulated disk full'); await super.persist(data); }
  }
  const failure = new FailingStore(join(directory, 'disk-failure'));
  await failure.load(); await failure.persist();
  const original = await readFile(failure.file, 'utf8');
  failure.failWrite = true;
  await assert.rejects(failure.transaction(async data => { data.revision = 99; }));
  assert.equal(failure.data.revision, 0);
  assert.equal(await readFile(failure.file, 'utf8'), original);
  failure.failWrite = false;
  await failure.transaction(async data => { data.revision++; });
  assert.equal(JSON.parse(await readFile(failure.file, 'utf8')).revision, 1);
  await Promise.all(Array.from({ length: 20 }, () => failure.transaction(async data => { data.revision++; })));
  assert.equal(failure.data.revision, 21);
  const reopened = new JsonStore(failure.dir); await reopened.load();
  assert.equal(reopened.data.revision, 21);

  await failure.transaction(async data => { data.users.push({ id: 'test-user', role: 'member' }); return data.users[0]; }).then(user => { user.role = 'admin'; });
  const user = await failure.read(data => data.users[0]); user.role = 'admin';
  assert.equal(failure.data.users[0].role, 'member');
  const body = Buffer.from('test-media');
  const hash = createHash('sha256').update(body).digest('hex');
  await failure.writeMediaFile(hash, body);
  assert.deepEqual(await failure.readMediaFile(hash), body);
  await assert.rejects(failure.writeMediaFile('../bad-path', body));

  // Existing corrupt files must never become fresh stores or be replaced by seeds.
  for (const [name, raw] of [['syntax', '{broken'], ['shape', '{}'], ['state', JSON.stringify({ state: 'invalid' })]]) {
    const dir = join(directory, name); await mkdir(dir);
    const file = join(dir, 'app-data.json'); await writeFile(file, raw);
    await assert.rejects(connectDatabase({ DATA_DIR: dir }));
    assert.equal(await readFile(file, 'utf8'), raw);
  }
  const readError = join(directory, 'read-error');
  await mkdir(join(readError, 'app-data.json'), { recursive: true });
  await assert.rejects(new JsonStore(readError).load());

  const dataDir = join(directory, 'http');
  const bootstrap = new JsonStore(dataDir); await bootstrap.load();
  const adminId = randomUUID();
  await bootstrap.transaction(async data => {
    data.state = JSON.stringify(initialState()); // Prevent production seed import in this test.
    data.users.push({ id: adminId, email: 'admin-test@example.com', name: '测试管理员', role: 'admin', status: 'active', password_hash: await hashPassword('TemporaryAdminPassword!') });
  });
  database = await connectDatabase({ DATA_DIR: dataDir });
  const messages = new Map();
  let time = Date.now();
  const auth = createAuthService({ store: database.authStore, config: { AUTH_CODE_SECRET: 'temporary-test-only' }, now: () => time,
    mailer: { ready: true, async sendCode(email, code) { messages.set(email, code); } } });
  const publicOrigin = 'https://shijian-canteen.app.workbuddy.host';
  server = createAppServer({ database, auth, config: { AUTH_ALLOWED_ORIGINS: publicOrigin } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, input, { origin = base, cookie = '', headers = {} } = {}) {
    return fetch(base + path, { method: input === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: cookie, ...headers }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
  }
  for (const options of [{ origin: 'https://evil.example.com' }, { origin: 'https://other.app.workbuddy.host' }, { origin: 'http://localhost:1234' }, { origin: 'https://evil.example.com', headers: { 'x-forwarded-host': 'evil.example.com' } }]) {
    assert.equal((await request('/api/action', { method: 'expireProvisional', args: [] }, options)).status, 403);
    assert.equal((await request('/api/status')).status, 200); // Rejected requests must not kill the service.
  }
  assert.equal((await request('/api/action', { method: 'expireProvisional', args: [] }, { origin: publicOrigin })).status, 200);
  const email = 'member-test@example.com';
  const sent = await (await request('/api/auth/send-code', { email, purpose: 'register' })).json();
  const credentials = { email, challengeId: sent.challengeId, code: messages.get(email), password: 'TemporaryMemberPassword!', confirmPassword: 'TemporaryMemberPassword!', role: 'admin' };
  const outcomes = await Promise.all([request('/api/auth/register', credentials), request('/api/auth/register', credentials)]);
  assert.equal(outcomes.filter(response => response.status === 200).length, 1);
  const registration = outcomes.find(response => response.status === 200);
  const result = await registration.json();
  assert.deepEqual(Object.keys(result.user).sort(), ['email', 'id', 'name', 'role']);
  assert.equal(result.user.role, 'member');
  const memberCookie = registration.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/api/action', { method: 'saveCampus', args: ['campus-a', '伪造管理员', 'demo-admin'] }, { cookie: memberCookie })).status, 403);
  assert.equal((await request('/api/export', undefined, { cookie: memberCookie })).status, 403);
  const login = await request('/api/auth/login', { email, password: credentials.password });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  time += 61_000;
  const resetCode = await (await request('/api/auth/send-code', { email, purpose: 'reset-password' })).json();
  assert.equal((await request('/api/auth/reset-password', { email, challengeId: resetCode.challengeId, code: messages.get(email), password: 'NewTemporaryPassword!', confirmPassword: 'NewTemporaryPassword!' })).status, 200);
  assert.equal((await (await request('/api/auth/me', undefined, { cookie })).json()).user, null);
  assert.equal((await request('/api/auth/login', { email, password: credentials.password })).status, 401);
  assert.equal((await request('/api/auth/login', { email, password: 'NewTemporaryPassword!' })).status, 200);
  const adminLogin = await request('/api/auth/login', { email: 'admin-test@example.com', password: 'TemporaryAdminPassword!' });
  const adminCookie = adminLogin.headers.get('set-cookie').split(';')[0];
  const exported = await request('/api/export', undefined, { cookie: adminCookie });
  assert.equal(exported.status, 200);
  assert.equal(exported.headers.get('cache-control'), 'no-store');
  assert.equal(Buffer.from(await exported.arrayBuffer()).readUInt32LE(0), 0x04034b50);
  console.log('文件存储安全：损坏文件保护、回调/写盘失败回滚、串行并发、引用隔离、持久化重载、来源拒绝后继续服务、验证码一次性消费、注册字段过滤、密码重置及管理员导出均通过。');
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  await database?.close();
  const safe = resolve(directory);
  if (safe.startsWith(resolve(tmpdir()) + sep) && basename(safe).startsWith('canteen-security-test-')) await rm(safe, { recursive: true, force: true });
}
