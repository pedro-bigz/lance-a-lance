// Integração com o BANCO REAL e a API de verdade (processo filho numa porta livre): conclui partidas que valem pontos
// com lances reais e confere status 'pending' → 'applied', delta, rating_history, precisão, idempotência e que nenhum
// id interno sai nas respostas. Cria uma conta temporária e apaga no fim. Só roda com LANCE_DB_TESTS=1 e o .env:
//   LANCE_DB_TESTS=1 node --env-file=.env --test test/rating-api.integration.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RUN = process.env.LANCE_DB_TESTS === '1';
const API_DIR = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.LANCE_TEST_PORT || 8798);
const BASE = `http://127.0.0.1:${PORT}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SCHOLAR = ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'];

let server, token, email, db;
const api = async (method, path, body) => {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitRating(id) {
  for (let i = 0; i < 120; i++) {
    const r = await api('GET', `/v1/games/${id}/rating`);
    if (r.body.rating_change && r.body.rating_change.status !== 'pending') return r;
    await sleep(250);
  }
  throw new Error('pontuação não saiu');
}
// nenhum número que pareça id interno nos campos de id
function noInternalIds(o) {
  for (const [k, v] of Object.entries(o || {})) {
    if (/(^id$|_id$)/.test(k) && v != null) assert.match(String(v), UUID, `${k} = ${v}`);
    if (v && typeof v === 'object' && !Array.isArray(v)) noInternalIds(v);
  }
}

before(async () => {
  if (!RUN) return;
  server = spawn(process.execPath, ['--env-file=.env', 'server.mjs'], { cwd: API_DIR, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.resume(); server.stderr.resume();
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + '/health')).ok) break; } catch (_) {} await sleep(200); }
  email = `rating-test-${Date.now()}@lance.local`;
  const r = await api('POST', '/v1/auth/register', { first_name: 'Teste', last_name: 'Pontuação', email, password: 'senha-de-teste-123' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  token = r.body.token;
  db = await import('../src/db.mjs');
});
after(async () => {
  if (!RUN) return;
  if (db && email) {
    const store = await import('../src/user-store.mjs');
    const [u] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (u) await store.deleteUser(u.id);
    await db.pool.end();
  }
  if (server) { server.kill('SIGTERM'); await new Promise((r) => server.once('exit', r)); }
});

test('vitória real (mate do pastor contra o novato): pending → applied com precisão e histórico', { skip: !RUN, timeout: 60000 }, async () => {
  const c = await api('POST', '/v1/games', { client_ref: `t-${Date.now()}-w`, bot_level: 'novato', color: 'w', mode: 'normal', rated: true, moves: [] });
  assert.equal(c.status, 201);
  const id = c.body.game.id;
  const done = await api('PATCH', `/v1/games/${id}`, { moves: SCHOLAR.map((uci) => ({ uci, san: null, cls: 'melhor' })), status: 'concluida', result: '1-0', result_reason: 'xeque_mate' });
  assert.equal(done.status, 200);
  assert.equal(done.body.rating_change.status, 'pending');
  assert.equal(done.body.rating_change.delta, 0);
  assert.equal(done.body.game.rating_status, 'pending');
  noInternalIds(done.body);
  const r = await waitRating(id);
  const ch = r.body.rating_change;
  assert.equal(ch.status, 'applied');
  assert.equal(ch.before, 400);
  assert.ok(ch.delta >= 4 && ch.delta <= 25, `delta ${ch.delta}`);
  assert.ok(ch.accuracy > 70, `precisão ${ch.accuracy}`);
  assert.equal(ch.bot_elo, 400);
  assert.equal(ch.engine_version, 'sf19-lite@19.0.1');
  assert.equal(r.body.game_id, id);
  noInternalIds(r.body);
  // reenviar a conclusão não aplica de novo
  const again = await api('PATCH', `/v1/games/${id}`, { status: 'concluida', result: '1-0', result_reason: 'xeque_mate' });
  assert.equal(again.body.rating_change.delta, ch.delta);
  const h = await api('GET', '/v1/stats/me/rating-history');
  const pts = h.body.points.filter((p) => p.game_id === id);
  assert.equal(pts.length, 1, 'um ponto só no histórico');
  assert.equal(pts[0].reason, 'vitoria');
  assert.equal(pts[0].accuracy, ch.accuracy);
  noInternalIds(h.body);
  const s = await api('GET', '/v1/stats/me');
  assert.equal(s.body.stats.rating, ch.after);
  assert.equal(s.body.stats.accuracy.games, 1);
});

test('desistência antes de 6 lances: derrota com precisão 0', { skip: !RUN, timeout: 60000 }, async () => {
  const before = (await api('GET', '/v1/stats/me')).body.stats.rating;
  const c = await api('POST', '/v1/games', { client_ref: `t-${Date.now()}-r`, bot_level: 'intermediario', color: 'w', mode: 'normal', rated: true,
    moves: ['e2e4', 'e7e5', 'g1f3'].map((uci) => ({ uci, san: null, cls: null })), status: 'concluida', result: '0-1', result_reason: 'desistencia' });
  assert.equal(c.status, 201);
  assert.equal(c.body.rating_change.status, 'pending');
  const r = await waitRating(c.body.game.id);
  assert.equal(r.body.rating_change.accuracy, 0);
  assert.equal(r.body.rating_change.before, before);
  assert.ok(r.body.rating_change.delta <= -4);
});

test('vitória que o tabuleiro não confirma vira derrota; partida assistida não entra na fila', { skip: !RUN, timeout: 60000 }, async () => {
  const c = await api('POST', '/v1/games', { client_ref: `t-${Date.now()}-f`, bot_level: 'novato', color: 'w', mode: 'normal', rated: true,
    moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'e1g1', 'g8f6'].map((uci) => ({ uci, san: null, cls: null })), status: 'concluida', result: '1-0', result_reason: 'xeque_mate' });
  const r = await waitRating(c.body.game.id);
  assert.ok(r.body.rating_change.delta < 0, 'não ganha pontos por vitória falsa');
  const a = await api('POST', '/v1/games', { client_ref: `t-${Date.now()}-a`, bot_level: 'novato', color: 'w', mode: 'assistido', moves: [], status: 'concluida', result: '0-1', result_reason: 'desistencia' });
  assert.equal(a.body.rating_change, null);
  assert.equal(a.body.game.rating_status, null);
  const st = await api('GET', `/v1/games/${a.body.game.id}/rating`);
  assert.equal(st.body.rating_change, null);
  assert.equal((await api('GET', '/v1/games/123/rating')).status, 404, 'id numérico não é aceito');
});
