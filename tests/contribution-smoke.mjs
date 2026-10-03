import assert from 'node:assert/strict';
import { LocalRepository } from '../src/repository.js';

const values = new Map();
const storage = {
  getItem: (key) => values.get(key) || null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
};
const repo = new LocalRepository(storage);
await repo.saveCanteen({ campusId: 'campus-a', name: '测试食堂' });
let state = await repo.snapshot();
const canteenId = state.canteens[0].id;
await repo.saveShop({ canteenId, name: '测试店铺' });
state = await repo.snapshot();
const shopId = state.shops[0].id;
await repo.saveDish({ shopId, name: '番茄口味' });
state = await repo.snapshot();
const dishId = state.shops[0].dishes[0].id;
const base = { campusId: 'campus-a', canteenId, shopId, author: '测试用户' };

await repo.submitContribution({ ...base, type: 'field-update', targetKind: 'canteen', changes: { hours: '每天 07:00–20:00' } });
state = await repo.snapshot();
assert.equal(state.contributions[0].canteenId, canteenId);
await repo.reviewContribution(state.contributions[0].id, 'fixed');
state = await repo.snapshot();
assert.equal(state.canteens[0].hours, '每天 07:00–20:00');

await repo.submitContribution({ ...base, dishId, type: 'field-update', targetKind: 'dish', changes: { price: '12', note: '微辣' } });
state = await repo.snapshot();
await repo.reviewContribution(state.contributions[0].id, 'fixed');
state = await repo.snapshot();
assert.equal(state.shops[0].dishes[0].price, '12');
assert.equal(state.shops[0].dishes[0].note, '微辣');

const photo = 'data:image/png;base64,iVBORw0KGgo=';
await repo.submitContribution({ ...base, type: 'canteen-photo', photo });
state = await repo.snapshot();
await repo.reviewContribution(state.contributions[0].id, 'fixed');
state = await repo.snapshot();
assert.equal(state.canteens[0].photos.length, 1);
await repo.removeCanteenPhoto(canteenId, state.canteens[0].photos[0].id);
state = await repo.snapshot();
assert.equal(state.canteens[0].photos[0].status, 'archived');

await assert.rejects(
  repo.submitContribution({ ...base, campusId: 'campus-b', type: 'field-update', targetKind: 'shop', changes: { location: '二楼' } }),
  /不匹配/
);
console.log('Selective contributions and canteen photos passed.');
