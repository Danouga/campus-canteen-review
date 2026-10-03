import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import readline from 'node:readline';
import mysql from 'mysql2/promise';

const [host, portText, user = 'root', database = 'canteen_guide_mvp'] = process.argv.slice(2);
if (!host || !Number.isInteger(Number(portText)) || !/^[a-zA-Z0-9_]+$/.test(database)) {
  throw new Error('用法：node scripts/migrate-mysql.mjs <远端主机> <端口> [用户] [数据库名]');
}

const config = Object.fromEntries((await readFile('.env.local', 'utf8')).split(/\r?\n/)
  .map((line) => line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/))
  .filter(Boolean).map((match) => [match[1], match[2].replace(/^['"]|['"]$/g, '')]));
async function readPassword() {
  if (!process.stdin.isTTY) throw new Error('请在交互式终端运行迁移脚本，以免密码出现在命令行参数中。');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdout.write('远端数据库密码（输入不回显）：');
  return new Promise((resolve) => {
    let password = '';
    const receive = (chunk) => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\r' || character === '\n') {
          process.stdin.off('data', receive);
          process.stdin.setRawMode(false);
          process.stdout.write('\n');
          resolve(password);
          return;
        }
        if (character === '\u0008' || character === '\u007f') password = password.slice(0, -1);
        else if (character !== '\u0003') password += character;
      }
    };
    process.stdin.on('data', receive);
  });
}
const remotePassword = await readPassword();
const input = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (prompt) => new Promise((resolve) => input.question(prompt, resolve));
let source;
let target;
try {
  source = await mysql.createConnection({ host: config.DB_HOST || '127.0.0.1', port: Number(config.DB_PORT || 3306), user: config.DB_USER || 'root', password: config.DB_PASSWORD || '', database: config.DB_NAME || 'canteen_guide_mvp', charset: 'utf8mb4' });
  target = await mysql.createConnection({ host, port: Number(portText), user, password: remotePassword, charset: 'utf8mb4', connectTimeout: 15000, multipleStatements: false });
  const [sourceRows] = await source.query('SELECT revision, payload FROM app_state WHERE id = 1');
  if (sourceRows.length !== 1) throw new Error('本地 app_state 缺少数据行。');
  const sourceRow = sourceRows[0];
  const digest = (payload) => createHash('sha256').update(payload).digest('hex');
  const summary = (payload) => {
    const state = JSON.parse(payload);
    return Object.fromEntries(['campuses', 'canteens', 'shops', 'contributions', 'comments', 'posts', 'reactions'].map((key) => [key, state[key]?.length || 0]));
  };
  const [schemas] = await target.execute('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [database]);
  let targetRow = null;
  if (schemas.length) {
    const [tables] = await target.execute('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [database, 'app_state']);
    if (tables.length) {
      const [rows] = await target.query(`SELECT revision, payload FROM \`${database}\`.app_state WHERE id = 1`);
      targetRow = rows[0] || null;
    }
  }
  console.log(JSON.stringify({ source: { revision: String(sourceRow.revision), bytes: Buffer.byteLength(sourceRow.payload), sha256: digest(sourceRow.payload), counts: summary(sourceRow.payload) }, target: targetRow ? { revision: String(targetRow.revision), bytes: Buffer.byteLength(targetRow.payload), sha256: digest(targetRow.payload), counts: summary(targetRow.payload) } : null, targetDatabaseExists: schemas.length > 0 }, null, 2));
  if (targetRow && digest(targetRow.payload) === digest(sourceRow.payload)) {
    console.log('远端与本地内容一致，无需迁移。');
    process.exitCode = 0;
  } else if ((await ask('输入 MIGRATE 开始迁移：')).trim() === 'MIGRATE') {
    if (!schemas.length) await target.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await target.query(`CREATE TABLE IF NOT EXISTS \`${database}\`.app_state (id TINYINT UNSIGNED PRIMARY KEY, revision BIGINT UNSIGNED NOT NULL DEFAULT 0, payload LONGTEXT NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB`);
    if (targetRow) await target.query(`CREATE TABLE IF NOT EXISTS \`${database}\`.app_state_migration_backup (backup_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, source_revision BIGINT UNSIGNED NOT NULL, payload LONGTEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB`);
    const [latestRows] = await source.query('SELECT revision, payload FROM app_state WHERE id = 1');
    const latest = latestRows[0];
    await target.beginTransaction();
    try {
      const [existingRows] = await target.query(`SELECT revision, payload FROM \`${database}\`.app_state WHERE id = 1 FOR UPDATE`);
      if (existingRows[0] && digest(existingRows[0].payload) !== digest(latest.payload)) {
        await target.execute(`INSERT INTO \`${database}\`.app_state_migration_backup (source_revision, payload) VALUES (?, ?)`, [existingRows[0].revision, existingRows[0].payload]);
      }
      await target.execute(`INSERT INTO \`${database}\`.app_state (id, revision, payload) VALUES (1, ?, ?) ON DUPLICATE KEY UPDATE revision = VALUES(revision), payload = VALUES(payload)`, [latest.revision, latest.payload]);
      const [verifyRows] = await target.query(`SELECT revision, payload FROM \`${database}\`.app_state WHERE id = 1`);
      if (digest(verifyRows[0].payload) !== digest(latest.payload)) throw new Error('远端校验失败，已回滚。');
      await target.commit();
      console.log(JSON.stringify({ migrated: true, revision: String(verifyRows[0].revision), sha256: digest(verifyRows[0].payload), counts: summary(verifyRows[0].payload), backupCreated: Boolean(existingRows[0] && digest(existingRows[0].payload) !== digest(latest.payload)) }, null, 2));
    } catch (error) { await target.rollback(); throw error; }
  } else {
    console.log('未执行迁移。');
  }
} finally {
  input.close();
  await Promise.allSettled([source?.end(), target?.end()].filter(Boolean));
}
