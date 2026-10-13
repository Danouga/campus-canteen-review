import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const options = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64, options);
  return `scrypt$32768$8$3$${salt}$${key.toString('hex')}`;
}

export async function checkPassword(password, stored) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts.slice(0, 4).join('$') !== 'scrypt$32768$8$3' || !/^[a-f0-9]{32}$/.test(parts[4]) || !/^[a-f0-9]{128}$/.test(parts[5])) return false;
  const actual = await derive(password, parts[4], 64, options);
  return timingSafeEqual(actual, Buffer.from(parts[5], 'hex'));
}

// Unknown accounts still perform the same expensive password calculation.
export const dummyPasswordHash = hashPassword(randomBytes(32).toString('hex'));
