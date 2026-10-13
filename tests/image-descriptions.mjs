import assert from 'node:assert/strict';
import { LocalRepository } from '../src/repository.js';

const values = new Map();
const repo = new LocalRepository({ getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) });
await repo.saveCanteen({ actorId: 'demo-admin', campusId: 'campus-a', name: '图片测试食堂' });
const canteenId = (await repo.snapshot()).canteens[0].id;
await repo.saveShop({ actorId: 'demo-admin', canteenId, name: '图片测试店铺' });
const shopId = (await repo.snapshot()).shops[0].id;
const photo = 'data:image/png;base64,iVBORw0KGgo=';
const base = { actorId: 'demo-author', campusId: 'campus-a', canteenId, shopId, photo };

async function approve(input, decision = 'fixed') {
  await repo.submitContribution(input);
  const entry = (await repo.snapshot()).contributions[0];
  assert.equal(entry.photoDescription, String(input.photoDescription || '').trim());
  await repo.reviewContribution(entry.id, decision, '', 'demo-reviewer');
  return entry.id;
}

await approve({ ...base, type: 'canteen-photo', photoDescription: '  这是食堂门口的照片。  ' });
assert.equal((await repo.snapshot()).canteens[0].photos[0].description, '这是食堂门口的照片。');
await approve({ ...base, type: 'dish', title: '番茄面', price: '12', detail: '微辣', photoDescription: '这碗面刚出锅！' });
let state = await repo.snapshot();
const dishId = state.shops[0].dishes[0].id;
assert.equal(state.shops[0].photos[0].description, '这碗面刚出锅！');
assert.equal(state.shops[0].photos[0].ownerId, 'demo-author');
assert.equal(state.shops[0].photos[0].author, '发布人');
await approve({ ...base, type: 'photo', photoKind: 'storefront', photoDescription: '招牌在二楼入口。' });
assert.equal((await repo.snapshot()).shops[0].photos.at(-1).description, '招牌在二楼入口。');
const provisionalId = await approve({ ...base, type: 'photo', photoKind: 'dish', dishId, photoDescription: '另一份番茄口味。' }, 'provisional');
assert.equal((await repo.snapshot()).contributions.find((item) => item.id === provisionalId).photoDescription, '另一份番茄口味。');
await repo.fixProvisional(provisionalId, 'demo-reviewer');
assert.equal((await repo.snapshot()).shops[0].photos.at(-1).description, '另一份番茄口味。');
await approve({ ...base, type: 'photo', photoKind: 'storefront' });
assert.equal((await repo.snapshot()).shops[0].photos.at(-1).description, '');
await assert.rejects(repo.submitContribution({ ...base, type: 'canteen-photo', photoDescription: '字'.repeat(201) }), /200/);

await repo.savePhoto({ actorId: 'demo-admin', shopId, photoKind: 'storefront', photo, photoDescription: '管理员上传的门面。' });
state = await repo.snapshot();
const savedPhotoId = state.shops[0].photos.at(-1).id;
await repo.savePhoto({ actorId: 'demo-admin', id: savedPhotoId, shopId, photoKind: 'storefront' });
assert.equal((await repo.snapshot()).shops[0].photos.at(-1).description, '管理员上传的门面。');
await repo.savePhoto({ actorId: 'demo-admin', id: savedPhotoId, shopId, photoKind: 'storefront', photoDescription: '' });
assert.equal((await repo.snapshot()).shops[0].photos.at(-1).description, '');
await repo.saveCanteenPhoto({ actorId: 'demo-admin', canteenId, photo, photoDescription: '管理员拍摄的食堂。' });
assert.equal((await repo.snapshot()).canteens[0].photos.at(-1).description, '管理员拍摄的食堂。');
await repo.saveDish({ actorId: 'demo-admin', shopId, name: '管理员菜品', photo, photoDescription: '这份菜的照片。' });
assert.equal((await repo.snapshot()).shops[0].dishes.at(-1).photoDescription, '这份菜的照片。');
console.log('图片描述：选填、校验、审核员审批、暂示固定、图片归属与管理员编辑保留均通过。');
