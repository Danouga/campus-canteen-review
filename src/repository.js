// Every method returns a Promise. Replace the adapter with an API-backed implementation later.
const KEY = 'canteen-guide-mvp-v1';
const initial = () => ({
  campuses: [
    { id: 'campus-a', name: '校区一', note: '名称待设置' },
    { id: 'campus-b', name: '校区二', note: '名称待设置' }
  ],
  canteens: [], shops: [], contributions: [], comments: []
});

const id = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const clone = (value) => structuredClone(value);

function read() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY));
    if (value && Array.isArray(value.campuses) && Array.isArray(value.canteens)) return value;
  } catch { /* Invalid preview data resets to the empty state. */ }
  return initial();
}

function write(data) { localStorage.setItem(KEY, JSON.stringify(data)); }

function assertText(value, label, max = 120) {
  const text = String(value ?? '').trim();
  if (!text || text.length > max) throw new Error(`${label}需填写，且不超过 ${max} 字。`);
  return text;
}

export class LocalRepository {
  async snapshot() { return clone(read()); }

  async submitContribution(input) {
    const data = read();
    const title = assertText(input.title, '名称');
    const author = assertText(input.author, '提交人昵称', 30);
    const detail = String(input.detail || '').trim().slice(0, 600);
    const type = input.type;
    if (!['canteen', 'shop', 'dish', 'hours', 'photo', 'shop-info'].includes(type)) throw new Error('申请类型无效。');
    if (!data.campuses.some((campus) => campus.id === input.campusId)) throw new Error('请选择校区。');
    if (input.canteenId && !data.canteens.some((canteen) => canteen.id === input.canteenId)) throw new Error('食堂不存在。');
    if (input.shopId && !data.shops.some((shop) => shop.id === input.shopId)) throw new Error('店铺不存在。');
    data.contributions.unshift({ id: id(), ...input, title, detail, author, status: 'pending', submittedAt: new Date().toISOString(), reviewedAt: null, reviewNote: '', expiresAt: null });
    write(data);
  }

  async reviewContribution(contributionId, decision, note = '') {
    const data = read();
    const item = data.contributions.find((entry) => entry.id === contributionId);
    if (!item || item.status !== 'pending') throw new Error('申请不存在或已处理。');
    if (!['provisional', 'fixed', 'rejected'].includes(decision)) throw new Error('审核决定无效。');
    item.reviewedAt = new Date().toISOString();
    item.reviewNote = String(note).trim().slice(0, 200);
    item.status = decision;
    if (decision === 'provisional') {
      item.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    } else if (decision === 'fixed') {
      applyContribution(data, item);
    }
    write(data);
  }

  async fixProvisional(contributionId) {
    const data = read();
    const item = data.contributions.find((entry) => entry.id === contributionId);
    if (!item || item.status !== 'provisional') throw new Error('暂示申请不存在。');
    if (new Date(item.expiresAt).getTime() <= Date.now()) throw new Error('暂示已到期，请刷新页面。');
    applyContribution(data, item);
    item.status = 'fixed';
    item.reviewedAt = new Date().toISOString();
    write(data);
  }

  async revokeProvisional(contributionId) {
    const data = read();
    const item = data.contributions.find((entry) => entry.id === contributionId);
    if (!item || item.status !== 'provisional') throw new Error('暂示申请不存在。');
    item.status = 'rejected'; item.reviewedAt = new Date().toISOString();
    item.reviewNote = '管理员提前撤销暂示';
    write(data);
  }

  async expireProvisional() {
    const data = read();
    let changed = false;
    for (const item of data.contributions) {
      if (item.status === 'provisional' && new Date(item.expiresAt).getTime() <= Date.now()) {
        item.status = 'expired'; changed = true;
      }
    }
    if (changed) write(data);
    return changed;
  }

  async saveCampus(campusId, name) {
    const data = read();
    const campus = data.campuses.find((entry) => entry.id === campusId);
    if (!campus) throw new Error('校区不存在。');
    campus.name = assertText(name, '校区名称', 40);
    campus.note = '';
    write(data);
  }

  async saveCanteen(input) {
    const data = read();
    const name = assertText(input.name, '食堂名称', 60);
    if (!data.campuses.some((entry) => entry.id === input.campusId)) throw new Error('校区不存在。');
    const existing = input.id && data.canteens.find((entry) => entry.id === input.id);
    const value = { id: existing?.id || id(), campusId: input.campusId, name, location: String(input.location || '').trim().slice(0, 120), hours: String(input.hours || '').trim().slice(0, 120), status: 'active', updatedAt: new Date().toISOString() };
    if (existing) Object.assign(existing, value); else data.canteens.push(value);
    write(data);
  }

  async saveShop(input) {
    const data = read();
    const name = assertText(input.name, '店铺名称', 60);
    if (!data.canteens.some((entry) => entry.id === input.canteenId && entry.status === 'active')) throw new Error('请选择可用食堂。');
    const existing = input.id && data.shops.find((entry) => entry.id === input.id);
    const value = { id: existing?.id || id(), canteenId: input.canteenId, name, category: String(input.category || '').trim().slice(0, 40), location: String(input.location || '').trim().slice(0, 120), lateHours: String(input.lateHours || '').trim().slice(0, 120), dishes: existing?.dishes || [], photos: existing?.photos || [], status: 'active', updatedAt: new Date().toISOString() };
    if (existing) Object.assign(existing, value); else data.shops.push(value);
    write(data);
  }

  async removeEntry(kind, entryId) {
    const data = read();
    const collection = kind === 'shop' ? data.shops : kind === 'canteen' ? data.canteens : null;
    const entry = collection?.find((value) => value.id === entryId);
    if (!entry) throw new Error('资料不存在。');
    entry.status = 'archived';
    entry.updatedAt = new Date().toISOString();
    if (kind === 'canteen') data.shops.filter((shop) => shop.canteenId === entryId).forEach((shop) => { shop.status = 'archived'; });
    write(data);
  }

  async restoreEntry(kind, entryId) {
    const data = read();
    const collection = kind === 'shop' ? data.shops : kind === 'canteen' ? data.canteens : null;
    const entry = collection?.find((value) => value.id === entryId && value.status === 'archived');
    if (!entry) throw new Error('已下架资料不存在。');
    if (kind === 'shop' && !data.canteens.some((canteen) => canteen.id === entry.canteenId && canteen.status === 'active')) throw new Error('请先恢复所属食堂。');
    entry.status = 'active'; entry.updatedAt = new Date().toISOString();
    write(data);
  }

  async saveDish(input) {
    const data = read();
    const shop = data.shops.find((entry) => entry.id === input.shopId && entry.status === 'active');
    if (!shop) throw new Error('店铺不存在。');
    const existing = input.id && shop.dishes.find((entry) => entry.id === input.id);
    const value = { id: existing?.id || id(), name: assertText(input.name, '菜品名称', 60), price: String(input.price || '').trim().slice(0, 20), note: String(input.note || '').trim().slice(0, 200), status: 'active' };
    if (existing) Object.assign(existing, value); else shop.dishes.push(value);
    shop.updatedAt = new Date().toISOString(); write(data);
  }

  async savePhoto(input) {
    const data = read();
    const shop = data.shops.find((entry) => entry.id === input.shopId && entry.status === 'active');
    if (!shop) throw new Error('店铺不存在。');
    const existing = input.id && shop.photos.find((entry) => entry.id === input.id);
    const url = input.photo || existing?.url;
    if (!url) throw new Error('请选择图片。');
    const value = { id: existing?.id || id(), caption: assertText(input.caption, '图片说明', 80), url, status: 'active' };
    if (existing) Object.assign(existing, value); else shop.photos.push(value);
    shop.updatedAt = new Date().toISOString(); write(data);
  }

  async removeShopContent(kind, shopId, entryId) {
    const data = read();
    const shop = data.shops.find((entry) => entry.id === shopId);
    const collection = kind === 'dish' ? shop?.dishes : kind === 'photo' ? shop?.photos : null;
    const entry = collection?.find((value) => value.id === entryId);
    if (!entry) throw new Error('资料不存在。');
    entry.status = 'archived'; shop.updatedAt = new Date().toISOString(); write(data);
  }

  async addComment(shopId, author, body) {
    const data = read();
    if (!data.shops.some((shop) => shop.id === shopId && shop.status === 'active')) throw new Error('店铺不存在。');
    data.comments.unshift({ id: id(), shopId, author: assertText(author, '昵称', 30), body: assertText(body, '评论', 500), createdAt: new Date().toISOString() });
    write(data);
  }

  async resetPreview() { localStorage.removeItem(KEY); }
}

function applyContribution(data, item) {
  const now = new Date().toISOString();
  if (item.type === 'canteen') {
    data.canteens.push({ id: id(), campusId: item.campusId, name: item.title, location: item.detail, hours: item.hours || '', status: 'active', updatedAt: now });
    return;
  }
  if (item.type === 'shop') {
    if (!data.canteens.some((entry) => entry.id === item.canteenId && entry.status === 'active')) throw new Error('对应食堂不存在，请先补充食堂。');
    data.shops.push({ id: id(), canteenId: item.canteenId, name: item.title, category: item.category || '', location: item.detail, lateHours: '', dishes: [], photos: [], status: 'active', updatedAt: now });
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
  if (item.type === 'dish') shop.dishes.push({ id: id(), name: item.title, price: item.price || '', note: item.detail, status: 'active' });
  if (item.type === 'photo') shop.photos.push({ id: id(), url: item.photo || '', caption: item.title, status: 'active' });
  if (item.type === 'shop-info') {
    if (item.field === 'lateHours') shop.lateHours = item.detail;
    else if (item.field === 'category') shop.category = item.detail;
    else shop.location = item.detail;
  }
  shop.updatedAt = now;
}

export function createRepository() { return new LocalRepository(); }
