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
  reviewContribution(id, decision, note, actorId) { return this.invoke('reviewContribution', id, decision, note, actorId); }
  fixProvisional(id, actorId) { return this.invoke('fixProvisional', id, actorId); }
  revokeProvisional(id, actorId) { return this.invoke('revokeProvisional', id, actorId); }
  markReviewMessageRead(id, actorId) { return this.invoke('markReviewMessageRead', id, actorId); }
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
  addComment(targetKind, targetId, actorId, body) { return this.invoke('addComment', targetKind, targetId, actorId, body); }
  submitPost(input) { return this.invoke('submitPost', input); }
  setReaction(targetKind, targetId, actorId, stance) { return this.invoke('setReaction', targetKind, targetId, actorId, stance); }
  moderateContent(targetKind, targetId, decision, actorId) { return this.invoke('moderateContent', targetKind, targetId, decision, actorId); }
  resolveContested(contributionId, decision, actorId) { return this.invoke('resolveContested', contributionId, decision, actorId); }
  deleteOwnContent(kind, id, actorId) { return this.invoke('deleteOwnContent', kind, id, actorId); }
  resetPreview() { return this.invoke('resetPreview'); }
}
