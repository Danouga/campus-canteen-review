import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';

const host = process.argv[2] || 'gz-cynosdbmysql-grp-m2qzs0l1.sql.tencentcdb.com';
const port = process.argv[3] || '25966';
let configuredPort = 4173;
try {
  const localConfig = await readFile(new URL('../.env.local', import.meta.url), 'utf8');
  const match = localConfig.match(/^\s*PORT\s*=\s*['"]?(\d+)['"]?\s*$/m);
  if (match) configuredPort = Number(match[1]);
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const previewPort = Number(process.env.PORT || configuredPort);
try {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(previewPort, '127.0.0.1', () => probe.close(resolve));
  });
} catch (error) {
  if (error.code !== 'EADDRINUSE') throw error;
  console.error(`端口 ${previewPort} 已被占用。请先在原服务终端按 Ctrl+C，或设置其他 PORT 后重试。`);
  process.exit(1);
}
if (!process.stdin.isTTY) throw new Error('请在交互式终端运行，避免密码出现在命令行参数中。');
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdout.write('远端数据库密码（输入不回显）：');
const password = await new Promise((resolve) => {
  let value = '';
  const receive = (chunk) => {
    for (const character of chunk.toString('utf8')) {
      if (character === '\r' || character === '\n') {
        process.stdin.off('data', receive);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdout.write('\n');
        resolve(value);
        return;
      }
      if (character === '\u0008' || character === '\u007f') value = value.slice(0, -1);
      else if (character !== '\u0003') value += character;
    }
  };
  process.stdin.on('data', receive);
});
Object.assign(process.env, { DB_MODE: 'mysql', DB_HOST: host, DB_PORT: port, DB_USER: 'root', DB_PASSWORD: password, DB_NAME: 'canteen_guide_mvp' });
await import('../server.mjs');
