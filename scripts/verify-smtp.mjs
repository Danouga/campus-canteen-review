import { readFile } from 'node:fs/promises';
import { createMailer } from '../auth.mjs';
const local = Object.fromEntries((await readFile(new URL('../.env.local', import.meta.url), 'utf8')).split(/\r?\n/).map((line) => line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map((match) => [match[1], match[2].replace(/^['"]|['"]$/g, '')]));
try {
  await createMailer({ ...local, ...process.env }).verify();
  console.log('QQ 邮箱 SMTP 连接与授权验证通过（未发送邮件）。');
} catch (error) {
  console.error(`SMTP 验证失败：${error.code || '连接或授权错误'}。请检查本地配置和网络。`);
  process.exitCode = 1;
}
