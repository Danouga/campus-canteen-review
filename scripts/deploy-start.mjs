// Only for updating the existing hosted app. Refuses to initialize an empty sandbox.
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function verifyExistingDeployment(root, environment = process.env) {
  const values = {};
  for (const name of ['.env.example', '.env.local']) {
    let text;
    try { text = await readFile(resolve(root, name), 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') continue; throw new Error('无法读取原运行配置，停止更新启动。'); }
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
      if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  }
  const config = { ...values, ...environment };
  if (config.DB_MODE === 'none' || !config.AUTH_CODE_SECRET || !config.SMTP_PASS) throw new Error('原鉴权/邮件配置缺失，停止更新启动；不会生成新配置。');
  const dataDirectory = resolve(root, config.DATA_DIR || 'data');
  try {
    const stored = JSON.parse(await readFile(resolve(dataDirectory, 'app-data.json'), 'utf8'));
    const state = JSON.parse(stored.state);
    if (!Array.isArray(stored.users) || !stored.users.some(user => user.role === 'admin') || !['campuses', 'canteens', 'shops'].every(key => Array.isArray(state[key]))) throw new Error();
    for (const hash of Object.keys(stored.media || {})) {
      if (!/^[a-f0-9]{64}$/.test(hash) || !(await stat(resolve(dataDirectory, 'media', hash))).isFile()) throw new Error();
    }
  } catch { throw new Error('原数据或媒体缺失/损坏，停止更新启动；不会初始化或恢复种子数据。'); }
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(import.meta.dirname, '..');
  try {
    await verifyExistingDeployment(root);
    console.log('原配置和持久化数据检查通过，启动更新版本。');
    await import(pathToFileURL(resolve(root, 'server.mjs')).href);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
