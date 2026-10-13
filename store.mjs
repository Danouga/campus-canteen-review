import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
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
    try {
      const raw = await readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      this.cache = { ...defaultCollections(), ...parsed };
    } catch {
      this.cache = defaultCollections();
    }
    return this.cache;
  }

  async persist() {
    await mkdir(this.dir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify(this.cache), 'utf8');
    await rename(tmp, this.file);
  }

  // 所有写操作串行化，避免读取到写一半的状态。
  transaction(fn) {
    const next = this.lock.then(async () => {
      const data = await this.load();
      const result = await fn(data, this);
      await this.persist();
      return result;
    });
    this.lock = next.then(() => {}, () => {});
    return next;
  }

  // 只读：同样排队，保证看到已提交状态。
  read(fn) {
    const next = this.lock.then(async () => {
      const data = await this.load();
      return fn(data, this);
    });
    this.lock = next.then(() => {}, () => {});
    return next;
  }

  async writeMediaFile(hash, body) {
    await mkdir(this.mediaDir, { recursive: true });
    await writeFile(join(this.mediaDir, hash), body);
  }

  async readMediaFile(hash) {
    try {
      return await readFile(join(this.mediaDir, hash));
    } catch {
      return null;
    }
  }
}
