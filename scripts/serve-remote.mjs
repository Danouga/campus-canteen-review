const host = process.argv[2] || 'gz-cynosdbmysql-grp-m2qzs0l1.sql.tencentcdb.com';
const port = process.argv[3] || '25966';
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
