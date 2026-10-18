// Integração com o Stockfish 19 lite REAL (processo filho): uma partida curta, notas determinísticas e o processo
// encerrado no fim. Leva ~1 s. Rodar: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, engineVersion, ANALYSIS } from '../src/engine/registry.mjs';
import { playerAccuracy } from '../src/rating/analyse-game.mjs';
import { computeRating } from '../src/rating/compute.mjs';

// 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6?? 4.Qxf7# — o erro das pretas e o mate das brancas
const SCHOLAR = ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'];

test('Stockfish real: precisão das brancas alta, das pretas baixa, mesma nota ao repetir', { timeout: 120000 }, async () => {
  const e = createEngine();
  await e.start();
  try {
    assert.match(e.name || '', /Stockfish 19/);
    assert.equal(engineVersion(e), 'sf19-lite@19.0.1');
    const w = await playerAccuracy(e, { startFen: null, moves: SCHOLAR, color: 'w' }, { depth: ANALYSIS.depth });
    const b = await playerAccuracy(e, { startFen: null, moves: SCHOLAR, color: 'b' }, { depth: ANALYSIS.depth });
    const w2 = await playerAccuracy(e, { startFen: null, moves: SCHOLAR, color: 'w' }, { depth: ANALYSIS.depth });
    assert.equal(w.playerMoves, 4);
    assert.ok(w.final.mate);
    assert.ok(w.accuracy > 75, `brancas ${w.accuracy}`);
    assert.ok(b.accuracy < w.accuracy, `pretas ${b.accuracy} < brancas ${w.accuracy}`);
    assert.ok(Math.min(...b.accuracies) < 20, 'Nf6?? é capivarada');
    assert.equal(w2.accuracy, w.accuracy, 'determinístico');
    // a vitória curta é real (mate no tabuleiro): vale como vitória
    const r = computeRating({ white_user_id: 1, black_user_id: null, bot_level: 'novato', result: '1-0', result_reason: 'xeque_mate' }, w, 400);
    assert.equal(r.reason, 'vitoria');
    assert.ok(r.delta >= 4 && r.delta <= 25);
  } finally {
    await e.stop();
  }
  assert.equal(e.proc, null, 'processo encerrado');
});

test('Stockfish real: posição de mate não trava (bestmove (none))', { timeout: 30000 }, async () => {
  const e = createEngine();
  await e.start();
  try {
    const r = await e.analyse(null, SCHOLAR, { depth: 8 });
    assert.equal(r.best, null);
    assert.deepEqual(r.score, { mate: 0 });
  } finally {
    await e.stop();
  }
});
