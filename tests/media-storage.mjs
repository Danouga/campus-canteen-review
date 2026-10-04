import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import sharp from 'sharp';
import { connectDatabase } from '../db.mjs';
import { extractMedia } from '../media.mjs';
import { initialState } from '../src/repository.js';

const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=';
const extracted = extractMedia(JSON.stringify({ photo, html: `<img src="${photo}">` }));
assert.equal(extracted.media.length, 1);
assert.equal(extracted.payload.includes('data:image/'), false);
assert.equal((extracted.payload.match(/\/api\/media\//g) || []).length, 2);

const localConfig = Object.fromEntries((await readFile(new URL('../.env.local', import.meta.url), 'utf8')).split(/\r?\n/).map((line) => line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map((match) => [match[1], match[2].replace(/^['"]|['"]$/g, '')]));
const name = `canteen_guide_media_test_${randomBytes(4).toString('hex')}`;
const config = { ...localConfig, DB_HOST: '127.0.0.1', DB_PORT: '3306', DB_NAME: name };
const admin = await mysql.createConnection({ host: config.DB_HOST, port: Number(config.DB_PORT), user: config.DB_USER || 'root', password: config.DB_PASSWORD || '' });
let database;
try {
  await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4`);
  await admin.query(`CREATE TABLE \`${name}\`.app_state (id TINYINT UNSIGNED PRIMARY KEY, revision BIGINT UNSIGNED NOT NULL DEFAULT 0, payload LONGTEXT NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB`);
  const legacy = initialState();
  legacy.canteens.push({ id: 'canteen-1', campusId: 'campus-a', name: '测试食堂', status: 'active', photos: [{ id: 'photo-1', url: photo, status: 'active' }] });
  legacy.posts.push({ id: 'post-1', contentHtml: `<p><img src="${photo}"></p>`, status: 'active' });
  await admin.execute(`INSERT INTO \`${name}\`.app_state (id, payload) VALUES (1, ?)`, [JSON.stringify(legacy)]);

  database = await connectDatabase(config);
  const migrated = await database.snapshot();
  const url = migrated.canteens[0].photos[0].url;
  assert.match(url, /^\/api\/media\/[a-f0-9]{64}$/);
  assert.equal(migrated.posts[0].contentHtml.includes(url), true);
  assert.equal((await database.media(url.split('/').at(-1))).body.length, extracted.media[0].body.length);
  const [backups] = await admin.query(`SELECT COUNT(*) AS count FROM \`${name}\`.app_state_media_backup`);
  assert.equal(backups[0].count, 1);

  const anotherBody = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#72917b' } }).png().toBuffer();
  const another = `data:image/png;base64,${anotherBody.toString('base64')}`;
  await database.action('saveCanteenPhoto', [{ canteenId: 'canteen-1', photo: another, actorId: 'demo-admin' }]);
  const updated = await database.snapshot();
  assert.match(updated.canteens[0].photos[1].url, /^\/api\/media\/[a-f0-9]{64}$/);
  const newHash = updated.canteens[0].photos[1].url.split('/').at(-1);
  assert.equal((await database.media(newHash)).body.length, anotherBody.length);
  const thumbnail = await database.media(newHash, 160);
  assert.equal(thumbnail.mime, 'image/webp');
  assert.equal((await sharp(thumbnail.body).metadata()).width, 160);
  const [rows] = await admin.query(`SELECT payload FROM \`${name}\`.app_state WHERE id = 1`);
  assert.equal(rows[0].payload.includes('data:image/'), false);
  console.log('图片分离：旧数据迁移、备份、独立读取及新图片保存均通过。');
} finally {
  await database?.close();
  await admin.query(`DROP DATABASE IF EXISTS \`${name}\``);
  await admin.end();
}
