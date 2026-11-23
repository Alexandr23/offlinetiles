import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;

function scrypt(password: string, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }, (err, derived) => {
      if (err) reject(err);
      else resolve(derived);
    });
  });
}

/** Format: scrypt$n$r$p$saltHex$hashHex */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEYLEN);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4]!, 'hex');
  const expected = Buffer.from(parts[5]!, 'hex');
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p) || salt.length === 0 || expected.length === 0) {
    return false;
  }
  const derived = await new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, expected.length, { N: n, r, p }, (err, buf) => {
      if (err) reject(err);
      else resolve(buf);
    });
  });
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
