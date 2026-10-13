import assert from 'node:assert/strict';
import { LocalRepository } from '../src/repository.js';

const values = new Map();
const storage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
const repo = new LocalRepository(storage);
const snapshot = () => repo.snapshot();

await repo.saveCanteen({ actorId: 'demo-admin', campusId: 'campus-a', name: '一餐' });
let data = await snapshot();
const canteenId = data.canteens[0].id;
await repo.saveShop({ actorId: 'demo-admin', canteenId, name: '面馆' });
data = await snapshot();
const shopId = data.shops[0].id;
await repo.saveDish({ shopId, name: '牛肉面', actorId: 'demo-admin' });
data = await snapshot();
const dishId = data.shops[0].dishes[0].id;
const context = { campusId: 'campus-a', canteenId, shopId, actorId: 'demo-author', type: 'status-update' };

await repo.submitContribution({ ...context, targetKind: 'shop', requestedStatus: 'temporarily_closed' });
data = await snapshot();
const shopRequest = data.contributions[0].id;
await repo.reviewContribution(shopRequest, 'provisional', '', 'demo-admin');
assert.equal((await snapshot()).shops[0].availability, 'open');
await repo.fixProvisional(shopRequest, 'demo-admin');
assert.equal((await snapshot()).shops[0].availability, 'temporarily_closed');

await repo.submitContribution({ ...context, targetKind: 'shop', requestedStatus: 'unlisted' });
data = await snapshot();
await repo.reviewContribution(data.contributions[0].id, 'fixed', '', 'demo-admin');
assert.equal((await snapshot()).shops[0].availability, 'unlisted');
await repo.saveShop({ actorId: 'demo-admin', id: shopId, canteenId, name: '面馆（更新）' });
assert.equal((await snapshot()).shops[0].availability, 'unlisted');

await repo.submitContribution({ ...context, targetKind: 'dish', dishId, requestedStatus: 'unlisted' });
data = await snapshot();
const dishRequest = data.contributions[0].id;
await repo.reviewContribution(dishRequest, 'fixed', '', 'demo-admin');
assert.equal((await snapshot()).shops[0].dishes[0].availability, 'unlisted');
await repo.saveDish({ id: dishId, shopId, name: '牛肉面（更新）', actorId: 'demo-admin' });
assert.equal((await snapshot()).shops[0].dishes[0].availability, 'unlisted');
await assert.rejects(repo.submitContribution({ ...context, targetKind: 'dish', dishId, requestedStatus: 'wrong' }), /状态/);
console.log('Shop and dish status review, provisional display, and editing persistence passed.');
