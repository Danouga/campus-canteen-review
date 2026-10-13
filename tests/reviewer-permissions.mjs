import assert from 'node:assert/strict';
import { LocalRepository, demoUsers, canReview } from '../src/repository.js';
import { ApiRepository } from '../src/api-repository.js';

const KEY = 'canteen-guide-mvp-v1';
const values = new Map();
const repo = new LocalRepository({ getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) });
const admin = 'demo-admin';
const reviewer = 'demo-reviewer';
assert.ok(canReview(demoUsers.find((user) => user.id === reviewer)));
assert.equal(canReview(demoUsers.find((user) => user.id === 'demo-viewer')), false);
await repo.saveCanteen({ actorId: admin, campusId: 'campus-a', name: '测试食堂' });
const canteenId = (await repo.snapshot()).canteens[0].id;
await repo.saveShop({ actorId: admin, canteenId, name: '测试店铺', tags: '面食' });
const shopId = (await repo.snapshot()).shops[0].id;
await repo.saveDish({ actorId: admin, shopId, name: '测试菜品' });
const dishId = (await repo.snapshot()).shops[0].dishes[0].id;
const photo = 'data:image/png;base64,iVBORw0KGgo=';
await repo.savePhoto({ actorId: admin, shopId, photoKind: 'storefront', photo });
await repo.saveCanteenPhoto({ actorId: admin, canteenId, photo });
const state = await repo.snapshot();
const shopPhotoId = state.shops[0].photos[0].id;
const canteenPhotoId = state.canteens[0].photos[0].id;

const maintenance = [
  ['saveCampus', (actorId) => ['campus-a', '修改校区', actorId]],
  ['saveCanteen', (actorId) => [{ actorId, id: canteenId, campusId: 'campus-a', name: '修改食堂' }]],
  ['saveShop', (actorId) => [{ actorId, id: shopId, canteenId, name: '修改店铺' }]],
  ['saveDish', (actorId) => [{ actorId, id: dishId, shopId, name: '修改菜品' }]],
  ['savePhoto', (actorId) => [{ actorId, id: shopPhotoId, shopId, photoKind: 'storefront' }]],
  ['saveCanteenPhoto', (actorId) => [{ actorId, id: canteenPhotoId, canteenId }]],
  ['removeEntry', (actorId) => ['shop', shopId, actorId]],
  ['restoreEntry', (actorId) => ['shop', shopId, actorId]],
  ['removeCanteenPhoto', (actorId) => [canteenId, canteenPhotoId, actorId]],
  ['removeShopContent', (actorId) => ['dish', shopId, dishId, actorId]],
  ['resetPreview', (actorId) => [actorId]],
];
for (const actorId of [reviewer, 'demo-viewer', undefined]) {
  for (const [method, args] of maintenance) {
    const before = values.get(KEY);
    await assert.rejects(repo[method](...args(actorId)), /管理员|演示身份/, method);
    assert.equal(values.get(KEY), before, `${method} must not mutate data on denial`);
  }
}

const contribution = { actorId: 'demo-author', campusId: 'campus-a', canteenId, shopId, type: 'dish' };
for (const decision of ['fixed', 'rejected', 'provisional']) {
  await repo.submitContribution({ ...contribution, title: `审核员${decision}` });
  const entryId = (await repo.snapshot()).contributions[0].id;
  await assert.rejects(repo.reviewContribution(entryId, decision, '', 'demo-viewer'), /管理员或审核员/);
  await repo.reviewContribution(entryId, decision, '审核员处理', reviewer);
  assert.equal((await repo.snapshot()).contributions[0].status, decision);
  if (decision === 'provisional') {
    await repo.fixProvisional(entryId, reviewer);
    assert.equal((await repo.snapshot()).contributions[0].status, 'fixed');
  }
}
await repo.submitContribution({ ...contribution, title: '审核员撤销暂示' });
const revokedId = (await repo.snapshot()).contributions[0].id;
await repo.reviewContribution(revokedId, 'provisional', '', reviewer);
await repo.revokeProvisional(revokedId, reviewer);
assert.equal((await repo.snapshot()).contributions[0].status, 'rejected');

await repo.addComment('shop', shopId, 'demo-author', '待复核评论');
await repo.submitPost({ shopId, actorId: 'demo-author', title: '待复核帖子', body: '内容复核测试' });
const moderationState = await repo.snapshot();
for (const [kind, id] of [['comment', moderationState.comments[0].id], ['post', moderationState.posts[0].id], ['tag', moderationState.shops[0].tagRecords[0].id]]) {
  await repo.moderateContent(kind, id, 'hide', reviewer);
  await repo.moderateContent(kind, id, 'restore', reviewer);
  await repo.moderateContent(kind, id, 'remove', reviewer);
}
const contested = JSON.parse(values.get(KEY));
const fixed = contested.contributions.find((entry) => entry.status === 'fixed');
fixed.status = 'contested';
values.set(KEY, JSON.stringify(contested));
await repo.resolveContested(fixed.id, 'restore', reviewer);
assert.equal((await repo.snapshot()).contributions.find((entry) => entry.id === fixed.id).status, 'fixed');
await repo.removeEntry('shop', shopId, admin);
await repo.restoreEntry('shop', shopId, admin);
assert.equal((await repo.snapshot()).shops[0].status, 'active');

// Check that the HTTP adapter forwards identity for every positional maintenance API.
const api = new ApiRepository(repo);
api.modePromise = Promise.resolve('local');
for (const [method, args] of maintenance) await assert.rejects(api[method](...args(reviewer)), /管理员/);
console.log('审核员审核与复核、直接维护拒绝、普通用户拒绝、管理员维护及 API 身份传递均通过。');
