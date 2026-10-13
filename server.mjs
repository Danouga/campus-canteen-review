import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { connectDatabase } from './db.mjs';
import { createAppServer } from './server-core.mjs';
const root = resolve(import.meta.dirname);
let localConfig = {};
try {
  const file = await readFile(resolve(root, '.env.local'), 'utf8');
  for (const line of file.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (match) localConfig[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const config = { ...localConfig, ...process.env };
const port = Number(config.PORT || 4173);
// 默认启用 JSON 文件存储；仅当显式设置 DB_MODE=none 时退回纯静态演示（无持久化）。
const database = config.DB_MODE === 'none' ? null : await connectDatabase(config);

const server = createAppServer({database, config});
server.on('error', async (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`端口 ${port} 已被占用。请先停止原服务，或设置其他 PORT 后重试。`);
  } else console.error(error);
  process.exitCode = 1;
  await database?.close();
});
server.listen(port, '0.0.0.0', () => {
  console.log(`MVP preview: http://0.0.0.0:${port}`);
});
