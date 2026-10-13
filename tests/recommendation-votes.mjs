import assert from 'node:assert/strict';
import { LocalRepository, recommendationLedger, recommendationPeriod, recommendationSummary } from '../src/repository.js';

const KEY = 'canteen-guide-mvp-v1';
const values = new Map();
const storage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
const repo = new LocalRepository(storage);
const snapshot = () => repo.snapshot();
const update = (change) => { const data = JSON.parse(values.get(KEY)); change(data); values.set(KEY, JSON.stringify(data)); };

assert.deepEqual(recommendationPeriod(new Date('2026-10-04T15:59:59Z')), { day: '2026-10-04', week: '2026-09-28' });
assert.deepEqual(recommendationPeriod(new Date('2026-10-04T16:00:00Z')), { day: '2026-10-05', week: '2026-10-05' });
const pastWeek = { recommendationVotes: [{ shopId: 'shop-1', actorId: 'demo-author', source: 'bonus', day: '2026-10-04', week: '2026-09-28' }], recommendationRewards: [{ ownerId: 'demo-author' }, { ownerId: 'demo-author' }] };
const newWeek = recommendationSummary(pastWeek, 'demo-author', new Date('2026-10-04T16:00:00Z'));
assert.equal(newWeek.weeklyVotes.length, 0);
assert.equal(newWeek.bonus, 1);
assert.equal(newWeek.baseRemaining, 1);
assert.equal(recommendationLedger(pastWeek, 'demo-author').points, 1);
assert.equal(recommendationLedger(pastWeek, 'demo-author').votes[0].sourceInferred, true);

await repo.saveCanteen({ actorId: 'demo-admin', campusId: 'campus-a', name: '测试食堂' });
let data = await snapshot();
const canteenId = data.canteens[0].id;
await repo.saveShop({ actorId: 'demo-admin', canteenId, name: '第一家店' });
await repo.saveShop({ actorId: 'demo-admin', canteenId, name: '第二家店' });
data = await snapshot();
const [secondShop, firstShop] = data.shops;

assert.equal(recommendationSummary(data, 'demo-author').available, 1);
await repo.castRecommendationVote(firstShop.id, 'demo-author');
await assert.rejects(repo.castRecommendationVote(firstShop.id, 'demo-author'), /暂无额外推荐票/);
data = await snapshot();
assert.equal(data.recommendationVotes[0].source, 'base');
assert.equal(recommendationSummary(data, 'demo-author').available, 0);

await repo.submitContribution({ type: 'field-update', targetKind: 'shop', campusId: 'campus-a', canteenId, shopId: firstShop.id, changes: { location: '一楼' }, actorId: 'demo-author' });
data = await snapshot();
await repo.reviewContribution(data.contributions[0].id, 'fixed', '', 'demo-admin');
data = await snapshot();
assert.equal(recommendationSummary(data, 'demo-author').bonus, 1);
await repo.castRecommendationVote(firstShop.id, 'demo-author');
data = await snapshot();
assert.equal(data.recommendationVotes.at(-1).source, 'bonus');
assert.equal(data.recommendationVotes.at(-1).rewardKey, `contribution:${data.contributions[0].id}`);
assert.equal(recommendationLedger(data, 'demo-author').points, 2);

await repo.addComment('shop', firstShop.id, 'demo-author', '值得推荐');
data = await snapshot();
const commentId = data.comments[0].id;
update((state) => { for (let index = 0; index < 4; index++) state.reactions.push({ targetKind: 'comment', targetId: commentId, actorId: `other-${index}`, stance: 'agree' }); });
await repo.setReaction('comment', commentId, 'demo-viewer', 'agree');
data = await snapshot();
assert.equal(data.recommendationRewards.filter((entry) => entry.key === `comment:${commentId}`).length, 1);
await repo.setReaction('comment', commentId, 'demo-viewer', 'agree'); // 撤销赞同不收回已经发放的票
await repo.setReaction('comment', commentId, 'demo-viewer', 'agree');
for (let index = 0; index < 3; index++) { await repo.setReaction('comment', commentId, 'demo-viewer', 'agree'); await repo.setReaction('comment', commentId, 'demo-viewer', 'agree'); }
assert.equal((await snapshot()).recommendationRewards.filter((entry) => entry.key === `comment:${commentId}`).length, 1);

await repo.submitPost({ shopId: firstShop.id, actorId: 'demo-author', title: '测试帖子', body: '这家店值得试试' });
data = await snapshot();
const postId = data.posts[0].id;
update((state) => { for (let index = 0; index < 9; index++) state.reactions.push({ targetKind: 'post', targetId: postId, actorId: `reader-${index}`, stance: 'agree' }); });
await repo.setReaction('post', postId, 'demo-viewer', 'agree');
data = await snapshot();
assert.equal(data.recommendationRewards.filter((entry) => entry.key === `post:${postId}`).length, 1);
await repo.setReaction('post', postId, 'demo-viewer', 'agree');
await repo.setReaction('post', postId, 'demo-viewer', 'agree');
assert.equal((await snapshot()).recommendationRewards.filter((entry) => entry.key === `post:${postId}`).length, 1);

await repo.castRecommendationVote(firstShop.id, 'demo-author');
await assert.rejects(repo.castRecommendationVote(firstShop.id, 'demo-author'), /最多投 3 张/);
await repo.castRecommendationVote(secondShop.id, 'demo-author');
data = await snapshot();
assert.equal(recommendationSummary(data, 'demo-author').available, 0);
assert.equal(recommendationSummary(data, 'demo-author').weeklyVotes.length, 4);
assert.equal(recommendationLedger(data, 'demo-author').points, 4);
assert.deepEqual(data.recommendationVotes.filter((item) => item.source === 'bonus').map((item) => item.rewardKey), [`contribution:${data.contributions[0].id}`, `comment:${commentId}`, `post:${postId}`]);
assert.equal(recommendationSummary(data, 'demo-author', new Date(Date.now() + 24 * 60 * 60 * 1000)).baseRemaining, 1);
assert.equal(recommendationSummary(data, 'demo-viewer').baseRemaining, 1);
await assert.rejects(repo.castRecommendationVote('missing', 'demo-author'), /不能接收/);
await assert.rejects(repo.castRecommendationVote(firstShop.id, 'fake-user'), /演示身份/);

await repo.addComment('shop', firstShop.id, 'demo-author', '测试不同用户计数');
data = await snapshot();
const distinctCommentId = data.comments[0].id;
update((state) => {
  for (let index = 0; index < 4; index++) state.reactions.push({ targetKind: 'comment', targetId: distinctCommentId, actorId: 'same-reader', stance: 'agree' });
  state.reactions.push({ targetKind: 'comment', targetId: distinctCommentId, actorId: 'demo-author', stance: 'agree' });
});
assert.equal((await snapshot()).recommendationRewards.some((entry) => entry.key === `comment:${distinctCommentId}`), false);
await repo.setReaction('comment', distinctCommentId, 'demo-viewer', 'agree');
update((state) => { for (const actorId of ['reader-a', 'reader-b']) state.reactions.push({ targetKind: 'comment', targetId: distinctCommentId, actorId, stance: 'agree' }); });
assert.equal((await snapshot()).recommendationRewards.some((entry) => entry.key === `comment:${distinctCommentId}`), false);
await repo.setReaction('comment', distinctCommentId, 'demo-admin', 'agree');
assert.equal((await snapshot()).recommendationRewards.filter((entry) => entry.key === `comment:${distinctCommentId}`).length, 1);

const parallelValues = new Map();
const parallelRepo = new LocalRepository({ getItem: (key) => parallelValues.get(key) || null, setItem: (key, value) => parallelValues.set(key, value), removeItem: (key) => parallelValues.delete(key) });
await parallelRepo.saveCanteen({ actorId: 'demo-admin', campusId: 'campus-a', name: '并发测试食堂' });
await parallelRepo.saveShop({ actorId: 'demo-admin', canteenId: (await parallelRepo.snapshot()).canteens[0].id, name: '并发测试店铺' });
const parallelShopId = (await parallelRepo.snapshot()).shops[0].id;
const attempts = await Promise.allSettled(Array.from({ length: 5 }, () => parallelRepo.castRecommendationVote(parallelShopId, 'demo-viewer')));
assert.equal(attempts.filter((entry) => entry.status === 'fulfilled').length, 1);
assert.equal((await parallelRepo.snapshot()).recommendationVotes.length, 1);

console.log('推荐票：每日基础票、奖励票、单店上限、周榜、重复奖励和身份校验均通过。');
