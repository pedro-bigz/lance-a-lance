// UUID v7 (RFC 9562): 48 bits de milissegundos + versão + bits aleatórios. É o id público de usuários e partidas;
// o id numérico (AUTO_INCREMENT) continua como chave primária e nas FKs, mas fica só dentro do banco e da API.
// No banco vai como BINARY(16) na ordem natural dos bytes (sem troca): o v7 já começa pelo tempo, então os índices
// crescem em ordem. Para ler no MySQL: SELECT BIN_TO_UUID(uuid) FROM users;
import { randomBytes } from 'node:crypto';

// formato canônico, minúsculo, com hífens, versão 1–8 e variante RFC (8, 9, a, b)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let lastMs = -1, seq = 0;

// ms: momento a gravar (padrão: agora). Dentro do mesmo milissegundo, os 12 bits de rand_a viram contador, para
// ids gerados em sequência saírem em ordem
export function uuidv7(ms = Date.now()) {
  const b = randomBytes(16);
  ms = Math.max(0, Math.floor(Number(ms)) || 0);
  if (ms === lastMs && seq < 0xfff) seq++;
  else { lastMs = ms; seq = b.readUInt16BE(6) & 0x7ff; }   // começa na metade de baixo: sobra espaço para o contador
  b.writeUIntBE(ms, 0, 6);
  b[6] = 0x70 | (seq >> 8);
  b[7] = seq & 0xff;
  b[8] = 0x80 | (b[8] & 0x3f);
  return fromBin(b);
}

// só aceita texto já no formato canônico: nada de número, espaço, chaves, maiúsculas ou sem hífens
export const isUuid = (v) => typeof v === 'string' && v.length === 36 && UUID_RE.test(v);

export function toBin(str) {
  if (!isUuid(str)) throw new TypeError('UUID inválido');
  return Buffer.from(str.replace(/-/g, ''), 'hex');
}

export function fromBin(buf) {
  if (!Buffer.isBuffer(buf) || buf.length !== 16) throw new TypeError('UUID binário inválido');
  const h = buf.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// coluna BINARY(16) que pode vir NULL (LEFT JOIN)
export const fromBinOrNull = (buf) => buf == null ? null : fromBin(buf);

// milissegundos gravados num v7 (usado nos testes e na migração)
export const timeOf = (str) => parseInt(toBin(str).subarray(0, 6).toString('hex'), 16);
