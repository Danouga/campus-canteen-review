import { randomUUID, timingSafeEqual } from 'node:crypto';

// 用 JSON 文件存储实现原先 MySQL 的鉴权数据层。集合 users / codes / sessions / rateLimits
// 都放在 JsonStore 的缓存对象中，随 app-data.json 一起原子落盘。

const ms = (value) => new Date(value).getTime();

export async function createAuthStore(store) {
  // 确保集合存在（直接操作缓存对象，下一次事务会一并持久化）。
  await store.load();
  const data = store.data;
  data.users ||= [];
  data.codes ||= [];
  data.sessions ||= [];
  data.rateLimits ||= [];

  return {
    async rateLimit(key, limit, windowMs, now) {
      return store.transaction(async (data) => {
        data.rateLimits ||= [];
        let row = data.rateLimits.find((entry) => entry.bucket_key === key);
        if (!row) {
          row = { bucket_key: key, window_end: new Date(now + windowMs).toISOString(), hits: 0 };
          data.rateLimits.push(row);
        }
        const expired = ms(row.window_end) <= now;
        const hits = expired ? 0 : row.hits;
        const end = expired ? now + windowMs : ms(row.window_end);
        if (hits >= limit) return { allowed: false, retryAfter: Math.max(1, Math.ceil((end - now) / 1000)) };
        row.hits = hits + 1;
        row.window_end = new Date(end).toISOString();
        return { allowed: true };
      });
    },
    async reserveCode(email, record, now) {
      return store.transaction(async (data) => {
        data.codes ||= [];
        let row = data.codes.find((entry) => entry.email === email);
        if (!row) {
          row = {
            email, challenge_id: record.id, code_hash: record.hash,
            expires_at: new Date(now).toISOString(), resend_after: new Date(now).toISOString(),
            attempts: 0, consumed_at: null, delivery_state: 'failed',
            window_started: new Date(now).toISOString(), send_count: 0, purpose: 'legacy'
          };
          data.codes.push(row);
        }
        if (ms(row.resend_after) > now) return { allowed: false, retryAfter: Math.ceil((ms(row.resend_after) - now) / 1000) };
        const reset = now - ms(row.window_started) >= 3_600_000;
        const count = reset ? 0 : row.send_count;
        if (count >= 5) return { allowed: false, retryAfter: Math.max(1, Math.ceil((ms(row.window_started) + 3_600_000 - now) / 1000)) };
        row.challenge_id = record.id;
        row.code_hash = record.hash;
        row.expires_at = new Date(now + 600_000).toISOString();
        row.resend_after = new Date(now + 60_000).toISOString();
        row.attempts = 0;
        row.consumed_at = null;
        row.delivery_state = 'queued';
        row.purpose = record.purpose;
        row.window_started = new Date(reset ? now : ms(row.window_started)).toISOString();
        row.send_count = count + 1;
        return { allowed: true };
      });
    },
    async setDelivery(id, sent) {
      await store.transaction(async (data) => {
        data.codes ||= [];
        const row = data.codes.find((entry) => entry.challenge_id === id);
        if (row) row.delivery_state = sent ? 'sent' : 'failed';
      });
    },
    async completeCode(input, now) {
      return store.transaction(async (data) => {
        data.users ||= [];
        data.codes ||= [];
        data.sessions ||= [];
        const code = data.codes.find((entry) => entry.email === input.email);
        if (!code || code.challenge_id !== input.challengeId || code.purpose !== input.purpose
          || code.delivery_state !== 'sent' || code.consumed_at || ms(code.expires_at) <= now || code.attempts >= 5) return null;
        if (!timingSafeEqual(Buffer.from(code.code_hash, 'hex'), Buffer.from(input.codeHash, 'hex'))) {
          code.attempts += 1;
          return null;
        }
        const existing = data.users.find((entry) => entry.email === input.email);
        code.consumed_at = new Date(now).toISOString();
        if (input.purpose === 'register') {
          if (existing) return null;
          const user = {
            id: randomUUID(), email: input.email, name: input.name, role: 'member', status: 'active',
            verified_at: new Date(now).toISOString(), created_at: new Date(now).toISOString(),
            password_hash: input.passwordHash, password_updated_at: new Date(now).toISOString()
          };
          data.users.push(user);
          data.sessions.push({
            token_hash: input.sessionHash, user_id: user.id,
            expires_at: new Date(input.sessionExpires).toISOString(), created_at: new Date(now).toISOString()
          });
          return user;
        }
        if (!existing || existing.status !== 'active' || (input.purpose === 'change-password' && input.actorId !== existing.id)) return null;
        existing.password_hash = input.passwordHash;
        existing.password_updated_at = new Date(now).toISOString();
        data.sessions = data.sessions.filter((entry) => entry.user_id !== existing.id);
        return { id: existing.id, email: existing.email, name: existing.name, role: existing.role };
      });
    },
    async passwordAccount(email) {
      return store.read(async (data) => data.users?.find((entry) => entry.email === email) || null);
    },
    async passwordSession(input, now) {
      return store.transaction(async (data) => {
        data.users ||= [];
        data.sessions ||= [];
        const user = data.users.find((entry) => entry.id === input.userId);
        if (!user || user.status !== 'active' || user.password_hash !== input.passwordHash) return null;
        data.sessions.push({
          token_hash: input.sessionHash, user_id: user.id,
          expires_at: new Date(input.sessionExpires).toISOString(), created_at: new Date(now).toISOString()
        });
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      });
    },
    async session(hash, now) {
      return store.read(async (data) => {
        const session = (data.sessions || []).find((entry) => entry.token_hash === hash && ms(entry.expires_at) > now);
        if (!session) return null;
        const user = (data.users || []).find((entry) => entry.id === session.user_id && entry.status === 'active');
        if (!user) return null;
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      });
    },
    async deleteSession(hash) {
      await store.transaction(async (data) => {
        data.sessions = (data.sessions || []).filter((entry) => entry.token_hash !== hash);
      });
    },
    async cleanup(now) {
      await store.transaction(async (data) => {
        data.sessions = (data.sessions || []).filter((entry) => ms(entry.expires_at) > now);
        data.codes = (data.codes || []).filter((entry) => ms(entry.expires_at) >= now - 86_400_000);
        data.rateLimits = (data.rateLimits || []).filter((entry) => ms(entry.window_end) >= now - 86_400_000);
      });
    }
  };
}
