import assert from 'node:assert/strict';
import { LocalRepository } from '../src/repository.js';

const values = new Map();
const storage = {
  getItem: (key) => values.get(key) || null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
};
const repo = new LocalRepository(storage);
await repo.saveCanteen({ actorId: 'demo-admin', campusId: 'campus-a', name: '测试食堂' });
let state = await repo.snapshot();
const canteenId = state.canteens[0].id;
await repo.saveShop({ actorId: 'demo-admin', canteenId, name: '测试店铺', tags: '面食、夜宵、面食' });
state = await repo.snapshot();
const shopId = state.shops[0].id;
assert.deepEqual(state.shops[0].tags, ['面食', '夜宵']);
await repo.saveDish({ actorId: 'demo-admin', shopId, name: '番茄口味' });
state = await repo.snapshot();
const dishId = state.shops[0].dishes[0].id;
const base = { campusId: 'campus-a', canteenId, shopId, actorId: 'demo-author' };
await repo.submitContribution({ ...base, type: 'hours', hours: '07:00–20:00', title: '营业时间' });
state = await repo.snapshot();
const provisionalId = state.contributions[0].id;
await repo.reviewContribution(provisionalId, 'provisional', '', 'demo-admin');
await assert.rejects(repo.setReaction('contribution', provisionalId, 'demo-author', 'agree'), /自己/);
await repo.setReaction('contribution', provisionalId, 'demo-viewer', 'agree');
state = await repo.snapshot();
assert.equal(state.reactions[0].stance, 'agree');
await repo.setReaction('contribution', provisionalId, 'demo-viewer', 'disagree');
state = await repo.snapshot();
assert.equal(state.reactions.length, 1);
assert.equal(state.reactions[0].stance, 'disagree');
await repo.setReaction('contribution', provisionalId, 'demo-viewer', 'disagree');
state = await repo.snapshot();
assert.equal(state.reactions.length, 0);

await repo.submitContribution({ campusId: 'campus-a', canteenId, actorId: 'demo-author', type: 'shop', title: '测试饮品店', tags: '饮品、夜宵' });
state = await repo.snapshot();
assert.equal(state.contributions[0].tags, '饮品、夜宵');
await repo.reviewContribution(state.contributions[0].id, 'fixed', '', 'demo-admin');
state = await repo.snapshot();
assert.deepEqual(state.shops.find((shop) => shop.name === '测试饮品店').tags, ['饮品', '夜宵']);

await repo.submitContribution({ ...base, type: 'field-update', targetKind: 'shop', changes: { tags: '饮品，早餐' } });
state = await repo.snapshot();
assert.deepEqual(state.contributions[0].changes.tags, ['饮品', '早餐']);
await repo.reviewContribution(state.contributions[0].id, 'fixed', '', 'demo-admin');
state = await repo.snapshot();
assert.deepEqual(state.shops[0].tags, ['面食', '夜宵', '饮品', '早餐']);
await assert.rejects(repo.submitContribution({ ...base, type: 'field-update', targetKind: 'shop', changes: { tags: '面食' } }), /没有可新增/);
await assert.rejects(repo.submitContribution({ ...base, type: 'field-update', targetKind: 'shop', changes: { removeTags: '夜宵' } }), /选择要修改的条目/);
state = await repo.snapshot();
assert.deepEqual(state.shops[0].tags, ['面食', '夜宵', '饮品', '早餐']);

await repo.submitContribution({ ...base, type: 'dish', title: '牛肉面', price: '13.5', detail: '加辣' });
state = await repo.snapshot();
assert.equal(state.contributions[0].price, '13.5');
await repo.reviewContribution(state.contributions[0].id, 'fixed', '', 'demo-admin');
state = await repo.snapshot();
assert.equal(state.shops[0].dishes.find((dish) => dish.name === '牛肉面').price, '13.5');

await repo.submitContribution({ ...base, type: 'field-update', targetKind: 'canteen', changes: { hours: '每天 07:00–20:00' } });
state = await repo.snapshot();
assert.equal(state.contributions[0].canteenId, canteenId);
await assert.rejects(repo.reviewContribution(state.contributions[0].id, 'fixed', '', 'demo-viewer'), /管理员/);
await repo.reviewContribution(state.contributions[0].id, 'fixed', '时间已核实', 'demo-admin');
state = await repo.snapshot();
assert.equal(state.canteens[0].hours, '每天 07:00–20:00');
assert.equal(state.contributions[0].notificationReadAt, null);
assert.equal(state.contributions[0].reviewNote, '时间已核实');
await assert.rejects(repo.markReviewMessageRead(state.contributions[0].id, 'demo-viewer'), /不存在/);
await repo.markReviewMessageRead(state.contributions[0].id, 'demo-author');
state = await repo.snapshot();
assert.ok(state.contributions[0].notificationReadAt);

await repo.submitContribution({ ...base, dishId, type: 'field-update', targetKind: 'dish', changes: { price: '12', note: '微辣' } });
state = await repo.snapshot();
await repo.reviewContribution(state.contributions[0].id, 'fixed', '', 'demo-admin');
state = await repo.snapshot();
assert.equal(state.shops[0].dishes[0].price, '12');
assert.equal(state.shops[0].dishes[0].note, '微辣');

const photo = 'data:image/png;base64,iVBORw0KGgo=';
await repo.submitContribution({ ...base, type: 'canteen-photo', photo });
state = await repo.snapshot();
await repo.reviewContribution(state.contributions[0].id, 'fixed', '', 'demo-admin');
state = await repo.snapshot();
assert.equal(state.canteens[0].photos.length, 1);
const canteenPhotoId = state.canteens[0].photos[0].id;
await assert.rejects(repo.deleteOwnContent('photo', canteenPhotoId, 'demo-viewer'), /自己/);
await repo.deleteOwnContent('photo', canteenPhotoId, 'demo-author');
state = await repo.snapshot();
assert.equal(state.canteens[0].photos[0].status, 'archived');

await repo.submitContribution({ ...base, type: 'photo', photoKind: 'dish', dishId, photo });
state = await repo.snapshot();
await repo.reviewContribution(state.contributions[0].id, 'fixed', '', 'demo-admin');
await repo.submitContribution({ ...base, type: 'photo', photoKind: 'dish', dishId, photo });
state = await repo.snapshot();
await repo.reviewContribution(state.contributions[0].id, 'fixed', '', 'demo-admin');
state = await repo.snapshot();
assert.equal(state.shops[0].photos.filter((entry) => entry.dishId === dishId && entry.status === 'active').length, 2);

await repo.addComment('dish', dishId, 'demo-author', '口味不错');
state = await repo.snapshot();
const commentId = state.comments[0].id;
await repo.setReaction('comment', commentId, 'demo-viewer', 'agree');
state = await repo.snapshot();
assert.equal(state.reactions[0].targetId, commentId);
await assert.rejects(repo.setReaction('comment', commentId, 'demo-author', 'agree'), /自己/);
await assert.rejects(repo.deleteOwnContent('comment', commentId, 'demo-viewer'), /自己/);
await repo.deleteOwnContent('comment', commentId, 'demo-author');
state = await repo.snapshot();
assert.equal(state.comments[0].status, 'archived');

await repo.submitPost({ shopId, actorId: 'demo-author', title: '午餐记录', body: '今天吃了番茄口味' });
state = await repo.snapshot();
const postId = state.posts[0].id;
await repo.setReaction('post', postId, 'demo-viewer', 'disagree');
state = await repo.snapshot();
assert.equal(state.reactions.find((entry) => entry.targetId === postId)?.stance, 'disagree');
await repo.addComment('post', postId, 'demo-viewer', '谢谢分享');
await assert.rejects(repo.deleteOwnContent('post', postId, 'demo-viewer'), /自己/);
await repo.deleteOwnContent('post', postId, 'demo-author');
state = await repo.snapshot();
assert.equal(state.posts[0].status, 'archived');

await assert.rejects(
  repo.submitContribution({ ...base, campusId: 'campus-b', type: 'field-update', targetKind: 'shop', changes: { location: '二楼' } }),
  /不匹配/
);
await repo.submitContribution({ ...base, type: 'field-update', targetKind: 'shop', changes: { location: '待审核位置' } });
const pendingMessageId = (await repo.snapshot()).contributions[0].id;
await repo.submitContribution({ campusId: 'campus-a', canteenId, shopId, actorId: 'demo-viewer', type: 'field-update', targetKind: 'shop', changes: { lateHours: '21:00' } });
const viewerMessageId = (await repo.snapshot()).contributions[0].id;
await repo.reviewContribution(viewerMessageId, 'fixed', '', 'demo-admin');
assert.equal(await repo.markAllReviewMessagesRead('demo-author') > 0, true);
state = await repo.snapshot();
assert.equal(state.contributions.find((entry) => entry.id === pendingMessageId).notificationReadAt, null);
assert.equal(state.contributions.find((entry) => entry.id === viewerMessageId).notificationReadAt, null);
assert.equal(state.contributions.filter((entry) => entry.ownerId === 'demo-author' && entry.status !== 'pending' && !entry.notificationReadAt).length, 0);
assert.equal(await repo.markAllReviewMessagesRead('demo-author'), 0);
assert.equal(await repo.markAllReviewMessagesRead('demo-viewer'), 1);
assert.ok((await repo.snapshot()).contributions.find((entry) => entry.id === viewerMessageId).notificationReadAt);
console.log('Contributions, review messages, ownership, dish photos and comments passed.');
