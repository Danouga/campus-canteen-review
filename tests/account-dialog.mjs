import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { initialState, demoUsers, canReview, recommendationLedger, recommendationSummary, userMessages } from '../src/repository.js';
import { screenComment, filterVersion } from '../src/content-filter.js';

const dom = new JSDOM('<!doctype html><div id="app"></div>', { url: 'http://127.0.0.1:4185/', runScripts: 'outside-only' });
const { window } = dom;
let user = null;
let password = null;
let finishSend;
const calls = [];
const email = 'account-test@example.com';
const repo = {
  async mode() { return 'mysql'; },
  async authSession() { return { user, mailReady: true }; },
  async snapshot() { return initialState(); },
  async authPost(path, input) {
    calls.push({ path, input: structuredClone(input) });
    if (path === 'send-code') {
      await new Promise(resolve => { finishSend = resolve; });
      return { challengeId: 'a'.repeat(64), retryAfter: 0 };
    }
    if (path === 'reset-password' || path === 'change-password') {
      assert.equal(input.code, '123456');
      assert.equal(input.password, input.confirmPassword);
      password = input.password;
      user = null;
      return { success: true };
    }
    if (path === 'login') {
      if (input.email !== email || input.password !== password) throw new Error('邮箱或密码错误。');
      user = { id: 'test-admin', email, name: '测试管理员', role: 'admin' };
      return { user };
    }
    throw new Error('Unexpected request');
  }
};
window.__deps = { createRepository: () => repo, demoUsers, canReview, recommendationLedger, recommendationSummary, userMessages, screenComment, filterVersion,
  sanitizeRichHtml: value => value, plainTextFromRichHtml: value => value, imageAsDataUrl: async () => '' };
const source = (await readFile(new URL('../src/app.js', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '');
const settle = async () => { await new Promise(setImmediate); await new Promise(setImmediate); };
const query = selector => { const node = window.document.querySelector(selector); assert.ok(node, `Missing ${selector}`); return node; };
function fill(name, value) {
  const input = query(`#email-login-form [name="${name}"]`);
  input.click(); // This bubbled click previously changed mode and cleared passwords.
  input.value = value;
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
}
function submit() { query('#email-login-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); }
try {
  window.eval('const { createRepository, demoUsers, canReview, recommendationLedger, recommendationSummary, userMessages, screenComment, filterVersion, sanitizeRichHtml, plainTextFromRichHtml, imageAsDataUrl } = window.__deps;\n' + source);
  await settle();
  query('[data-action="toggle-profile"]').click();
  assert.ok(query('.auth-dialog'));
  assert.equal(window.document.querySelector('.profile-sidebar'), null);
  assert.equal(query('[data-mode="reset-password"]').textContent, '忘记密码');
  assert.equal(window.document.documentElement.classList.contains('modal-open'), true);
  // Browsers target the common backdrop after dragging from inside the panel out.
  const backdrop = query('.auth-backdrop');
  query('.auth-dialog h2').dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }));
  backdrop.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true }));
  backdrop.dispatchEvent(new window.MouseEvent('click', { bubbles: true, detail: 1 }));
  assert.ok(query('.auth-dialog'));
  // An intentional press and release on the backdrop still closes it.
  backdrop.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }));
  backdrop.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true }));
  backdrop.dispatchEvent(new window.MouseEvent('click', { bubbles: true, detail: 1 }));
  assert.equal(window.document.querySelector('.auth-dialog'), null);
  assert.equal(window.document.documentElement.classList.contains('modal-open'), false);
  query('[data-action="toggle-profile"]').click();
  query('[data-mode="reset-password"]').click();
  fill('email', email);
  fill('password', 'Test!FirstPassword234');
  fill('confirmPassword', 'Test!FirstPassword234');
  query('[data-action="send-login-code"]').click();
  assert.equal(calls.at(-1).input.purpose, 'reset-password');
  assert.equal(query('[name="password"]').value, 'Test!FirstPassword234');
  query('[name="code"]').click();
  assert.equal(query('.auth-dialog').getAttribute('aria-label'), '找回 / 设置密码');
  finishSend(); await settle();
  assert.match(query('.auth-feedback').textContent, /验证码已发送/);
  assert.equal(query('[name="confirmPassword"]').value, 'Test!FirstPassword234');
  fill('code', '123456'); submit(); await settle();
  assert.equal(calls.at(-1).path, 'reset-password');
  assert.equal(query('.auth-dialog').getAttribute('aria-label'), '邮箱登录');
  assert.match(query('.auth-feedback').textContent, /密码已更新/);
  fill('email', email); fill('password', 'IncorrectPassword'); submit(); await settle();
  assert.match(query('.auth-feedback').textContent, /邮箱或密码错误/);
  fill('password', 'Test!FirstPassword234'); submit(); await settle();
  assert.equal(window.document.querySelector('.auth-dialog'), null);
  query('[data-action="toggle-profile"]').click();
  assert.ok(query('.profile-sidebar'));
  query('[data-mode="change-password"]').click();
  assert.equal(window.document.querySelector('.profile-sidebar'), null);
  assert.equal(query('[name="email"]').readOnly, true);
  fill('password', 'Test!ChangedPassword234'); fill('confirmPassword', 'Test!ChangedPassword234');
  query('[data-action="send-login-code"]').click();
  assert.equal(calls.at(-1).input.purpose, 'change-password');
  finishSend(); await settle(); fill('code', '123456'); submit(); await settle();
  assert.equal(calls.at(-1).path, 'change-password');
  fill('email', email); fill('password', 'Test!ChangedPassword234'); submit(); await settle();
  assert.equal(window.document.querySelector('.auth-dialog'), null);
  console.log('账户窗口：背景拖动不关闭、背景点击关闭、输入框点击与事件冒泡、填密码后发送验证码、草稿保留、重置后密码登录、错误提示、管理员修改密码及侧栏分离均通过（模拟账户，不改真实密码、不发邮件）。');
} finally { window.close(); }
