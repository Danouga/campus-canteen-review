// Add a small, clearly labeled dataset to the running local MySQL preview.
const base = process.env.SEED_BASE_URL || 'http://127.0.0.1:4174';
const cookie = process.env.SEED_SESSION_COOKIE;
if (!cookie) throw new Error('邮箱登录启用后，测试数据脚本需要 SEED_SESSION_COOKIE（已登录管理员的会话 Cookie）。');

async function request(path, options) {
  const response = await fetch(`${base}${path}`, { ...options, headers: { ...options?.headers, Cookie: cookie } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result;
}

async function snapshot() { return (await request('/api/state')).data; }
async function invoke(method, ...args) {
  return request('/api/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, args }),
  });
}

const status = await request('/api/status');
if (status.mode !== 'mysql' || !status.connected) throw new Error('请先启动已连接 MySQL 的本地预览。');

let data = await snapshot();
const canteen = data.canteens.find((item) => item.name === '一餐' && item.status === 'active')
  || data.canteens.find((item) => item.status === 'active' && !data.shops.some((shop) => shop.canteenId === item.id && shop.status === 'active'));
if (!canteen) throw new Error('找不到适合放演示资料的食堂。');

const shopName = '【测试】清新小食';
let shop = data.shops.find((item) => item.name === shopName && item.status === 'active');
if (!shop) {
  await invoke('saveShop', { actorId: 'demo-admin', canteenId: canteen.id, name: shopName, location: '演示位置（非真实店铺）', tags: '测试、轻食' });
  data = await snapshot();
  shop = data.shops.find((item) => item.name === shopName && item.status === 'active');
}

for (const dish of [
  { name: '【测试】番茄鸡蛋面', price: '12.00', note: '演示菜品，价格仅供界面测试。' },
  { name: '【测试】蔬菜饭', price: '14.00', note: '演示菜品，可继续补充照片与口味。' },
]) {
  if (!shop.dishes.some((item) => item.name === dish.name && item.status !== 'archived')) {
    await invoke('saveDish', { actorId: 'demo-admin', shopId: shop.id, ...dish });
    data = await snapshot();
    shop = data.shops.find((item) => item.id === shop.id);
  }
}

const dishId = shop.dishes.find((item) => item.name === '【测试】番茄鸡蛋面').id;
for (const comment of [
  { targetKind: 'shop', targetId: shop.id, actorId: 'demo-author', body: '演示评论：这家店的信息还可以继续由同学补充。' },
  { targetKind: 'shop', targetId: shop.id, actorId: 'demo-viewer', body: '演示评论：菜单和营业时间都可以在这里核对。' },
  { targetKind: 'dish', targetId: dishId, actorId: 'demo-author', body: '演示评论：番茄口味比较清爽，照片待补充。' },
]) {
  if (!data.comments.some((item) => item.targetKind === comment.targetKind && item.targetId === comment.targetId && item.body === comment.body && item.status !== 'archived')) {
    await invoke('addComment', comment.targetKind, comment.targetId, comment.actorId, comment.body);
    data = await snapshot();
  }
}

const postTitle = '【测试】一餐午餐记录';
if (!data.posts.some((item) => item.title === postTitle && item.shopId === shop.id && item.status !== 'archived')) {
  await invoke('submitPost', { shopId: shop.id, actorId: 'demo-author', title: postTitle, body: '这是一篇用于验证美食贴详情与评论入口的演示内容。' });
}

console.log('演示资料已就绪：1 家测试店铺、2 道测试菜品、3 条测试评论、1 篇测试帖子。');
