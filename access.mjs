import { AuthError } from './auth.mjs';
import { canReview, recommendationPeriod } from './src/repository.js';

export function bindActor(method, args, user) {
  if (method === 'expireProvisional') return [];
  if (!user) throw new AuthError('请先登录再进行操作。', 401);
  const admin = ['saveCampus', 'saveCanteen', 'saveShop', 'saveDish', 'savePhoto', 'saveCanteenPhoto', 'removeEntry', 'restoreEntry', 'removeCanteenPhoto', 'removeShopContent', 'resetPreview'];
  const review = ['reviewContribution', 'fixProvisional', 'revokeProvisional', 'moderateContent', 'resolveContested'];
  if (admin.includes(method) && user.role !== 'admin' || review.includes(method) && !canReview(user)) throw new AuthError('当前账户没有此操作权限。', 403);
  if (!Array.isArray(args)) throw new AuthError('操作参数无效。');
  const result = structuredClone(args);
  if (['submitContribution', 'submitPost', 'saveCanteen', 'saveShop', 'saveDish', 'savePhoto', 'saveCanteenPhoto'].includes(method)) result[0] = { ...result[0], actorId: user.id };
  else {
    const slots = { reviewContribution: 3, fixProvisional: 1, revokeProvisional: 1, saveCampus: 2, removeEntry: 2, restoreEntry: 2, removeCanteenPhoto: 2, removeShopContent: 3, addComment: 2, setReaction: 2, castRecommendationVote: 1, moderateContent: 3, resolveContested: 2, deleteOwnContent: 2, markMessageRead: 1, markAllMessagesRead: 0, markReviewMessageRead: 1, markAllReviewMessagesRead: 0, resetPreview: 0 };
    if (!(method in slots)) throw new AuthError('操作无效。');
    result[slots[method]] = user.id;
  }
  return result;
}

export function visibleState(data, user) {
  const value = structuredClone(data);
  const week = recommendationPeriod().week;
  const counts = new Map();
  for (const vote of data.recommendationVotes || []) if (vote.week === week) counts.set(vote.shopId, (counts.get(vote.shopId) || 0) + 1);
  value.weeklyVoteCounts = [...counts].map(([shopId, count]) => ({ shopId, count }));
  value.messageReadReceipts = (value.messageReadReceipts || []).filter(entry => entry.ownerId === user?.id);
  value.recommendationVotes = value.recommendationVotes.filter((entry) => entry.actorId === user?.id);
  value.recommendationRewards = value.recommendationRewards.filter((entry) => entry.ownerId === user?.id);
  if (!canReview(user)) {
    value.contributions = value.contributions.filter((entry) => entry.ownerId === user?.id || ['provisional', 'fixed', 'contested'].includes(entry.status));
    for (const entry of value.contributions) if (entry.ownerId !== user?.id) { delete entry.reviewNote; delete entry.notificationReadAt; }
    for (const key of ['comments', 'posts']) value[key] = value[key].filter((entry) => entry.status !== 'archived' || entry.ownerId === user?.id).map((entry) => entry.status === 'hidden' && entry.ownerId !== user?.id ? { ...entry, body: '', contentHtml: '', photo: '' } : entry);
  }
  return value;
}
