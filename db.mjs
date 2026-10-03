import mysql from 'mysql2/promise';
import { LocalRepository, initialState } from './src/repository.js';

const KEY = 'canteen-guide-mvp-v1';
const allowedActions = new Set([
  'submitContribution', 'reviewContribution', 'fixProvisional', 'revokeProvisional',
  'expireProvisional', 'saveCampus', 'saveCanteen', 'saveShop', 'removeEntry',
  'restoreEntry', 'saveDish', 'savePhoto', 'saveCanteenPhoto', 'removeCanteenPhoto', 'removeShopContent', 'addComment',
  'submitPost', 'setReaction', 'moderateContent', 'resolveContested', 'deleteOwnContent', 'markReviewMessageRead', 'resetPreview'
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
  await pool.execute('INSERT IGNORE INTO app_state (id, payload) VALUES (1, ?)', [JSON.stringify(initialState())]);

  return {
    async snapshot() {
      const [rows] = await pool.query('SELECT payload FROM app_state WHERE id = 1');
      return new LocalRepository(new MemoryStorage(rows[0].payload)).snapshot();
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
        const payload = storage.payload || JSON.stringify(initialState());
        if (payload.length > 12_000_000) throw new Error('演示数据已达到容量上限，请减少图片。');
        await connection.execute('UPDATE app_state SET payload = ?, revision = revision + 1 WHERE id = 1', [payload]);
        await connection.commit();
        return result ?? null;
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
    async close() { await pool.end(); }
  };
}
