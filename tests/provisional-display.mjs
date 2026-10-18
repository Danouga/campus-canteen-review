import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { LocalRepository, demoUsers, canReview, recommendationLedger, recommendationSummary, userMessages } from '../src/repository.js';
import { screenComment, filterVersion } from '../src/content-filter.js';

const values = new Map();
const repository = new LocalRepository({ getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) });
await repository.saveCanteen({ actorId: 'demo-admin', campusId: 'campus-a', name: '第一食堂' });
let data = await repository.snapshot();
const canteenId = data.canteens[0].id;
for (const name of ['清香面馆', '邻家饭铺']) await repository.saveShop({ actorId: 'demo-admin', canteenId, name });
data = await repository.snapshot();
const shopId = data.shops.find(shop => shop.name === '清香面馆').id;
const otherShopId = data.shops.find(shop => shop.name === '邻家饭铺').id;
await repository.saveDish({ actorId: 'demo-admin', shopId, name: '牛肉面', price: '12.00' });
data = await repository.snapshot();
const dishId = data.shops.find(shop => shop.id === shopId).dishes[0].id;
const context = { actorId: 'demo-author', campusId: 'campus-a', canteenId, shopId };
const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=';
await repository.submitContribution({ ...context, type: 'photo', photoKind: 'storefront', photo, photoDescription: '店铺入口' });
await repository.submitContribution({ ...context, shopId: otherShopId, type: 'photo', photoKind: 'storefront', photo });
await repository.submitContribution({ ...context, type: 'field-update', targetKind: 'shop', changes: { tags: '清淡,夜宵' } });
await repository.submitContribution({ ...context, dishId, type: 'field-update', targetKind: 'dish', changes: { price: '15.50', note: '<清淡一点>' } });
await repository.submitContribution({ ...context, type: 'dish', title: '免费汤', price: '0' });
for (const item of (await repository.snapshot()).contributions) await repository.reviewContribution(item.id, 'provisional', '', 'demo-admin');
data = await repository.snapshot();
let user = demoUsers.find(user => user.id === 'demo-viewer');
const dom = new JSDOM('<!doctype html><div id="app"></div>', { url: `http://127.0.0.1:4185/canteens/${canteenId}`, runScripts: 'outside-only' });
const { window } = dom;
window.scrollTo = () => {};
const repo = { async mode() { return 'file'; }, async snapshot() { return structuredClone(data); }, async authSession() { return { user }; } };
window.__deps = { createRepository: () => repo, demoUsers, canReview, recommendationLedger, recommendationSummary, userMessages, screenComment, filterVersion,
  sanitizeRichHtml: value => value, plainTextFromRichHtml: value => value, imageAsDataUrl: async () => '' };
const source = (await readFile(new URL('../src/app.js', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '');
const settle = async () => { await new Promise(setImmediate); await new Promise(setImmediate); };
const cards = () => [...window.document.querySelectorAll('.provisional-item')];
function field(card, label) { return [...card.querySelectorAll('.review-change')].find(row => row.querySelector('b').textContent === label)?.querySelector('span').textContent; }
try {
  window.eval('const { createRepository, demoUsers, canReview, recommendationLedger, recommendationSummary, userMessages, screenComment, filterVersion, sanitizeRichHtml, plainTextFromRichHtml, imageAsDataUrl } = window.__deps;\n' + source);
  await settle();
  assert.equal(cards().length, 5);
  const photoCards = cards().filter(card => card.querySelector('.gallery-photo-open'));
  assert.equal(photoCards.length, 2);
  for (const name of ['清香面馆', '邻家饭铺']) {
    const card = photoCards.find(card => card.querySelector('.contribution-context').textContent.includes(name));
    assert.ok(card, `Missing photo attribution for ${name}`);
    assert.match(card.querySelector('.contribution-context').textContent, /校区一.*第一食堂/);
    assert.ok(card.querySelector('.gallery-photo-open').dataset.caption.includes(name));
  }
  const tagCard = cards().find(card => field(card, '新增标签'));
  assert.equal(field(tagCard, '新增标签'), '清淡、夜宵');
  const priceCard = cards().find(card => field(card, '参考价格') === '¥15.50');
  assert.ok(priceCard);
  assert.match(priceCard.querySelector('.contribution-context').textContent, /清香面馆.*牛肉面/);
  assert.equal(field(priceCard, '补充说明'), '<清淡一点>');
  assert.equal(priceCard.querySelector('.provisional-details').querySelectorAll('script, img').length, 0);
  assert.equal(field(cards().find(card => card.textContent.includes('免费汤')), '参考价格'), '¥0');
  assert.equal(data.shops.find(shop => shop.id === shopId).dishes[0].price, '12.00');
  assert.deepEqual(data.shops.find(shop => shop.id === shopId).tags, []);

  // A dish's provisional field changes must also appear on its own detail page.
  window.history.pushState({}, '', `/shops/${shopId}/dishes/${dishId}`);
  window.dispatchEvent(new window.PopStateEvent('popstate'));
  assert.equal(cards().length, 1);
  assert.equal(field(cards()[0], '参考价格'), '¥15.50');

  // The admin provisional section uses the same context and submitted values.
  user = demoUsers.find(user => user.role === 'admin');
  await window.refresh();
  window.document.querySelector('[data-view="admin"]').click();
  const adminCards = [...window.document.querySelectorAll('.manage-provisional-copy')];
  assert.equal(adminCards.length, 5);
  assert.ok(adminCards.some(card => field(card, '新增标签') === '清淡、夜宵'));
  assert.ok(adminCards.some(card => field(card, '参考价格') === '¥15.50'));
  assert.ok(adminCards.some(card => card.querySelector('.gallery-photo-open') && card.querySelector('.contribution-context').textContent.includes('邻家饭铺')));
  console.log('暂示展示：多店图片归属、图片放大标题、标签数组、价格/零价格、文本转义、菜品详情及管理工作台均通过；未改变正式资料。');
} finally { window.close(); }
