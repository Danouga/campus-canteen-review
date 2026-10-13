import { hashPassword, checkPassword, dummyPasswordHash } from './passwords.mjs';
import { createHash, createHmac, randomBytes, randomInt } from 'node:crypto';
import nodemailer from 'nodemailer';
import { screenComment } from './src/content-filter.js';

export class AuthError extends Error {
  constructor(message, status = 400, retryAfter = 0) { super(message); this.status = status; this.retryAfter = retryAfter; }
}
export function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (email.length > 254 || !/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(email)) throw new AuthError('请填写有效的邮箱地址。');
  const local = email.split("@")[0];
  if (local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) throw new AuthError("请填写有效的邮箱地址。");
  return email;
}
export const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
export function createMailer(config) {
  const user = config.SMTP_USER || '575187327@qq.com';
  const ready = Boolean(config.SMTP_PASS);
  const transport = ready ? nodemailer.createTransport({
    host: config.SMTP_HOST || 'smtp.qq.com', port: Number(config.SMTP_PORT || 465),
    secure: Number(config.SMTP_PORT || 465) === 465, requireTLS: true,
    auth: { user, pass: config.SMTP_PASS }, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000
  }) : null;
  return {
    ready,
    async sendCode(email, code, purpose) {
      const label = { register: '注册', 'reset-password': '找回密码 / 首次设置密码', 'change-password': '修改密码' }[purpose] || '邮箱验证';
      if (!ready) throw new AuthError('验证邮件尚未配置，请联系网站管理员。', 503);
      await transport.sendMail({ from: { name: '食间 · 校园食堂指南', address: user }, to: email,
        subject: `食间${label}验证码`, text: `你正在进行食间${label}，验证码是：${code}\n\n验证码 10 分钟内有效，仅可用于本次操作一次。\n如果不是你发起的请求，请忽略此邮件。请勿向他人透露验证码。` });
    },
    async verify() { if (!transport) throw new AuthError('请先配置 SMTP_PASS（QQ 邮箱授权码）。', 503); await transport.verify(); }
  };
}
export function createAuthService({ store, config = {}, mailer = createMailer(config), now = Date.now }) {
  const secret = config.AUTH_CODE_SECRET || randomBytes(32).toString('hex');
  const digest = (email, id, code, purpose) => createHmac('sha256', secret).update(`${purpose}\0${email}\0${id}\0${code}`).digest('hex');
  const sessionSeconds = 7 * 24 * 60 * 60;
  const secure = config.AUTH_COOKIE_SECURE === 'true';
  let lastCleanup = 0;
  async function cleanup() { if (now() - lastCleanup > 3_600_000) { lastCleanup = now(); await store.cleanup(now()); } }
  async function limit(ip, purpose, count, period) {
    const result = await store.rateLimit(tokenHash(`${purpose}:${ip}`), count, period, now());
    if (!result.allowed) throw new AuthError('请求过于频繁，请稍后重试。', 429, result.retryAfter);
  }
  const cookie = (token, seconds = sessionSeconds) => `canteen_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure ? '; Secure' : ''}`;
  function sessionToken(request) {
    const value = (request.headers.cookie || '').split(';').map((entry) => entry.trim()).find((entry) => entry.startsWith('canteen_session='))?.slice('canteen_session='.length);
    return /^[a-f0-9]{64}$/.test(value || '') ? value : null;
  }
  return {
    ready: mailer.ready,
    cookie,
    async user(request) { const token = sessionToken(request); return token ? store.session(tokenHash(token), now()) : null; },
    async send(input, ip, actor = null) {
      if (!mailer.ready) throw new AuthError('验证邮件尚未配置，请联系网站管理员。', 503);
      const purpose = input.purpose;
      if (!['register', 'reset-password', 'change-password'].includes(purpose)) throw new AuthError('请选择验证码用途。');
      if (purpose === 'change-password' && !actor) throw new AuthError('请先登录。', 401);
      const email = normalizeEmail(purpose === 'change-password' ? actor.email : input.email);
      await limit(ip, 'send', 10, 600_000);
      await cleanup();
      const id = randomBytes(32).toString('hex');
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const result = await store.reserveCode(email, { id, hash: digest(email, id, code, purpose), purpose }, now());
      if (!result.allowed) throw new AuthError('该邮箱发送过于频繁，请稍后重试。', 429, result.retryAfter);
      try { await mailer.sendCode(email, code, purpose); await store.setDelivery(id, true); }
      catch { await store.setDelivery(id, false); throw new AuthError('验证邮件发送失败，请联系管理员检查 SMTP 授权码或稍后重试。', 503); }
      return { challengeId: id, expiresIn: 600, retryAfter: 60 };
    },
    async login(input, ip) {
      await limit(ip, 'password-login', 20, 600_000);
      const email = normalizeEmail(input.email);
      await limit(email, 'password-account', 10, 600_000);
      const account = await store.passwordAccount(email);
      const stored = account?.password_hash || await dummyPasswordHash;
      const matches = await checkPassword(input.password, stored);
      if (!matches || !account?.password_hash || account.status !== 'active') throw new AuthError('邮箱或密码错误。尚未设置密码的账户请使用「找回 / 设置密码」。', 401);
      const token = randomBytes(32).toString('hex');
      const user = await store.passwordSession({ userId: account.id, passwordHash: account.password_hash, sessionHash: tokenHash(token), sessionExpires: now() + sessionSeconds * 1000 }, now());
      if (!user) throw new AuthError('账户状态已变化，请重新登录。', 401);
      return { user, cookie: cookie(token) };
    },
    async complete(input, ip, purpose, actor = null) {
      await limit(ip, 'verify', 30, 600_000);
      if (!['register', 'reset-password', 'change-password'].includes(purpose)) throw new AuthError('操作无效。');
      if (purpose === 'change-password' && !actor) throw new AuthError('请先登录。', 401);
      const email = normalizeEmail(purpose === 'change-password' ? actor.email : input.email);
      if (!/^[a-f0-9]{64}$/.test(input.challengeId || '') || !/^\d{6}$/.test(String(input.code || ''))) throw new AuthError('请输入邮件中的 6 位验证码。');
      if (typeof input.password !== 'string' || input.password.length < 8 || input.password.length > 128) throw new AuthError('密码需为 8–128 个字符。');
      if (input.password !== input.confirmPassword) throw new AuthError('两次输入的密码不一致。');
      const name = String(input.name || '').trim() || `同学${randomBytes(3).toString('hex')}`;
      if (purpose === 'register' && (name.length > 20 || name.length < 2 || !screenComment(name).allowed)) throw new AuthError('昵称需为 2–20 字，且符合发布规则。');
      const token = randomBytes(32).toString('hex');
      const user = await store.completeCode({ email, challengeId: input.challengeId, codeHash: digest(email, input.challengeId, String(input.code), purpose), purpose, name,
        passwordHash: await hashPassword(input.password), actorId: actor?.id || null,
        sessionHash: tokenHash(token), sessionExpires: now() + sessionSeconds * 1000 }, now());
      if (!user) throw new AuthError('验证码错误、已过期、已使用或账户不适用此操作。已有账户请使用「找回 / 设置密码」。');
      return purpose === 'register' ? { user, cookie: cookie(token) } : { success: true, cookie: cookie('', 0) };
    },
    async logout(request) { const token = sessionToken(request); if (token) await store.deleteSession(tokenHash(token)); return cookie('', 0); }
  };
}
