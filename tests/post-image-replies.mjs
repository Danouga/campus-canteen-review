import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { JSDOM } from 'jsdom';
import { JsonStore } from '../store.mjs';
import { migrateLegacyAdministratorPosts, connectDatabase } from '../db.mjs';
import * as domain from '../src/repository.js';
import { screenComment, filterVersion } from '../src/content-filter.js';

const temporary = await fs.mkdtemp(path.join(tmpdir(), 'canteen-post-fix-'));
const admin = { id: 'actual-admin', name: '管理员', email: 'owner@example.test', role: 'admin', status: 'active' };
const member = { id: 'null-user', name: 'null', email: 'member@example.test', role: 'member', status: 'active' };
let data = domain.initialState();
data.canteens.push({ id: 'canteen', campusId: 'campus-a', name: '测试食堂', status: 'active' });
data.shops.push({ id: 'shop', canteenId: 'canteen', name: '测试面馆', status: 'active', dishes: [], photos: [], tags: [] });
const photo = 'data:image/png;base64,iVBORw0KGgo=';
const post = { shopId: 'shop', status: 'active', body: '测试正文', createdAt: '2026-10-18T10:00:00Z', contentHtml: `<p><img src="${photo}" data-photo-description="旧图片描述" /></p>` };
data.posts.push({ ...post, id: 'old-admin-post', ownerId: 'demo-admin', author: '管理员', title: '旧管理员帖' }, { ...post, id: 'member-post', ownerId: member.id, author: member.name, title: 'null的帖子' }, { ...post, id: 'unrelated-post', ownerId: 'demo-author', author: '管理员', title: '同昵称不迁移' });
const comment = { targetKind: 'post', shopId: 'shop', status: 'active', body: '评论正文', createdAt: '2026-10-18T11:00:00Z' };
data.comments.push({ ...comment, id: 'to-admin', targetId: 'old-admin-post', ownerId: member.id, author: 'null' }, { ...comment, id: 'to-member', targetId: 'member-post', ownerId: admin.id, author: admin.name }, { ...comment, id: 'legacy-self', targetId: 'old-admin-post', ownerId: 'demo-admin', author: '管理员' }, { ...comment, id: 'current-self', targetId: 'old-admin-post', ownerId: admin.id, author: admin.name });
data.recommendationRewards.push({ key: 'post:old-admin-post', sourceKind: 'post', sourceId: 'old-admin-post', ownerId: 'demo-admin', createdAt: post.createdAt });
data.reactions.push({ targetKind: 'post', targetId: 'old-admin-post', actorId: 'demo-admin', stance: 'agree' });
try {
  const store = new JsonStore(temporary);
  await store.transaction(value => { value.state = JSON.stringify(data); value.users = [admin, member]; });
  assert.equal(await migrateLegacyAdministratorPosts(store), 0);
  assert.equal(await migrateLegacyAdministratorPosts(store, member.email), 0);
  assert.equal(await migrateLegacyAdministratorPosts(store, 'unknown@example.test'), 0);
  const db = await connectDatabase({ DATA_DIR: temporary, LEGACY_ADMIN_ACCOUNT_EMAIL: admin.email });
  data = await db.snapshot();
  assert.equal(data.posts.find(item => item.id === 'old-admin-post').ownerId, admin.id);
  assert.equal(data.posts.find(item => item.id === 'old-admin-post').legacyOwnerId, 'demo-admin');
  assert.equal(data.posts.find(item => item.id === 'unrelated-post').ownerId, 'demo-author');
  assert.equal(data.recommendationRewards.length, 1);
  assert.equal(data.recommendationRewards[0].ownerId, admin.id);
  assert.equal(data.reactions[0].actorId, admin.id, 'old self-reactions must remain self-reactions');
  const replies = (value, id) => domain.userMessages(value, id).filter(item => item.category === 'replies');
  assert.deepEqual(replies(data, admin.id).map(item => item.id), ['reply:to-admin']);
  assert.match(replies(data, admin.id)[0].title, /^null 评论/);
  assert.deepEqual(replies(data, member.id).map(item => item.id), ['reply:to-member']);
  await db.action('markMessageRead', ['reply:to-admin', admin.id], admin);
  assert.equal(replies(await db.snapshot(), admin.id)[0].unread, false);
  await db.close();
  const before = await fs.readFile(store.file, 'utf8');
  assert.equal(await migrateLegacyAdministratorPosts(new JsonStore(temporary), admin.email), 0);
  assert.equal(await fs.readFile(store.file, 'utf8'), before, 'migration must not write again');
} finally {
  assert.equal(path.dirname(path.resolve(temporary)), path.resolve(tmpdir()));
  assert.ok(path.basename(temporary).startsWith('canteen-post-fix-'));
  await fs.rm(temporary, { recursive: true, force: true });
}

const dom = new JSDOM('<div id="app"></div>', { url: 'http://127.0.0.1:4185/posts/old-admin-post', runScripts: 'outside-only' });
const { window } = dom;
window.scrollTo = () => {};
window.__deps = { ...domain, createRepository: () => ({ mode: async () => 'file', snapshot: async () => structuredClone(data), authSession: async () => ({ user: admin }) }), screenComment, filterVersion, imageAsDataUrl: async () => photo };
const app = (await fs.readFile(new URL('../src/app.js', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '');
const rich = (await fs.readFile(new URL('../src/rich-text.js', import.meta.url), 'utf8')).replaceAll('export function', 'function');
const settle = async () => { await new Promise(setImmediate); await new Promise(setImmediate); };
const click = async selector => { const item = window.document.querySelector(selector); assert.ok(item, selector); item.click(); await settle(); };
try {
  window.eval('const { createRepository, demoUsers, canReview, recommendationLedger, recommendationSummary, userMessages, screenComment, filterVersion, imageAsDataUrl } = window.__deps;\n' + rich + '\n' + app);
  await settle();
  assert.equal(window.document.querySelector('.rich-content img').getAttribute('data-photo-description'), null);
  await click('.rich-content img');
  assert.equal(window.document.querySelector('.lightbox-caption').textContent, '美食贴图片');
  await click('[data-action="close-lightbox"]');
  await click('[data-view="posts"]');
  await click('[data-action="open-post"]');
  assert.equal(window.document.querySelector('#post-image-description'), null);
  const file = new window.File(['fake-image'], 'test.png', { type: 'image/png' });
  const input = window.document.querySelector('#post-inline-image');
  Object.defineProperty(input, 'files', { value: [file] });
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
  await settle();
  assert.ok(window.document.querySelector('#post-editor img'));
  console.log('post-image-replies: explicit legacy admin ownership migration, bidirectional replies with username null, self-reply exclusion, persistent read state, no image description and generic lightbox caption passed');
} finally { window.close(); }
