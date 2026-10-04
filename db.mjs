import mysql from 'mysql2/promise';
import sharp from 'sharp';
import { LocalRepository, initialState } from './src/repository.js';
import { extractMedia } from './media.mjs';

const KEY = 'canteen-guide-mvp-v1';
const allowedActions = new Set([
  'submitContribution', 'reviewContribution', 'fixProvisional', 'revokeProvisional',
  'expireProvisional', 'saveCampus', 'saveCanteen', 'saveShop', 'removeEntry',
  'restoreEntry', 'saveDish', 'savePhoto', 'saveCanteenPhoto', 'removeCanteenPhoto', 'removeShopContent', 'addComment',
  'submitPost', 'setReaction', 'castRecommendationVote', 'moderateContent', 'resolveContested', 'deleteOwnContent', 'markReviewMessageRead', 'markAllReviewMessagesRead', 'resetPreview'
]);

class MemoryStorage {
  constructor(payload) { this.payload = payload; }
  getItem(key) { return key === KEY ? this.payload : null; }
  setItem(key, value) { if (key === KEY) this.payload = value; }
  removeItem(key) { if (key === KEY) this.payload = null; }
}

export async function connectDatabase(config) {
  const database = config.DB_NAME || 'canteen_guide_mvp';
  if (!/^[a-zA-Z0-9_]+$/.test(database)) throw new Error('DB_NAME 只能包含字母、数字和下划线。');
  const credentials = {
    host: config.DB_HOST || '127.0.0.1', port: Number(config.DB_PORT || 3306),
    user: config.DB_USER || 'root', password: config.DB_PASSWORD || '',
    charset: 'utf8mb4', multipleStatements: false
  };
  const setup = await mysql.createConnection(credentials);
  try { await setup.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); }
  finally { await setup.end(); }
  const pool = mysql.createPool({ ...credentials, database, connectionLimit: 5 });
  await pool.query('CREATE TABLE IF NOT EXISTS app_state (id TINYINT UNSIGNED PRIMARY KEY, revision BIGINT UNSIGNED NOT NULL DEFAULT 0, payload LONGTEXT NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB');
  await pool.query('CREATE TABLE IF NOT EXISTS app_media (hash CHAR(64) CHARACTER SET ascii PRIMARY KEY, mime VARCHAR(32) NOT NULL, body LONGBLOB NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB');
  await pool.query('CREATE TABLE IF NOT EXISTS app_state_media_backup (id TINYINT UNSIGNED PRIMARY KEY, revision BIGINT UNSIGNED NOT NULL, payload LONGTEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB');
  await pool.execute('INSERT IGNORE INTO app_state (id, payload) VALUES (1, ?)', [JSON.stringify(initialState())]);

  async function saveMedia(connection, media) {
    for (const image of media) await connection.execute('INSERT IGNORE INTO app_media (hash, mime, body) VALUES (?, ?, ?)', [image.hash, image.mime, image.body]);
  }

  // A one-time, transactional conversion. The original state is retained for recovery.
  const migration = await pool.getConnection();
  try {
    await migration.beginTransaction();
    const [rows] = await migration.query('SELECT revision, payload FROM app_state WHERE id = 1 FOR UPDATE');
    const original = rows[0];
    if (original.payload.includes('data:image/')) {
      const converted = extractMedia(original.payload);
      if (converted.media.length) {
        await migration.execute('INSERT IGNORE INTO app_state_media_backup (id, revision, payload) VALUES (1, ?, ?)', [original.revision, original.payload]);
        await saveMedia(migration, converted.media);
        await migration.execute('UPDATE app_state SET payload = ?, revision = revision + 1 WHERE id = 1', [converted.payload]);
        console.log(`已将 ${converted.media.length} 张内嵌图片移到独立存储，原始状态已备份。`);
      }
    }
    await migration.commit();
  } catch (error) { await migration.rollback(); throw error; }
  finally { migration.release(); }

  const mediaCache = new Map();
  let mediaCacheBytes = 0;
  function rememberMedia(key, item) {
    if (mediaCache.has(key)) mediaCacheBytes -= mediaCache.get(key).body.length;
    mediaCache.delete(key);
    mediaCache.set(key, item);
    mediaCacheBytes += item.body.length;
    while (mediaCache.size > 64 || mediaCacheBytes > 32_000_000) {
      const oldest = mediaCache.keys().next().value;
      mediaCacheBytes -= mediaCache.get(oldest).body.length;
      mediaCache.delete(oldest);
    }
  }

  return {
    async snapshot() {
      const [rows] = await pool.query('SELECT payload FROM app_state WHERE id = 1');
      return new LocalRepository(new MemoryStorage(rows[0].payload)).snapshot();
    },
    async media(hash, width = 0) {
      if (!/^[a-f0-9]{64}$/.test(hash)) return null;
      if (width && ![160, 320, 640].includes(width)) throw new Error('图片尺寸无效。');
      const key = `${hash}:${width}`;
      if (mediaCache.has(key)) { const item = mediaCache.get(key); rememberMedia(key, item); return item; }
      let original = mediaCache.get(`${hash}:0`);
      if (!original) {
        const [rows] = await pool.execute('SELECT mime, body FROM app_media WHERE hash = ?', [hash]);
        if (!rows.length) return null;
        original = { mime: rows[0].mime, body: rows[0].body };
        rememberMedia(`${hash}:0`, original);
      }
      const item = width ? { mime: 'image/webp', body: await sharp(original.body).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 76, effort: 4 }).toBuffer() } : original;
      rememberMedia(key, item);
      return item;
    },
    async action(method, args) {
      if (!allowedActions.has(method) || !Array.isArray(args) || args.length > 4) throw new Error('操作无效。');
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.query('SELECT payload FROM app_state WHERE id = 1 FOR UPDATE');
        const storage = new MemoryStorage(rows[0].payload);
        const repository = new LocalRepository(storage);
        const result = await repository[method](...args);
        const converted = extractMedia(storage.payload || JSON.stringify(initialState()));
        const payload = converted.payload;
        if (payload.length > 12_000_000) throw new Error('演示数据已达到容量上限，请减少图片。');
        if (payload !== rows[0].payload) {
          await saveMedia(connection, converted.media);
          await connection.execute('UPDATE app_state SET payload = ?, revision = revision + 1 WHERE id = 1', [payload]);
        }
        await connection.commit();
        return result ?? null;
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
    async close() { await pool.end(); }
  };
}
