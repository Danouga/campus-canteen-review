/**
 * Server API boundary for the later database phase.
 *
 * The browser must never connect to a rented database directly or contain its
 * credentials. Once the backend and schema are agreed, implement these methods
 * against authenticated HTTP endpoints and switch the factory in repository.js.
 * Each method intentionally matches LocalRepository's Promise-based contract.
 */
export class ApiRepository {
  async snapshot() { throw new Error('服务端数据接口尚未接入。'); }
  async submitContribution(_input) { throw new Error('服务端数据接口尚未接入。'); }
  async reviewContribution(_id, _decision, _note) { throw new Error('服务端数据接口尚未接入。'); }
  async fixProvisional(_id) { throw new Error('服务端数据接口尚未接入。'); }
  async revokeProvisional(_id) { throw new Error('服务端数据接口尚未接入。'); }
  async expireProvisional() { throw new Error('暂示到期应由服务端定时任务处理。'); }
  async saveCampus(_id, _name) { throw new Error('服务端数据接口尚未接入。'); }
  async saveCanteen(_input) { throw new Error('服务端数据接口尚未接入。'); }
  async saveShop(_input) { throw new Error('服务端数据接口尚未接入。'); }
  async removeEntry(_kind, _id) { throw new Error('服务端数据接口尚未接入。'); }
  async restoreEntry(_kind, _id) { throw new Error('服务端数据接口尚未接入。'); }
  async saveDish(_input) { throw new Error('服务端数据接口尚未接入。'); }
  async savePhoto(_input) { throw new Error('服务端数据接口尚未接入。'); }
  async removeShopContent(_kind, _shopId, _entryId) { throw new Error('服务端数据接口尚未接入。'); }
  async addComment(_shopId, _author, _body) { throw new Error('服务端数据接口尚未接入。'); }
  async submitPost(_input) { throw new Error('服务端数据接口尚未接入。'); }
}
