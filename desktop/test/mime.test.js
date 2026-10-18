'use strict';
// node --test (pnpm test): tipos do protocolo app://
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { mimeFor } = require('../mime');

test('o .wasm do Stockfish sai como application/wasm', () => {
  assert.equal(mimeFor('/x/app/stockfish-19-lite-single.wasm'), 'application/wasm');
  assert.equal(mimeFor('C:\\app\\STOCKFISH.WASM'), 'application/wasm');
});
test('scripts do motor e a página', () => {
  assert.equal(mimeFor('stockfish-19-asm.js'), 'text/javascript; charset=utf-8');
  assert.equal(mimeFor('stockfish.asm.js'), 'text/javascript; charset=utf-8');
  assert.equal(mimeFor('index.html'), 'text/html; charset=utf-8');
  assert.equal(mimeFor('engine.json'), 'application/json');
});
test('extensão desconhecida fica com o tipo do net.fetch', () => {
  assert.equal(mimeFor('LEIA-ME'), null);
});
test('todos os arquivos do motor do build têm tipo (se app/ já foi montado)', (t) => {
  const manifest = path.join(__dirname, '..', 'app', 'engine.json');
  const ui = path.join(__dirname, '..', '..', 'ui', 'dist', 'engine.json');
  const file = [manifest, ui].find((f) => fs.existsSync(f));
  if (!file) return t.skip('sem build');
  for (const f of JSON.parse(fs.readFileSync(file, 'utf8')).files) assert.ok(mimeFor(f), f);
});
