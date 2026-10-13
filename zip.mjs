// 零依赖的 ZIP 打包（仅 store 存储法，不压缩），避免沙箱安装原生模块失败。
// 仅用于把导出数据（app-data.json + 媒体二进制）打成单个可下载文件。

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buffer.length; i++) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// entries: Array<{ name: string, body: Buffer }>
// 返回 Buffer，可直接作为 HTTP 响应体。
export function buildZip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const data = entry.body;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // 本地文件头签名
    local.writeUInt16LE(20, 4); // 解压所需版本
    local.writeUInt16LE(0x0800, 6); // 通用标志位：UTF-8 文件名
    local.writeUInt16LE(0, 8); // 压缩方法：0 = 存储
    local.writeUInt16LE(0, 10); // 修改时间
    local.writeUInt16LE(0, 12); // 修改日期
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); // 压缩后大小
    local.writeUInt32LE(data.length, 22); // 未压缩大小
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // 扩展字段长度
    chunks.push(local, nameBuf, data);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); // 中央目录头签名
    cd.writeUInt16LE(20, 4); // 版本（由谁制作）
    cd.writeUInt16LE(20, 6); // 解压所需版本
    cd.writeUInt16LE(0x0800, 8); // UTF-8 标志
    cd.writeUInt16LE(0, 10); // 压缩方法
    cd.writeUInt16LE(0, 12); // 修改时间
    cd.writeUInt16LE(0, 14); // 修改日期
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30); // 扩展字段长度
    cd.writeUInt16LE(0, 32); // 文件注释长度
    cd.writeUInt16LE(0, 34); // 磁盘起始号
    cd.writeUInt16LE(0, 36); // 内部属性
    cd.writeUInt32LE(0, 38); // 外部属性
    cd.writeUInt32LE(offset, 42); // 本地头偏移
    central.push(cd, nameBuf);

    offset += local.length + nameBuf.length + data.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // 中央目录结束签名
  end.writeUInt16LE(0, 4); // 当前磁盘
  end.writeUInt16LE(0, 6); // 中央目录起始磁盘
  end.writeUInt16LE(entries.length, 8); // 本磁盘中央目录记录数
  end.writeUInt16LE(entries.length, 10); // 中央目录总记录数
  end.writeUInt32LE(centralBuf.length, 12); // 中央目录大小
  end.writeUInt32LE(offset, 16); // 中央目录偏移
  end.writeUInt16LE(0, 20); // 注释长度

  return Buffer.concat([...chunks, centralBuf, end]);
}
