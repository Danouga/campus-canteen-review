import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { prepareDeployment } from '../scripts/prepare-deploy.mjs';
import { verifyExistingDeployment } from '../scripts/deploy-start.mjs';
import { initialState } from '../src/repository.js';

const temporaryRoot = await fs.mkdtemp(path.join(tmpdir(), 'canteen-deploy-'));
const sourceRoot = path.join(temporaryRoot, 'source');
const projectRoot = path.resolve(import.meta.dirname, '..');
try {
  await fs.mkdir(sourceRoot);
  // Fake sensitive files prove the explicit allowlist leaves them out.
  await fs.cp(path.join(projectRoot, 'src'), path.join(sourceRoot, 'src'), { recursive: true });
  await fs.mkdir(path.join(sourceRoot, 'scripts'));
  for (const name of ['index.html', 'package.json', '.env.example', 'server.mjs', 'server-core.mjs', 'db.mjs', 'store.mjs', 'auth-store.mjs', 'auth.mjs', 'passwords.mjs', 'access.mjs', 'zip.mjs', 'media.mjs', 'scripts/deploy-start.mjs']) await fs.copyFile(path.join(projectRoot, name), path.join(sourceRoot, name));
  for (const name of ['.env.local', 'private.bak', 'seed-data.json']) await fs.writeFile(path.join(sourceRoot, name), 'FAKE_LOCAL_SECRET_SENTINEL');
  await fs.mkdir(path.join(sourceRoot, 'data'));
  await fs.writeFile(path.join(sourceRoot, 'data', 'app-data.json'), 'FAKE_LOCAL_DATA_SENTINEL');
  const first = await prepareDeployment(sourceRoot);
  await fs.writeFile(path.join(first.directory, 'keep.txt'), 'prior output');
  const second = await prepareDeployment(sourceRoot);
  assert.notEqual(first.directory, second.directory);
  assert.equal(await fs.readFile(path.join(first.directory, 'keep.txt'), 'utf8'), 'prior output');
  for (const name of ['.env.local', 'private.bak', 'seed-data.json', 'data', '.npm-cache', 'tests', 'scripts/prepare-deploy.mjs']) await assert.rejects(fs.access(path.join(second.directory, name)), { code: 'ENOENT' });
  const walk = async directory => {
    const result = [];
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) result.push(...await walk(file)); else result.push(file);
    }
    return result;
  };
  for (const file of await walk(second.directory)) assert.ok(!(await fs.readFile(file, 'utf8')).includes('FAKE_LOCAL_SECRET_SENTINEL'));
  const clean = path.join(temporaryRoot, 'empty-sandbox');
  await fs.mkdir(clean);
  const config = { AUTH_CODE_SECRET: 'fake-test-only', SMTP_PASS: 'fake-test-only' };
  await assert.rejects(verifyExistingDeployment(clean, config), /原数据/);
  assert.deepEqual(await fs.readdir(clean), []);
  const sandbox = path.join(temporaryRoot, 'existing-sandbox');
  await fs.mkdir(path.join(sandbox, 'data', 'media'), { recursive: true });
  const hash = 'a'.repeat(64);
  const configText = 'AUTH_CODE_SECRET=fake-test-only\nSMTP_PASS=fake-test-only\n';
  const dataText = JSON.stringify({ state: JSON.stringify(initialState()), users: [{ id: 'test-admin', role: 'admin' }], media: { [hash]: 'image/png' } });
  await fs.writeFile(path.join(sandbox, '.env.local'), configText);
  await fs.writeFile(path.join(sandbox, 'data', 'app-data.json'), dataText);
  await fs.writeFile(path.join(sandbox, 'data', 'media', hash), 'fixture media');
  // Model overlay writes; the installed tool's tar command is checked separately.
  await fs.cp(second.directory, sandbox, { recursive: true });
  assert.equal(await fs.readFile(path.join(sandbox, '.env.local'), 'utf8'), configText);
  assert.equal(await fs.readFile(path.join(sandbox, 'data', 'app-data.json'), 'utf8'), dataText);
  assert.equal(await verifyExistingDeployment(sandbox, {}), true);
  await assert.rejects(verifyExistingDeployment(sandbox, { AUTH_CODE_SECRET: '' }), /原鉴权/);
  await fs.unlink(path.join(sandbox, 'data', 'media', hash));
  await assert.rejects(verifyExistingDeployment(sandbox, {}), /原数据或媒体/);
  await fs.writeFile(path.join(sourceRoot, '.env.example'), 'SMTP_PASS=fake-secret-must-not-be-packaged');
  await assert.rejects(prepareDeployment(sourceRoot), /非空密钥/);
  console.log('deployment-package: allowlist, no overwrite, secret exclusion, overlay data/config preservation and startup guards passed (isolated local fixtures only)');
} finally {
  const resolved = path.resolve(temporaryRoot);
  assert.equal(path.dirname(resolved), path.resolve(tmpdir()));
  assert.ok(path.basename(resolved).startsWith('canteen-deploy-'));
  await fs.rm(resolved, { recursive: true, force: true });
}
