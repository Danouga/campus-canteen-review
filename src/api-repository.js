// The browser never receives MySQL credentials. A loopback-only server owns the connection.
export class ApiRepository {
  constructor(localRepository) { this.local = localRepository; this.modePromise = null; }

  async mode() {
    if (!this.modePromise) this.modePromise = fetch('/api/status').then((response) => response.ok ? response.json() : { mode: 'local' }).then((value) => value.mode);
    return this.modePromise;
  }

  async request(path, options) {
    const response = await fetch(path, options);
    const value = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(value.error || `请求失败（${response.status}）。`);
    return value;
  }

  async snapshot() {
    if (await this.mode() === 'local') return this.local.snapshot();
    return (await this.request('/api/state')).data;
  }

  async invoke(method, ...args) {
    if (await this.mode() === 'local') return this.local[method](...args);
    return (await this.request('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method, args }) })).result;
  }

  submitContribution(input) { return this.invoke('submitContribution', input); }
  reviewContribution(id, decision, note) { return this.invoke('reviewContribution', id, decision, note); }
  fixProvisional(id) { return this.invoke('fixProvisional', id); }
  revokeProvisional(id) { return this.invoke('revokeProvisional', id); }
  expireProvisional() { return this.invoke('expireProvisional'); }
  saveCampus(id, name) { return this.invoke('saveCampus', id, name); }
  saveCanteen(input) { return this.invoke('saveCanteen', input); }
  saveShop(input) { return this.invoke('saveShop', input); }
  removeEntry(kind, id) { return this.invoke('removeEntry', kind, id); }
  restoreEntry(kind, id) { return this.invoke('restoreEntry', kind, id); }
  saveDish(input) { return this.invoke('saveDish', input); }
  savePhoto(input) { return this.invoke('savePhoto', input); }
  saveCanteenPhoto(input) { return this.invoke('saveCanteenPhoto', input); }
  removeCanteenPhoto(canteenId, photoId) { return this.invoke('removeCanteenPhoto', canteenId, photoId); }
  removeShopContent(kind, shopId, id) { return this.invoke('removeShopContent', kind, shopId, id); }
  addComment(shopId, author, body) { return this.invoke('addComment', shopId, author, body); }
  submitPost(input) { return this.invoke('submitPost', input); }
  resetPreview() { return this.invoke('resetPreview'); }
}
