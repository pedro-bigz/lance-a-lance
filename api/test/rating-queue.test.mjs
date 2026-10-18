// Fila de análise da pontuação com banco e motor FALSOS: uma por vez, sem duplicar, reprocessa as pendentes ao
// reiniciar, aplica uma vez só e trata falhas (failed + nova tentativa, até o limite). Rodar: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RatingQueue, PermanentRatingError } from '../src/rating/queue.mjs';

// banco em memória com o mesmo contrato de src/rating/store.mjs
function memoryStore(rows) {
  const db = new Map(rows.map((r) => [r.id, { rating_attempts: 0, ...r }]));
  const applied = [];
  return {
    db, applied,
    async load(id) { const g = db.get(id); return g ? { ...g } : null; },
    async pendingIds(max) { return [...db.values()].filter((g) => g.rating_status === 'pending' || (g.rating_status === 'failed' && g.rating_attempts < max)).map((g) => g.id); },
    async apply(id, analysis) {
      const g = db.get(id);
      if (g.rating_status !== 'pending' && g.rating_status !== 'failed') return { applied: false };   // idempotente
      g.rating_status = 'applied';
      applied.push(id);
      return { applied: true, delta: 10, accuracy: analysis.accuracy };
    },
    async markFailed(id, attempts) {
      const g = db.get(id);
      g.rating_status = 'failed';
      g.rating_attempts = attempts ?? g.rating_attempts + 1;
      return g.rating_attempts;
    },
  };
}
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

test('analisa uma partida por vez, na ordem, e não duplica a mesma partida na fila', async () => {
  const store = memoryStore([1, 2, 3].map((id) => ({ id, rating_status: 'pending' })));
  let running = 0, peak = 0;
  const order = [];
  const q = new RatingQueue({ store, analyse: async (g) => { running++; peak = Math.max(peak, running); order.push(g.id); await tick(); running--; return { accuracy: 80 }; } });
  q.enqueue(1); q.enqueue(2); assert.equal(q.enqueue(2), false); q.enqueue(3);
  await q.idle();
  assert.equal(peak, 1);
  assert.deepEqual(order, [1, 2, 3]);
  assert.deepEqual(store.applied, [1, 2, 3]);
});

test('reiniciar: resume() põe de volta as pendentes e as falhas com tentativas sobrando', async () => {
  const store = memoryStore([
    { id: 1, rating_status: 'pending' }, { id: 2, rating_status: 'applied' }, { id: 3, rating_status: 'failed', rating_attempts: 1 },
    { id: 4, rating_status: 'failed', rating_attempts: 3 }, { id: 5, rating_status: null },
  ]);
  const q = new RatingQueue({ store, analyse: async () => ({ accuracy: 70 }), maxAttempts: 3 });
  assert.equal(await q.resume(), 2);
  await q.idle();
  assert.deepEqual(store.applied, [1, 3]);
});

test('idempotência: a mesma partida processada de novo (ou já aplicada) não aplica outra vez', async () => {
  const store = memoryStore([{ id: 1, rating_status: 'pending' }]);
  let analyses = 0;
  const q = new RatingQueue({ store, analyse: async () => { analyses++; return { accuracy: 90 }; } });
  q.enqueue(1);
  await q.idle();
  q.enqueue(1);
  await q.idle();
  assert.deepEqual(store.applied, [1]);
  assert.equal(analyses, 1, 'já aplicada: nem analisa');
  // duas aplicações concorrentes da mesma análise: o store (FOR UPDATE + status) aplica uma vez só
  const s2 = memoryStore([{ id: 9, rating_status: 'pending' }]);
  await Promise.all([s2.apply(9, { accuracy: 1 }), s2.apply(9, { accuracy: 1 })]);
  assert.deepEqual(s2.applied, [9]);
});

test('falha → failed com tentativa contada e nova tentativa depois; para no limite', async () => {
  const store = memoryStore([{ id: 1, rating_status: 'pending' }, { id: 2, rating_status: 'pending' }]);
  const logs = [];
  let fails = { 1: 1, 2: 99 };
  const q = new RatingQueue({
    store, maxAttempts: 3, retryDelayMs: 10, log: (m) => logs.push(m),
    analyse: async (g) => { if (fails[g.id]-- > 0) throw new Error('motor caiu'); return { accuracy: 60 }; },
  });
  q.enqueue(1); q.enqueue(2);
  await q.idle();
  assert.equal(store.db.get(1).rating_status, 'failed');
  assert.equal(store.db.get(1).rating_attempts, 1);
  await tick(120);
  await q.idle();
  assert.equal(store.db.get(1).rating_status, 'applied', 'segunda tentativa deu certo');
  assert.equal(store.db.get(2).rating_status, 'failed');
  assert.equal(store.db.get(2).rating_attempts, 3, 'desistiu no limite');
  assert.ok(logs.some((l) => /tentativa 3\/3/.test(l)));
  await q.stop();
});

test('erro permanente (ex.: nível de bot desconhecido) não tenta de novo', async () => {
  const store = memoryStore([{ id: 1, rating_status: 'pending' }]);
  let calls = 0;
  const q = new RatingQueue({ store, maxAttempts: 3, retryDelayMs: 5, analyse: async () => { calls++; throw new PermanentRatingError('nível'); } });
  q.enqueue(1);
  await q.idle();
  await tick(40);
  assert.equal(calls, 1);
  assert.equal(store.db.get(1).rating_attempts, 3);
});

test('stop(): cancela as novas tentativas e não aceita mais partidas', async () => {
  const store = memoryStore([{ id: 1, rating_status: 'pending' }]);
  const q = new RatingQueue({ store, retryDelayMs: 5, analyse: async () => { throw new Error('x'); } });
  q.enqueue(1);
  await q.idle();
  await q.stop();
  assert.equal(q.enqueue(1), false);
  await tick(30);
  assert.equal(store.db.get(1).rating_attempts, 1);
});
