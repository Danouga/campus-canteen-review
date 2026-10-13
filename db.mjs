import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { createAuthStore } from './auth-store.mjs';
import { LocalRepository, initialState } from './src/repository.js';
import { extractMedia } from './media.mjs';
import { JsonStore } from './store.mjs';

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

// 缩略图：优先用 sharp，缺失或失败时退化为原图（避免原生模块安装失败导致整站不可用）。
async function resizeImage(body, width) {
  try {
    const sharp = (await import('sharp')).default;
    return await sharp(body).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 76, effort: 4 }).toBuffer();
  } catch {
    return null;
  }
}

// 首次运行或线上持久化卷为空时，从随包发布的种子恢复迁移数据。
// 背景：托管平台可能忽略 data/ 或复用空持久化卷，导致线上读到空库；种子随代码上传，可保证数据落地。
async function maybeSeed(store, here) {
  const data = store.data;
  const pristineEmpty = (data.users?.length || 0) === 0
    && Object.keys(data.media || {}).length === 0
    && (!data.state || (() => {
      try {
        const s = JSON.parse(data.state);
        return (!s.campuses || s.campuses.length === 0) && (!s.canteens || s.canteens.length === 0);
      } catch { return true; }
    })());
  if (!pristineEmpty) return;
  let seed;
  try { seed = JSON.parse(await readFile(resolve(here, 'seed-data.json'), 'utf8')); }
  catch { return; }
  await store.transaction(async (d, s) => {
    for (const [hash, mime] of Object.entries(seed.media || {})) {
      try {
        const body = await readFile(resolve(here, 'seed-media', hash));
        await s.writeMediaFile(hash, body);
        d.media[hash] = mime;
      } catch { /* 缺失则跳过该媒体 */ }
    }
    d.state = seed.state;
    d.users = seed.users || [];
    d.revision = seed.revision || 0;
  });
  console.log(`已从种子恢复迁移数据：users=${seed.users?.length || 0}, media=${Object.keys(seed.media || {}).length}`);
}

export async function connectDatabase(config = {}) {
  const here = dirname(fileURLToPath(import.meta.url));
  const dataDir = config.DATA_DIR ? resolve(config.DATA_DIR) : resolve(here, 'data');
  const store = new JsonStore(dataDir);
  await store.load();
  await maybeSeed(store, here);
  if (store.data.state == null) {
    store.data.state = JSON.stringify(initialState());
    await store.persist();
  }

  const authStore = await createAuthStore(store);

  return {
    authStore,
    async snapshot() {
      return store.read(async (data) => {
        const storage = new MemoryStorage(data.state);
        const snapshotData = await new LocalRepository(storage).snapshot();
        const users = data.users || [];
        snapshotData.publicUserNames = Object.fromEntries(users.map((user) => [user.id, user.name]));
        return snapshotData;
      });
    },
    async media(hash, width = 0) {
      if (!/^[a-f0-9]{64}$/.test(hash)) return null;
      if (width && ![160, 320, 640].includes(width)) throw new Error('图片尺寸无效。');
      const mime = await store.read(async (data) => (data.media && data.media[hash]) || null);
      if (!mime) return null;
      const body = await store.readMediaFile(hash);
      if (!body) return null;
      if (width) {
        const resized = await resizeImage(body, width);
        if (resized) return { mime: 'image/webp', body: resized };
      }
      return { mime, body };
    },
    async action(method, args, trustedActor = null) {
      if (!allowedActions.has(method) || !Array.isArray(args) || args.length > 4) throw new Error('操作无效。');
      return store.transaction(async (data) => {
        const storage = new MemoryStorage(data.state);
        const repository = new LocalRepository(storage, trustedActor);
        const result = await repository[method](...args);
        const converted = extractMedia(storage.payload || JSON.stringify(initialState()));
        const payload = converted.payload;
        if (payload.length > 12_000_000) throw new Error('演示数据已达到容量上限，请减少图片。');
        if (payload !== data.state) {
          for (const image of converted.media) {
            await store.writeMediaFile(image.hash, image.body);
            data.media[image.hash] = image.mime;
          }
          data.state = payload;
          data.revision = (data.revision || 0) + 1;
        }
        return result ?? null;
      });
    },
    async close() {
      // JSON 文件存储无需断开连接。
    }
  };
}
