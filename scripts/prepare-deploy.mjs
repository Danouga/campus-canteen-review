// Creates a new upload directory. Never copies credentials or live data.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const projectRoot = path.resolve(import.meta.dirname, '..');
const applicationId = 'wbapp_mkles2WxzoQkUIOuWS1250';
const runtimeFiles = ['index.html', 'package.json', '.env.example', 'server.mjs', 'server-core.mjs', 'db.mjs', 'store.mjs', 'auth-store.mjs', 'auth.mjs', 'passwords.mjs', 'access.mjs', 'zip.mjs', 'media.mjs', 'scripts/deploy-start.mjs'];
const clientFiles = ['app.js', 'styles.css', 'repository.js', 'api-repository.js', 'rich-text.js', 'image-compression.js', 'content-filter.js'].map(name => `src/${name}`);

export async function prepareDeployment(sourceRoot = projectRoot) {
  const root = path.resolve(sourceRoot);
  const pending = [];
  for (const relative of [...runtimeFiles, ...clientFiles]) {
    const source = path.join(root, relative);
    if (!(await fs.lstat(source)).isFile()) throw new Error(`发布输入必须是普通文件：${relative}`);
    const body = await fs.readFile(source);
    if (relative === '.env.example') {
      for (const line of body.toString('utf8').split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z_]*(?:PASS|PASSWORD|SECRET|TOKEN|API_KEY)[A-Z_]*)\s*=\s*(.*?)\s*$/);
        if (match && match[2].replace(/^['"]|['"]$/g, '')) throw new Error('配置示例含非空密钥，已停止打包。');
      }
    }
    pending.push({ relative, body });
  }
  const outputParent = path.join(root, '.deploy');
  try {
    const entry = await fs.lstat(outputParent);
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error('发布输出目录不能是符号链接或文件。');
  } catch (error) { if (error.code !== 'ENOENT') throw error; await fs.mkdir(outputParent); }
  const directory = await fs.mkdtemp(path.join(outputParent, 'release-'));
  const hashes = {};
  for (const { relative, body } of pending) {
    const destination = path.join(directory, relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, body, { flag: 'wx' });
    hashes[relative] = createHash('sha256').update(body).digest('hex');
  }
  // Supported application metadata; no deployment history is altered.
  await fs.mkdir(path.join(directory, '.workbuddy'));
  await fs.writeFile(path.join(directory, '.workbuddy', 'applications.yaml'), `applications:\n  - name: 食间 · 校园食堂共建网站\n    locator: ${applicationId}\n`);
  const manifest = {
    applicationId, expectedSandboxId: '6c1cfd6082b34593887da1e6ca3e3b2d', expectedUrl: 'https://shijian-canteen.app.workbuddy.host/',
    createdAt: new Date().toISOString(), directory, startCommand: 'node scripts/deploy-start.mjs', installCommand: 'npm install --omit=dev --ignore-scripts', files: hashes,
    note: 'Update existing application only. Existing runtime configuration/data must remain in the reused sandbox. Startup guard refuses empty or incomplete environments.'
  };
  await fs.writeFile(path.join(directory, 'release-manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareDeployment().then(manifest => {
    console.log(`已生成干净发布包：${manifest.directory}`);
    console.log(`目标应用：${manifest.applicationId}`);
    console.log(`启动命令：${manifest.startCommand}`);
    console.log('未复制密钥、种子、媒体或运行数据；尚未部署。');
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
