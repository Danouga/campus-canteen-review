import { ApiRepository } from './api-repository.js';
import { screenComment } from './content-filter.js';

// The same domain operations run in browser preview mode or against a server-owned state.
const KEY = 'canteen-guide-mvp-v1';
export const initialState = () => ({
  campuses: [
    { id: 'campus-a', name: '校区一', note: '名称待设置' },
    { id: 'campus-b', name: '校区二', note: '名称待设置' }
  ],
  canteens: [], shops: [], contributions: [], comments: [], posts: [], reactions: []
});

const id = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const clone = (value) => structuredClone(value);
const editableFields = { canteen: ['name', 'location', 'hours'], shop: ['name', 'location', 'tags', 'category', 'lateHours'], dish: ['name', 'price', 'note'] };
const fieldLabels = { name: '名称', location: '位置', hours: '营业时间', tags: '新增标签', removeTags: '移除标签', category: '分类', lateHours: '延时关门', price: '价格', note: '说明' };
export function normalizeTags(value) {
  const parts = Array.isArray(value) ? value : String(value || '').split(/[,，、\n]+/);
  return [...new Set(parts.map((tag) => String(tag).trim()).filter(Boolean))].slice(0, 8).map((tag) => tag.slice(0, 20));
}
export const demoUsers = [
  { id: 'demo-author', name: '发布人', role: 'member' },
  { id: 'demo-viewer', name: '浏览人', role: 'member' },
  { id: 'demo-admin', name: '管理员', role: 'admin' }
];
function requireActor(actorId) {
  const actor = demoUsers.find((entry) => entry.id === actorId);
  if (!actor) throw new Error('请选择演示身份。');
  return actor;
}
function requireAdmin(actorId) {
  const actor = requireActor(actorId);
  if (actor.role !== 'admin') throw new Error('只有管理员可以审核。');
  return actor;
}

function read(storage) {
  try {
    const value = JSON.parse(storage.getItem(KEY));
    if (value && Array.isArray(value.campuses) && Array.isArray(value.canteens)) {
      value.posts ||= [];
      value.reactions ||= [];
      return value;
    }
  } catch { /* Invalid preview data resets to the empty state. */ }
  return initialState();
}

function write(data, storage) { storage.setItem(KEY, JSON.stringify(data)); }

function assertText(value, label, max = 120) {
  const text = String(value ?? '').trim();
  if (!text || text.length > max) throw new Error(`${label}需填写，且不超过 ${max} 字。`);
  return text;
}
function assertPhoto(value, required = false) {
  const photo = String(value || '');
  if (!photo && !required) return '';
  if (photo.length > 1_300_000 || !/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(photo)) throw new Error('请上传小于 900KB 的 JPG、PNG 或 WebP 图片。');
  return photo;
}

export class LocalRepository {
  constructor(storage = globalThis.localStorage) { this.storage = storage; }
  async snapshot() { return clone(read(this.storage)); }

  async submitContribution(input) {
    const data = read(this.storage);
    const type = input.type;
    let title = type === 'photo'
      ? input.photoKind === 'storefront' ? '店铺门面' : data.shops.find((entry) => entry.id === input.shopId)?.dishes.find((dish) => dish.id === input.dishId)?.name || ''
      : type === 'canteen-photo' ? '食堂照片' : type === 'field-update' ? '资料修改' : assertText(input.title, '名称');
    const actor = requireActor(input.actorId);
    const author = actor.name;
    const detail = String(input.detail || '').trim().slice(0, 600);
    if (input.photo) input.photo = assertPhoto(input.photo);
    if (!['canteen', 'shop', 'dish', 'hours', 'photo', 'shop-info', 'canteen-photo', 'field-update'].includes(type)) throw new Error('申请类型无效。');
    if (!data.campuses.some((campus) => campus.id === input.campusId)) throw new Error('请选择校区。');
    if (input.canteenId && !data.canteens.some((canteen) => canteen.id === input.canteenId)) throw new Error('食堂不存在。');
    if (input.shopId && !data.shops.some((shop) => shop.id === input.shopId)) throw new Error('店铺不存在。');
    const canteen = data.canteens.find((entry) => entry.id === input.canteenId);
    const shop = data.shops.find((entry) => entry.id === input.shopId);
    if (canteen && canteen.campusId !== input.campusId) throw new Error('食堂与校区不匹配。');
    if (shop && (!canteen || shop.canteenId !== canteen.id)) throw new Error('店铺与食堂不匹配。');
    if (['shop', 'dish', 'photo', 'hours', 'shop-info', 'canteen-photo', 'field-update'].includes(type) && !canteen) throw new Error('请选择食堂。');
    if (['dish', 'photo', 'shop-info'].includes(type) && !shop) throw new Error('请选择店铺。');
    if (type === 'canteen-photo') {
      if (!data.canteens.some((entry) => entry.id === input.canteenId && entry.status === 'active')) throw new Error('请选择食堂。');
      if (!input.photo) throw new Error('请选择图片。');
    }
    if (type === 'field-update') {
      const fields = editableFields[input.targetKind];
      const target = input.targetKind === 'canteen' ? data.canteens.find((entry) => entry.id === input.canteenId && entry.status === 'active')
        : input.targetKind === 'shop' ? data.shops.find((entry) => entry.id === input.shopId && entry.status === 'active')
        : data.shops.find((entry) => entry.id === input.shopId && entry.status === 'active')?.dishes.find((entry) => entry.id === input.dishId && entry.status !== 'archived');
      if (!fields || !target) throw new Error('要修改的资料不存在。');
      if (input.targetKind !== 'canteen' && !shop) throw new Error('请选择店铺。');
      const changes = input.changes || {};
      if (!Object.keys(changes).length || Object.keys(changes).some((field) => !fields.includes(field))) throw new Error('请选择要修改的条目。');
      const currentTags = input.targetKind === 'shop' ? normalizeTags(target.tags ?? target.category) : [];
      input.changes = Object.fromEntries(Object.entries(changes).map(([field, value]) => {
        if (field === 'tags') {
          const requested = normalizeTags(assertText(value, '新增标签', 120));
          const selected = requested.filter((tag) => !currentTags.includes(tag));
          if (!selected.length) throw new Error('没有可新增的标签。');
          if (field === 'tags' && currentTags.length + selected.length > 8) throw new Error('每家店铺最多保留 8 个标签。');
          return [field, selected];
        }
        return [field, assertText(value, fieldLabels[field], field === 'note' ? 200 : 120)];
      }));
      title = `${target.name || (input.targetKind === 'canteen' ? '食堂' : '店铺')} · ${Object.keys(input.changes).map((field) => fieldLabels[field]).join('、')}修改`;
    }
    if (type === 'photo') {
      const shop = data.shops.find((entry) => entry.id === input.shopId);
      if (!shop || shop.status !== 'active') throw new Error('请选择店铺。');
      if (!['dish', 'storefront'].includes(input.photoKind)) throw new Error('请选择图片类型。');
      if (input.photoKind === 'dish' && !shop.dishes.some((dish) => dish.id === input.dishId && dish.status !== 'archived')) throw new Error('请选择要展示的菜品。');
      if (!input.photo) throw new Error('请选择图片。');
    }
    data.contributions.unshift({ id: id(), ...input, title, detail, author, ownerId: actor.id, status: 'pending', submittedAt: new Date().toISOString(), reviewedAt: null, reviewNote: '', notificationReadAt: null, expiresAt: null });
    write(data, this.storage);
  }

  async reviewContribution(contributionId, decision, note = '', actorId) {
    requireAdmin(actorId);
    const data = read(this.storage);
    const item = data.contributions.find((entry) => entry.id === contributionId);
    if (!item || item.status !== 'pending') throw new Error('申请不存在或已处理。');
    if (!['provisional', 'fixed', 'rejected'].includes(decision)) throw new Error('审核决定无效。');
    item.reviewedAt = new Date().toISOString();
    item.notificationReadAt = null;
    item.reviewNote = String(note).trim().slice(0, 200);
    item.status = decision;
    if (decision === 'provisional') {
      item.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    } else if (decision === 'fixed') {
      applyContribution(data, item);
    }
    write(data, this.storage);
  }

  async fixProvisional(contributionId, actorId) {
    requireAdmin(actorId);
    const data = read(this.storage);
    const item = data.contributions.find((entry) => entry.id === contributionId);
    if (!item || item.status !== 'provisional') throw new Error('暂示申请不存在。');
    if (new Date(item.expiresAt).getTime() <= Date.now()) throw new Error('暂示已到期，请刷新页面。');
    applyContribution(data, item);
    item.status = 'fixed';
    item.reviewedAt = new Date().toISOString();
    item.notificationReadAt = null;
    write(data, this.storage);
  }

  async revokeProvisional(contributionId, actorId) {
    requireAdmin(actorId);
    const data = read(this.storage);
    const item = data.contributions.find((entry) => entry.id === contributionId);
    if (!item || item.status !== 'provisional') throw new Error('暂示申请不存在。');
    item.status = 'rejected'; item.reviewedAt = new Date().toISOString();
    item.reviewNote = '管理员提前撤销暂示';
    item.notificationReadAt = null;
    write(data, this.storage);
  }

  async expireProvisional() {
    const data = read(this.storage);
    let changed = false;
    for (const item of data.contributions) {
      if (item.status === 'provisional' && new Date(item.expiresAt).getTime() <= Date.now()) {
        item.status = 'expired'; item.notificationReadAt = null; changed = true;
      }
    }
    if (changed) write(data, this.storage);
    return changed;
  }

  async markReviewMessageRead(contributionId, actorId) {
    const data = read(this.storage);
    const item = data.contributions.find((entry) => entry.id === contributionId && entry.ownerId === actorId && entry.status !== 'pending');
    if (!item) throw new Error('审核消息不存在。');
    item.notificationReadAt = new Date().toISOString();
    write(data, this.storage);
  }

  async saveCampus(campusId, name) {
    const data = read(this.storage);
    const campus = data.campuses.find((entry) => entry.id === campusId);
    if (!campus) throw new Error('校区不存在。');
    campus.name = assertText(name, '校区名称', 40);
    campus.note = '';
    write(data, this.storage);
  }

  async saveCanteen(input) {
    const data = read(this.storage);
    const name = assertText(input.name, '食堂名称', 60);
    if (!data.campuses.some((entry) => entry.id === input.campusId)) throw new Error('校区不存在。');
    const existing = input.id && data.canteens.find((entry) => entry.id === input.id);
    const value = { id: existing?.id || id(), campusId: input.campusId, name, location: String(input.location || '').trim().slice(0, 120), hours: String(input.hours || '').trim().slice(0, 120), photos: existing?.photos || [], status: 'active', updatedAt: new Date().toISOString() };
    if (existing) Object.assign(existing, value); else data.canteens.push(value);
    write(data, this.storage);
  }

  async saveShop(input) {
    const data = read(this.storage);
    const name = assertText(input.name, '店铺名称', 60);
    if (!data.canteens.some((entry) => entry.id === input.canteenId && entry.status === 'active')) throw new Error('请选择可用食堂。');
    const existing = input.id && data.shops.find((entry) => entry.id === input.id);
    const value = { id: existing?.id || id(), canteenId: input.canteenId, name, tags: normalizeTags(input.tags ?? input.category ?? existing?.tags ?? existing?.category), location: String(input.location || '').trim().slice(0, 120), lateHours: String(input.lateHours || '').trim().slice(0, 120), dishes: existing?.dishes || [], photos: existing?.photos || [], status: 'active', updatedAt: new Date().toISOString() };
    if (existing) Object.assign(existing, value); else data.shops.push(value);
    write(data, this.storage);
  }

  async removeEntry(kind, entryId) {
    const data = read(this.storage);
    const collection = kind === 'shop' ? data.shops : kind === 'canteen' ? data.canteens : null;
    const entry = collection?.find((value) => value.id === entryId);
    if (!entry) throw new Error('资料不存在。');
    entry.status = 'archived';
    entry.updatedAt = new Date().toISOString();
    if (kind === 'canteen') data.shops.filter((shop) => shop.canteenId === entryId).forEach((shop) => { shop.status = 'archived'; });
    write(data, this.storage);
  }

  async restoreEntry(kind, entryId) {
    const data = read(this.storage);
    const collection = kind === 'shop' ? data.shops : kind === 'canteen' ? data.canteens : null;
    const entry = collection?.find((value) => value.id === entryId && value.status === 'archived');
    if (!entry) throw new Error('已下架资料不存在。');
    if (kind === 'shop' && !data.canteens.some((canteen) => canteen.id === entry.canteenId && canteen.status === 'active')) throw new Error('请先恢复所属食堂。');
    entry.status = 'active'; entry.updatedAt = new Date().toISOString();
    write(data, this.storage);
  }

  async saveDish(input) {
    const data = read(this.storage);
    const shop = data.shops.find((entry) => entry.id === input.shopId && entry.status === 'active');
    if (!shop) throw new Error('店铺不存在。');
    const existing = input.id && shop.dishes.find((entry) => entry.id === input.id);
    const value = { id: existing?.id || id(), name: assertText(input.name, '菜品名称', 60), price: String(input.price || '').trim().slice(0, 20), note: String(input.note || '').trim().slice(0, 200), photo: input.photo ? assertPhoto(input.photo) : existing?.photo || '', photoOwnerId: input.photo ? requireAdmin(input.actorId).id : existing?.photoOwnerId || null, status: 'active' };
    if (existing) Object.assign(existing, value); else shop.dishes.push(value);
    shop.updatedAt = new Date().toISOString(); write(data, this.storage);
  }

  async savePhoto(input) {
    const data = read(this.storage);
    const shop = data.shops.find((entry) => entry.id === input.shopId && entry.status === 'active');
    if (!shop) throw new Error('店铺不存在。');
    const existing = input.id && shop.photos.find((entry) => entry.id === input.id);
    const photoKind = input.photoKind || 'dish';
    const dish = shop.dishes.find((entry) => entry.id === input.dishId && entry.status !== 'archived');
    if (!['dish', 'storefront'].includes(photoKind)) throw new Error('请选择图片类型。');
    if (photoKind === 'dish' && !dish) throw new Error('请选择菜品。');
    const url = input.photo ? assertPhoto(input.photo) : existing?.url;
    if (!url) throw new Error('请选择图片。');
    const value = { id: existing?.id || id(), photoKind, dishId: photoKind === 'dish' ? dish.id : null, caption: photoKind === 'dish' ? dish.name : '店铺门面', url, ownerId: input.photo ? requireAdmin(input.actorId).id : existing?.ownerId || null, status: 'active' };
    if (existing) Object.assign(existing, value); else shop.photos.push(value);
    shop.updatedAt = new Date().toISOString(); write(data, this.storage);
  }

  async saveCanteenPhoto(input) {
    const data = read(this.storage);
    const canteen = data.canteens.find((entry) => entry.id === input.canteenId && entry.status === 'active');
    if (!canteen) throw new Error('食堂不存在。');
    canteen.photos ||= [];
    const existing = input.id && canteen.photos.find((entry) => entry.id === input.id);
    const url = input.photo ? assertPhoto(input.photo) : existing?.url;
    if (!url) throw new Error('请选择图片。');
    const value = { id: existing?.id || id(), url, caption: '食堂照片', ownerId: input.photo ? requireAdmin(input.actorId).id : existing?.ownerId || null, status: 'active' };
    if (existing) Object.assign(existing, value); else canteen.photos.push(value);
    canteen.updatedAt = new Date().toISOString(); write(data, this.storage);
  }

  async removeCanteenPhoto(canteenId, photoId) {
    const data = read(this.storage);
    const canteen = data.canteens.find((entry) => entry.id === canteenId);
    const photo = canteen?.photos?.find((entry) => entry.id === photoId);
    if (!photo) throw new Error('图片不存在。');
    photo.status = 'archived'; canteen.updatedAt = new Date().toISOString(); write(data, this.storage);
  }

  async removeShopContent(kind, shopId, entryId) {
    const data = read(this.storage);
    const shop = data.shops.find((entry) => entry.id === shopId);
    const collection = kind === 'dish' ? shop?.dishes : kind === 'photo' ? shop?.photos : null;
    const entry = collection?.find((value) => value.id === entryId);
    if (!entry) throw new Error('资料不存在。');
    entry.status = 'archived'; shop.updatedAt = new Date().toISOString(); write(data, this.storage);
  }

  async addComment(targetKind, targetId, actorId, body) {
    const data = read(this.storage);
    const actor = requireActor(actorId);
    const shop = targetKind === 'shop' ? data.shops.find((entry) => entry.id === targetId && entry.status === 'active')
      : targetKind === 'dish' ? data.shops.find((entry) => entry.status === 'active' && entry.dishes.some((dish) => dish.id === targetId && dish.status !== 'archived'))
      : targetKind === 'post' ? data.shops.find((entry) => entry.status === 'active' && data.posts.some((post) => post.id === targetId && post.shopId === entry.id && post.status !== 'archived')) : null;
    if (!shop) throw new Error('评论目标不存在。');
    const screening = screenComment(body);
    if (!screening.allowed) throw new Error(screening.reason);
    data.comments.unshift({ id: id(), targetKind, targetId, shopId: shop.id, ownerId: actor.id, author: actor.name, body: assertText(body, '评论', 500), status: 'active', createdAt: new Date().toISOString() });
    write(data, this.storage);
  }

  async submitPost(input) {
    const data = read(this.storage);
    const actor = requireActor(input.actorId);
    if (!data.shops.some((shop) => shop.id === input.shopId && shop.status === 'active')) throw new Error('请选择已收录的店铺。');
    const screening = screenComment(`${input.title} ${input.body}`);
    if (!screening.allowed) throw new Error(screening.reason);
    data.posts.unshift({ id: id(), shopId: input.shopId, ownerId: actor.id, author: actor.name, title: assertText(input.title, '帖子标题', 80), body: assertText(input.body, '帖子内容', 5000), contentHtml: String(input.contentHtml || '').slice(0, 4_000_000), photo: input.photo ? assertPhoto(input.photo) : '', status: 'active', createdAt: new Date().toISOString() });
    write(data, this.storage);
  }

  async setReaction(targetKind, targetId, actorId, stance) {
    const actor = requireActor(actorId);
    if (!['agree', 'disagree'].includes(stance)) throw new Error('请选择赞同或反对。');
    const data = read(this.storage);
    const collection = targetKind === 'comment' ? data.comments : targetKind === 'post' ? data.posts : targetKind === 'contribution' ? data.contributions : null;
    const item = collection?.find((entry) => entry.id === targetId);
    if (!item || (targetKind === 'contribution' ? item.status !== 'provisional' : item.status === 'archived' || item.status === 'hidden')) throw new Error('这条内容暂时不能表态。');
    if (item.ownerId === actor.id) throw new Error('不能给自己发布的内容表态。');
    const existing = data.reactions.find((entry) => entry.targetKind === targetKind && entry.targetId === targetId && entry.actorId === actor.id);
    if (existing) {
      if (existing.stance === stance) data.reactions.splice(data.reactions.indexOf(existing), 1);
      else { existing.stance = stance; existing.updatedAt = new Date().toISOString(); }
    } else data.reactions.push({ targetKind, targetId, actorId: actor.id, stance, updatedAt: new Date().toISOString() });
    write(data, this.storage);
  }

  async deleteOwnContent(kind, entryId, actorId) {
    requireActor(actorId);
    const data = read(this.storage);
    let entry;
    if (kind === 'comment') entry = data.comments.find((item) => item.id === entryId);
    if (kind === 'post') entry = data.posts.find((item) => item.id === entryId);
    if (kind === 'photo') {
      for (const canteen of data.canteens) entry ||= canteen.photos?.find((item) => item.id === entryId);
      for (const shop of data.shops) entry ||= shop.photos?.find((item) => item.id === entryId);
    }
    if (!entry || entry.status === 'archived') throw new Error('内容不存在或已删除。');
    if (entry.ownerId !== actorId) throw new Error('只能删除自己发布的内容。');
    entry.status = 'archived';
    entry.deletedAt = new Date().toISOString();
    write(data, this.storage);
  }

  async resetPreview() { this.storage.removeItem(KEY); }
}

function applyContribution(data, item) {
  const now = new Date().toISOString();
  if (item.type === 'canteen') {
    data.canteens.push({ id: id(), campusId: item.campusId, name: item.title, location: item.detail, hours: item.hours || '', photos: [], status: 'active', updatedAt: now });
    return;
  }
  if (item.type === 'canteen-photo') {
    const canteen = data.canteens.find((entry) => entry.id === item.canteenId && entry.status === 'active');
    if (!canteen) throw new Error('对应食堂不存在。');
    canteen.photos ||= [];
    canteen.photos.push({ id: id(), url: item.photo, caption: '食堂照片', ownerId: item.ownerId || null, status: 'active' });
    canteen.updatedAt = now;
    return;
  }
  if (item.type === 'field-update') {
    const target = item.targetKind === 'canteen' ? data.canteens.find((entry) => entry.id === item.canteenId && entry.status === 'active')
      : item.targetKind === 'shop' ? data.shops.find((entry) => entry.id === item.shopId && entry.status === 'active')
      : data.shops.find((entry) => entry.id === item.shopId && entry.status === 'active')?.dishes.find((entry) => entry.id === item.dishId && entry.status !== 'archived');
    if (!target) throw new Error('对应资料不存在。');
    const { tags, removeTags, ...ordinaryChanges } = item.changes;
    Object.assign(target, ordinaryChanges);
    if (item.targetKind === 'shop' && (tags || removeTags)) {
      const currentTags = normalizeTags(target.tags ?? target.category);
      target.tags = normalizeTags([...currentTags.filter((tag) => !removeTags?.includes(tag)), ...(tags || [])]);
    }
    if (item.targetKind === 'shop' && item.changes.category !== undefined) target.tags = normalizeTags(item.changes.category);
    target.updatedAt = now;
    return;
  }
  if (item.type === 'shop') {
    if (!data.canteens.some((entry) => entry.id === item.canteenId && entry.status === 'active')) throw new Error('对应食堂不存在，请先补充食堂。');
    data.shops.push({ id: id(), canteenId: item.canteenId, name: item.title, tags: normalizeTags(item.tags ?? item.category), location: item.detail, lateHours: '', dishes: [], photos: [], status: 'active', updatedAt: now });
    return;
  }
  if (item.type === 'hours') {
    const canteen = data.canteens.find((entry) => entry.id === item.canteenId && entry.status === 'active');
    if (!canteen) throw new Error('食堂不存在。');
    canteen.hours = item.detail;
    canteen.updatedAt = now;
    return;
  }
  const shop = data.shops.find((entry) => entry.id === item.shopId && entry.status === 'active');
  if (!shop) throw new Error('店铺不存在。');
  if (item.type === 'dish') {
    const dishId = id();
    shop.dishes.push({ id: dishId, name: item.title, price: item.price || '', note: item.detail, photo: '', status: 'active' });
    if (item.photo) shop.photos.push({ id: id(), photoKind: 'dish', dishId, url: item.photo, caption: item.title, ownerId: item.ownerId || null, status: 'active' });
  }
  if (item.type === 'photo') {
    const photoKind = item.photoKind || 'dish';
    const dish = shop.dishes.find((entry) => entry.id === item.dishId && entry.status !== 'archived');
    if (photoKind === 'dish' && !dish) throw new Error('对应菜品不存在。');
    shop.photos.push({ id: id(), photoKind, dishId: photoKind === 'dish' ? dish.id : null, url: item.photo || '', caption: photoKind === 'dish' ? dish.name : '店铺门面', ownerId: item.ownerId || null, status: 'active' });
  }
  if (item.type === 'shop-info') {
    if (item.field === 'lateHours') shop.lateHours = item.detail;
    else if (item.field === 'category') shop.tags = normalizeTags(item.detail);
    else shop.location = item.detail;
  }
  shop.updatedAt = now;
}

export function createRepository() { return new ApiRepository(new LocalRepository()); }

