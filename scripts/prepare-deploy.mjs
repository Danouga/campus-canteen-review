// 专用部署目录构建脚本（发布工具不读取 .gitignore，会原样上传整个目录）。
// 本脚本按白名单把“仅运行所需”的文件复制到项目外的 staging 目录，
// 显式排除：缓存(.npm-cache)、测试产物(tests)、开发脚本(scripts)、文档(docs)、
// 数据(data)、备份(*.bak)、node_modules / .git / build。
//
// 用法：node scripts/prepare-deploy.mjs
// 产物：<项目同级>/食堂评价-deploy  （在 git 仓库之外，永不进提交）
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '..');
const DEST = path.resolve(SRC, '..', '食堂评价-deploy');

// 仅复制以下运行时文件/目录（白名单，宁可少勿多）。
const FILES = [
  'index.html',
  'package.json',
  '.env.example',
  '.env.local', // 含 SMTP_PASS / AUTH_CODE_SECRET —— 运行时需要；staging 在 git 仓库之外，不会进提交
  'server.mjs', 'server-core.mjs', 'db.mjs', 'store.mjs', 'auth-store.mjs',
  'auth.mjs', 'passwords.mjs', 'access.mjs', 'zip.mjs', 'media.mjs',
  'seed-data.json',
];
const DIRS = ['src', 'seed-media'];

async function copyDir(from, to) {
  await fs.mkdir(to, { recursive: true });
  for (const entry of await fs.readdir(from, { withFileTypes: true })) {
    const f = path.join(from, entry.name);
    const t = path.join(to, entry.name);
    if (entry.isDirectory()) await copyDir(f, t);
    else await fs.copyFile(f, t);
  }
}

async function main() {
  if (existsSync(DEST)) await fs.rm(DEST, { recursive: true, force: true });
  await fs.mkdir(DEST, { recursive: true });

  for (const f of FILES) {
    const from = path.join(SRC, f);
    if (!existsSync(from)) {
      if (f === '.env.local') console.warn(`  ! 跳过 ${f}（不存在；线上 SMTP 将不可用，请先创建）`);
      else console.warn(`  ! 跳过 ${f}（不存在）`);
      continue;
    }
    await fs.copyFile(from, path.join(DEST, f));
    console.log(`  + ${f}`);
  }
  for (const d of DIRS) {
    const from = path.join(SRC, d);
    if (!existsSync(from)) { console.warn(`  ! 跳过目录 ${d}（不存在）`); continue; }
    await copyDir(from, path.join(DEST, d));
    console.log(`  + ${d}/`);
  }

  const size = await measure(DEST);
  console.log(`\n已生成专用部署目录：${DEST}`);
  console.log(`排除项：.git node_modules .npm-cache tests scripts docs data *.bak build`);
  console.log(`总大小：${(size / 1024).toFixed(1)} KiB`);
  console.log(`\n下一步：用发布工具部署目录 "${DEST}"（保持 domainPrefix=shijian-canteen 以复用线上链接）。`);
}

async function measure(dir) {
  let total = 0;
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) total += await measure(p);
    else total += (await fs.stat(p)).size;
  }
  return total;
}

main().catch((err) => { console.error(err); process.exit(1); });
