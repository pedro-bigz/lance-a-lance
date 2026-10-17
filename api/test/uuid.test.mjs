// Testes do UUID v7 (id público de usuários e partidas). Rodar: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uuidv7, isUuid, toBin, fromBin, fromBinOrNull, timeOf } from '../src/uuid.mjs';

const V7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('formato canônico, versão 7 e variante RFC', () => {
  for (let i = 0; i < 500; i++) {
    const u = uuidv7();
    assert.match(u, V7_RE);
    assert.ok(isUuid(u));
    const b = toBin(u);
    assert.equal(b[6] >> 4, 7);
    assert.equal(b[8] >> 6, 0b10);
  }
});

test('grava o momento em milissegundos nos primeiros 48 bits', () => {
  const ms = Date.UTC(2026, 9, 16, 21, 56, 18, 123);
  assert.equal(timeOf(uuidv7(ms)), ms);
  const before = Date.now(), u = uuidv7(), after = Date.now();
  assert.ok(timeOf(u) >= before && timeOf(u) <= after);
});

test('ordenação temporal: texto e binário crescem com o tempo, inclusive no mesmo milissegundo', () => {
  const list = [];
  for (let i = 0; i < 2000; i++) list.push(uuidv7());   // muitos caem no mesmo milissegundo
  const sorted = [...list].sort();
  assert.deepEqual(list, sorted);
  for (let i = 1; i < list.length; i++) assert.ok(Buffer.compare(toBin(list[i - 1]), toBin(list[i])) < 0);
  const old = uuidv7(Date.UTC(2020, 0, 1)), now = uuidv7();
  assert.ok(old < now);
});

test('não repete', () => {
  const set = new Set();
  for (let i = 0; i < 20000; i++) set.add(uuidv7());
  assert.equal(set.size, 20000);
});

test('ida e volta texto ↔ binário', () => {
  const u = uuidv7();
  const b = toBin(u);
  assert.ok(Buffer.isBuffer(b));
  assert.equal(b.length, 16);
  assert.equal(fromBin(b), u);
  // um UUID de outra versão também é aceito (ex.: v4)
  assert.equal(fromBin(toBin('0f8fad5b-d9cb-469f-a165-70867728950e')), '0f8fad5b-d9cb-469f-a165-70867728950e');
  assert.equal(fromBinOrNull(null), null);
  assert.equal(fromBinOrNull(b), u);
});

test('isUuid recusa números, espaços e formatos fora do canônico', () => {
  const u = uuidv7();
  const bad = [
    1, 42, 0, -1, 1.5, NaN, null, undefined, true, {}, [], Buffer.alloc(16),
    '', '1', '7', '123', '00000000000000000000000000000001',
    ` ${u}`, `${u} `, `${u}\n`, u.replace(/-/g, ''), u.toUpperCase(), `{${u}}`, `urn:uuid:${u}`,
    u.slice(0, 35), u + '0', u.replace(/-/g, ' '), u.slice(0, 8) + ' ' + u.slice(9),
    '00000000-0000-0000-0000-000000000000',            // nil (versão 0)
    'ffffffff-ffff-ffff-ffff-ffffffffffff',            // max
    '0f8fad5b-d9cb-969f-a165-70867728950e',            // versão 9
    '0f8fad5b-d9cb-469f-c165-70867728950e',            // variante errada
    '0f8fad5b-d9cb-469f-a165-70867728950g',            // caractere fora de hex
    '0f8fad5b-d9cb-469f-a16-570867728950e',            // hífen fora do lugar
  ];
  for (const v of bad) assert.equal(isUuid(v), false, `aceitou ${JSON.stringify(String(v))}`);
});

test('toBin e fromBin recusam entrada inválida', () => {
  for (const v of [1, '1', ' x', '', null, uuidv7().toUpperCase()]) assert.throws(() => toBin(v), TypeError);
  for (const v of [null, 'abc', Buffer.alloc(15), Buffer.alloc(17), new Uint8Array(16)]) assert.throws(() => fromBin(v), TypeError);
});
