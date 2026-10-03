import assert from 'node:assert/strict';
import { LocalRepository } from '../src/repository.js';

const KEY = 'canteen-guide-mvp-v1';
const values = new Map();
const storage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
const repo = new LocalRepository(storage);
const snapshot = () => repo.snapshot();
const seedVotes = (kind, targetId, count, stance) => {
  const state = JSON.parse(values.get(KEY));
  for (let index = 0; index < count; index++) state.reactions.push({ targetKind: kind, targetId, actorId: `seed-${kind}-${index}`, stance });
  values.set(KEY, JSON.stringify(state));
};

await repo.saveCanteen({ campusId: 'campus-a', name: '一餐' });
let state = await snapshot();
const canteenId = state.canteens[0].id;
await repo.saveShop({ canteenId, name: '面馆', tags: '面食、夜宵' });
state = await snapshot();
const shopId = state.shops[0].id;
const tagId = state.shops[0].tagRecords[0].id;
assert.equal(state.shops[0].tagRecords.length, 2);
await repo.setReaction('tag', tagId, 'demo-viewer', 'agree');
await repo.setReaction('tag', tagId, 'demo-viewer', 'disagree');
state = await snapshot();
assert.equal(state.reactions.filter((item) => item.targetId === tagId).length, 1);
assert.equal(state.reactions.find((item) => item.targetId === tagId).stance, 'disagree');
seedVotes('tag', tagId, 4, 'disagree');
await repo.setReaction('tag', tagId, 'demo-viewer', 'disagree'); //撤销
await repo.setReaction('tag', tagId, 'demo-viewer', 'disagree'); //重新反对
state = await snapshot();
assert.equal(state.shops[0].tagRecords[0].status, 'hidden');
assert.deepEqual(state.shops[0].tags, ['夜宵']);
await repo.moderateContent('tag', tagId, 'restore', 'demo-admin');
state = await snapshot();
assert.equal(state.shops[0].tagRecords[0].status, 'active');
assert.equal(state.shops[0].tagRecords[0].moderationLocked, true);

await repo.addComment('shop', shopId, 'demo-author', '这家店不错');
state = await snapshot();
const commentId = state.comments[0].id;
seedVotes('comment', commentId, 4, 'disagree');
await repo.setReaction('comment', commentId, 'demo-viewer', 'disagree');
state = await snapshot();
assert.equal(state.comments[0].status, 'hidden');
await repo.moderateContent('comment', commentId, 'restore', 'demo-admin');
assert.equal((await snapshot()).comments[0].status, 'active');

await repo.submitPost({ shopId, actorId: 'demo-author', title: '午餐', body: '今天吃面' });
state = await snapshot();
const postId = state.posts[0].id;
await repo.moderateContent('post', postId, 'hide', 'demo-admin');
assert.equal((await snapshot()).posts[0].status, 'hidden');
await repo.moderateContent('post', postId, 'restore', 'demo-admin');
assert.equal((await snapshot()).posts[0].status, 'active');

const base = { campusId: 'campus-a', canteenId, shopId, actorId: 'demo-author' };
await repo.submitContribution({ ...base, type: 'dish', title: '番茄面', price: '12' });
state = await snapshot();
const fixedId = state.contributions[0].id;
await repo.reviewContribution(fixedId, 'provisional', '', 'demo-admin');
await repo.setReaction('contribution', fixedId, 'demo-viewer', 'agree');
await repo.setReaction('contribution', fixedId, 'demo-admin', 'agree');
state = await snapshot();
assert.equal(state.contributions[0].status, 'fixed');
assert.equal(state.shops[0].dishes.find((dish) => dish.name === '番茄面')?.status, 'active');
seedVotes('contribution', fixedId, 4, 'disagree');
await repo.setReaction('contribution', fixedId, 'demo-viewer', 'disagree');
state = await snapshot();
assert.equal(state.contributions[0].status, 'contested');
await repo.resolveContested(fixedId, 'revoke', 'demo-admin');
state = await snapshot();
assert.equal(state.contributions[0].status, 'revoked');
assert.equal(state.shops[0].dishes.find((dish) => dish.name === '番茄面')?.status, 'archived');

await repo.submitContribution({ ...base, type: 'dish', title: '辣面' });
state = await snapshot();
const rejectedId = state.contributions[0].id;
await repo.reviewContribution(rejectedId, 'provisional', '', 'demo-admin');
await repo.setReaction('contribution', rejectedId, 'demo-viewer', 'disagree');
await repo.setReaction('contribution', rejectedId, 'demo-admin', 'disagree');
assert.equal((await snapshot()).contributions[0].status, 'rejected');
console.log('Tag reactions, moderation, provisional decisions and fixed contribution review passed.');
