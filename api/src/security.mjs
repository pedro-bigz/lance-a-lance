// Hash de senha (scrypt + salt) e JWT HS256, só com node:crypto.
import { scrypt as scryptCb, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';
import { promisify } from 'node:util';
import { JWT_SECRET, JWT_EXPIRES_IN } from './config.mjs';

const scrypt = promisify(scryptCb);

// ---------- Senhas ----------
// Formato autodescritivo: scrypt$N=16384,r=8,p=1$<salt base64url>$<hash base64url>
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const MAXMEM = 64 * 1024 * 1024;

export async function hashPassword(plain) {
  const salt = randomBytes(16);
  const key = await scrypt(String(plain).normalize('NFC'), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: MAXMEM });
  return `scrypt$N=${SCRYPT.N},r=${SCRYPT.r},p=${SCRYPT.p}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(plain, stored) {
  const m = /^scrypt\$N=(\d+),r=(\d+),p=(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/.exec(String(stored || ''));
  if (!m) return false;
  const [, N, r, p, saltB64, keyB64] = m;
  const expected = Buffer.from(keyB64, 'base64url');
  const key = await scrypt(String(plain).normalize('NFC'), Buffer.from(saltB64, 'base64url'), expected.length, { N: +N, r: +r, p: +p, maxmem: MAXMEM });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// hash de uma senha qualquer, usado quando o e-mail não existe: o login demora o mesmo tanto
// e não revela se a conta existe
export const DUMMY_HASH = await hashPassword(randomBytes(12).toString('hex'));

// ---------- JWT (HS256) ----------
if (JWT_SECRET.length < 32) {
  console.error('JWT_SECRET ausente ou curto demais no api/.env (mínimo 32 caracteres).');
  process.exit(1);
}

// "12h", "30m", "7d", "45s" ou um número de segundos
export function parseDuration(v) {
  const m = /^(\d+)\s*([smhd]?)$/i.exec(String(v).trim());
  if (!m) return 12 * 3600;
  return Number(m[1]) * ({ s: 1, m: 60, h: 3600, d: 86400 }[(m[2] || 's').toLowerCase()]);
}
export const TOKEN_TTL = parseDuration(JWT_EXPIRES_IN);

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const sign = (data) => createHmac('sha256', JWT_SECRET).update(data).digest();

export function signJwt(claims) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ ...claims, iat: now, exp: now + TOKEN_TTL });
  return `${head}.${body}.${sign(`${head}.${body}`).toString('base64url')}`;
}

// devolve as claims ou null (assinatura errada, algoritmo diferente, formato inválido ou expirado)
export function verifyJwt(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts;
  try {
    const h = JSON.parse(Buffer.from(head, 'base64url').toString('utf8'));
    if (!h || h.alg !== 'HS256') return null;
    const given = Buffer.from(sig, 'base64url'), expected = sign(`${head}.${body}`);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!claims || typeof claims.exp !== 'number' || claims.exp <= Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch (_) {
    return null;
  }
}
