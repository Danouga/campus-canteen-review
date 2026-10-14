import { readFile, open, rename, mkdir, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

// 零依赖的 JSON 文件存储：把整个应用状态、媒体索引与鉴权数据落盘到单个 JSON 文件，
// 媒体二进制单独存为 data/media/<hash>。通过进程内串行锁保证并发安全，无需任何数据库。
function defaultCollections() {
  return {
    state: null,
    revision: 0,
    media: {},
    users: [],
    codes: [],
    sessions: [],
    rateLimits: []
  };
}

function validate(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Object.hasOwn(data, 'state')) throw new Error('数据文件结构无效，已停止加载；请从备份恢复。');
  if (data.state !== null) {
    if (typeof data.state !== 'string') throw new Error('业务数据必须是 JSON 字符串。');
    const state = JSON.parse(data.state);
    if (!state || !['campuses', 'canteens', 'shops'].every(key => Array.isArray(state[key]))) throw new Error('业务数据结构无效，已停止加载；请从备份恢复。');
  }
  for (const key of ['users', 'codes', 'sessions', 'rateLimits']) if (!Array.isArray(data[key])) throw new Error(`数据集合 ${key} 无效。`);
  if (!Number.isSafeInteger(data.revision) || data.revision < 0 || !data.media || typeof data.media !== 'object' || Array.isArray(data.media)) throw new Error('数据版本或媒体索引无效。');
  for (const [hash, mime] of Object.entries(data.media)) if (!/^[a-f0-9]{64}$/.test(hash) || typeof mime !== 'string') throw new Error('媒体索引条目无效。');
}

async function atomicWrite(file, body) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temporary, 'wx', 0o600);
    try { await handle.writeFile(body); await handle.sync(); }
    finally { await handle.close(); }
    await rename(temporary, file);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

export class JsonStore {
  constructor(dir) {
    this.dir = dir;
    this.file = join(dir, 'app-data.json');
    this.mediaDir = join(dir, 'media');
    this.cache = null;
    this.lock = Promise.resolve();
  }

  get data() {
    return this.cache;
  }

  async load() {
    await mkdir(this.mediaDir, { recursive: true });
    if (this.cache) return this.cache;
    let raw;
    try { raw = await readFile(this.file, 'utf8'); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.cache = defaultCollections();
      return this.cache;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Object.hasOwn(parsed, 'state')) throw new Error('数据文件结构无效，已停止加载；请从备份恢复。');
    const loaded = { ...defaultCollections(), ...parsed };
    validate(loaded);
    this.cache = loaded;
    return this.cache;
  }

  async persist(data = this.cache) {
    validate(data);
    await mkdir(this.dir, { recursive: true });
    await atomicWrite(this.file, JSON.stringify(data));
  }

  // 所有写操作串行化，避免读取到写一半的状态。
  transaction(fn) {
    const next = this.lock.then(async () => {
      const working = structuredClone(await this.load());
      const result = await fn(working, this);
      const detached = structuredClone(result);
      await this.persist(working);
      this.cache = working;
      return detached;
    });
    this.lock = next.then(() => {}, () => {});
    return next;
  }

  // 只读：同样排队，保证看到已提交状态。
  read(fn) {
    const next = this.lock.then(async () => {
      const data = await this.load();
      return structuredClone(await fn(data, this));
    });
    this.lock = next.then(() => {}, () => {});
    return next;
  }

  async writeMediaFile(hash, body) {
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('图片地址无效。');
    await mkdir(this.mediaDir, { recursive: true });
    await atomicWrite(join(this.mediaDir, hash), body);
  }

  async readMediaFile(hash) {
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('图片地址无效。');
    try {
      return await readFile(join(this.mediaDir, hash));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return null;
    }
  }
}
