import { randomUUID, timingSafeEqual } from 'node:crypto';

export async function createAuthStore(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS auth_users (
    id CHAR(36) CHARACTER SET ascii PRIMARY KEY,
    email VARCHAR(254) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL UNIQUE,
    name VARCHAR(40) NOT NULL,
    role ENUM('member','reviewer','admin') NOT NULL DEFAULT 'member',
    status ENUM('active','blocked') NOT NULL DEFAULT 'active',
    verified_at DATETIME(3) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS auth_email_codes (
    email VARCHAR(254) CHARACTER SET ascii COLLATE ascii_general_ci PRIMARY KEY,
    challenge_id CHAR(64) CHARACTER SET ascii NOT NULL UNIQUE,
    code_hash CHAR(64) CHARACTER SET ascii NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    resend_after DATETIME(3) NOT NULL,
    attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
    consumed_at DATETIME(3) NULL,
    delivery_state ENUM('queued','sent','failed') NOT NULL,
    window_started DATETIME(3) NOT NULL,
    send_count TINYINT UNSIGNED NOT NULL DEFAULT 0
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash CHAR(64) CHARACTER SET ascii PRIMARY KEY,
    user_id CHAR(36) CHARACTER SET ascii NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX (user_id), INDEX (expires_at),
    FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS auth_rate_limits (
    bucket_key CHAR(64) CHARACTER SET ascii PRIMARY KEY,
    window_end DATETIME(3) NOT NULL,
    hits INT UNSIGNED NOT NULL DEFAULT 0,
    INDEX (window_end)
  ) ENGINE=InnoDB`);

  // Additive migrations preserve existing identities, roles and business data.
  const [userColumns] = await pool.query('SHOW COLUMNS FROM auth_users');
  if (!userColumns.some(column => column.Field === 'password_hash')) {
    try { await pool.query('ALTER TABLE auth_users ADD COLUMN password_hash VARCHAR(255) NULL'); }
    catch (error) { if (error.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  if (!userColumns.some(column => column.Field === 'password_updated_at')) {
    try { await pool.query('ALTER TABLE auth_users ADD COLUMN password_updated_at DATETIME(3) NULL'); }
    catch (error) { if (error.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  const [codeColumns] = await pool.query('SHOW COLUMNS FROM auth_email_codes');
  if (!codeColumns.some(column => column.Field === 'purpose')) {
    try { await pool.query("ALTER TABLE auth_email_codes ADD COLUMN purpose VARCHAR(24) NOT NULL DEFAULT 'legacy'"); }
    catch (error) { if (error.code !== 'ER_DUP_FIELDNAME') throw error; }
  }

  async function transaction(fn) {
    const connection = await pool.getConnection();
    try { await connection.beginTransaction(); const result = await fn(connection); await connection.commit(); return result; }
    catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  }
  const milliseconds = (value) => new Date(value).getTime();
  return {
    async rateLimit(key, limit, windowMs, now) {
      return transaction(async (connection) => {
        await connection.execute('INSERT IGNORE INTO auth_rate_limits (bucket_key, window_end) VALUES (?, ?)', [key, new Date(now + windowMs)]);
        const [[row]] = await connection.execute('SELECT * FROM auth_rate_limits WHERE bucket_key = ? FOR UPDATE', [key]);
        const expired = milliseconds(row.window_end) <= now;
        const hits = expired ? 0 : row.hits;
        const end = expired ? now + windowMs : milliseconds(row.window_end);
        if (hits >= limit) return { allowed: false, retryAfter: Math.max(1, Math.ceil((end - now) / 1000)) };
        await connection.execute('UPDATE auth_rate_limits SET hits = ?, window_end = ? WHERE bucket_key = ?', [hits + 1, new Date(end), key]);
        return { allowed: true };
      });
    },
    async reserveCode(email, record, now) {
      return transaction(async (connection) => {
        await connection.execute(`INSERT IGNORE INTO auth_email_codes
          (email, challenge_id, code_hash, expires_at, resend_after, delivery_state, window_started)
          VALUES (?, ?, ?, ?, ?, 'failed', ?)`, [email, record.id, record.hash, new Date(now), new Date(now), new Date(now)]);
        const [[row]] = await connection.execute('SELECT * FROM auth_email_codes WHERE email = ? FOR UPDATE', [email]);
        if (milliseconds(row.resend_after) > now) return { allowed: false, retryAfter: Math.ceil((milliseconds(row.resend_after) - now) / 1000) };
        const reset = now - milliseconds(row.window_started) >= 3_600_000;
        const count = reset ? 0 : row.send_count;
        if (count >= 5) return { allowed: false, retryAfter: Math.max(1, Math.ceil((milliseconds(row.window_started) + 3_600_000 - now) / 1000)) };
        await connection.execute(`UPDATE auth_email_codes SET challenge_id = ?, code_hash = ?, expires_at = ?, resend_after = ?,
          attempts = 0, consumed_at = NULL, delivery_state = 'queued', purpose = ?, window_started = ?, send_count = ? WHERE email = ?`,
        [record.id, record.hash, new Date(now + 600_000), new Date(now + 60_000), record.purpose, new Date(reset ? now : milliseconds(row.window_started)), count + 1, email]);
        return { allowed: true };
      });
    },
    async setDelivery(id, sent) {
      await pool.execute('UPDATE auth_email_codes SET delivery_state = ? WHERE challenge_id = ?', [sent ? 'sent' : 'failed', id]);
    },
    async completeCode(input, now) {
      return transaction(async (connection) => {
        const [[code]] = await connection.execute('SELECT * FROM auth_email_codes WHERE email = ? FOR UPDATE', [input.email]);
        if (!code || code.challenge_id !== input.challengeId || code.purpose !== input.purpose || code.delivery_state !== 'sent' || code.consumed_at || milliseconds(code.expires_at) <= now || code.attempts >= 5) return null;
        if (!timingSafeEqual(Buffer.from(code.code_hash, 'hex'), Buffer.from(input.codeHash, 'hex'))) {
          await connection.execute('UPDATE auth_email_codes SET attempts = attempts + 1 WHERE email = ?', [input.email]);
          return null;
        }
        const [[existing]] = await connection.execute('SELECT id, email, name, role, status FROM auth_users WHERE email = ? FOR UPDATE', [input.email]);
        await connection.execute('UPDATE auth_email_codes SET consumed_at = ? WHERE email = ?', [new Date(now), input.email]);
        if (input.purpose === 'register') {
          if (existing) return null;
          const user = { id: randomUUID(), email: input.email, name: input.name, role: 'member' };
          await connection.execute("INSERT INTO auth_users (id, email, name, role, verified_at, password_hash, password_updated_at) VALUES (?, ?, ?, 'member', ?, ?, ?)",
            [user.id, user.email, user.name, new Date(now), input.passwordHash, new Date(now)]);
          await connection.execute('INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [input.sessionHash, user.id, new Date(input.sessionExpires)]);
          return user;
        }
        if (!existing || existing.status !== 'active' || input.purpose === 'change-password' && input.actorId !== existing.id) return null;
        await connection.execute('UPDATE auth_users SET password_hash = ?, password_updated_at = ? WHERE id = ?', [input.passwordHash, new Date(now), existing.id]);
        await connection.execute('DELETE FROM auth_sessions WHERE user_id = ?', [existing.id]);
        return { id: existing.id, email: existing.email, name: existing.name, role: existing.role };
      });
    },
    async passwordAccount(email) {
      const [[user]] = await pool.execute('SELECT id, email, name, role, status, password_hash FROM auth_users WHERE email = ?', [email]);
      return user || null;
    },
    async passwordSession(input, now) {
      return transaction(async connection => {
        const [[user]] = await connection.execute('SELECT id, email, name, role, status, password_hash FROM auth_users WHERE id = ? FOR UPDATE', [input.userId]);
        // Prevent a password checked before a concurrent reset from issuing a stale session.
        if (!user || user.status !== 'active' || user.password_hash !== input.passwordHash) return null;
        await connection.execute('INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [input.sessionHash, user.id, new Date(input.sessionExpires)]);
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      });
    },
    async session(hash, now) {
      const [[user]] = await pool.execute(`SELECT u.id, u.email, u.name, u.role FROM auth_sessions s
        JOIN auth_users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'active'`, [hash, new Date(now)]);
      return user || null;
    },
    async deleteSession(hash) { await pool.execute('DELETE FROM auth_sessions WHERE token_hash = ?', [hash]); },
    async cleanup(now) {
      await pool.execute('DELETE FROM auth_sessions WHERE expires_at <= ?', [new Date(now)]);
      await pool.execute('DELETE FROM auth_email_codes WHERE expires_at < ?', [new Date(now - 86_400_000)]);
      await pool.execute('DELETE FROM auth_rate_limits WHERE window_end < ?', [new Date(now - 86_400_000)]);
    }
  };
}
