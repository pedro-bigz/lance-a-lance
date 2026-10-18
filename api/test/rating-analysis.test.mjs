// Análise da partida para a pontuação com o motor FALSO (rápido): lances refeitos, livro, precisão e as proteções
// (lance ilegal, resultado que o tabuleiro não confirma, desistência precoce). Rodar: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playerAccuracy, replay, confirmOutcome, plyColor } from '../src/rating/analyse-game.mjs';
import { computeRating } from '../src/rating/compute.mjs';
import { bookLength, inBook } from '../src/rating/book.mjs';
import { moveAccuracy } from '../../shared/rating.mjs';

// motor falso: nota fixa por número de lances (do ponto de vista de quem joga) e melhor lance opcional
function fakeEngine(scoreAt, bestAt = () => null) {
  const calls = [];
  return {
    calls,
    calibration: { wpK: 0.00368208 },
    async newGame() { calls.push('new'); },
    async analyse(start, moves) { calls.push(moves.length); return { score: scoreAt(moves.length), best: bestAt(moves.length), depth: 14 }; },
  };
}

const SCHOLAR = ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'];   // mate do pastor

test('refaz a partida: posições, mate no fim e lance ilegal', () => {
  const r = replay(null, SCHOLAR);
  assert.ok(r.ok);
  assert.equal(r.positions.length, 8);
  assert.deepEqual(r.final, { mate: true, draw: false, toMove: 'b' });
  assert.equal(replay(null, ['e2e4', 'e7e5', 'e1e3']).ok, false);
  assert.equal(replay(null, [...SCHOLAR, 'a7a6']).ok, false, 'lance depois do mate');
  assert.equal(replay('lixo', ['e2e4']).ok, false);
  assert.equal(plyColor('8/8/8/8/8/8/8/K6k b - - 0 1', 0), 'b');
});

test('livro de aberturas: o mesmo da interface', () => {
  assert.ok(inBook('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'));
  const r = replay(null, ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'h2h4', 'h7h5']);
  assert.ok(bookLength(r.positions, 6) >= 4);
  assert.ok(bookLength(r.positions, 6) < 6);
});

test('precisão: perda de chance de vitória só nos lances do jogador; livro = 100; melhor lance = 100', async () => {
  // brancas jogam 1.e4 (livro), depois 2.h4 (fora do livro): antes +50 cp, depois o rival fica com +150 cp
  const moves = ['e2e4', 'e7e5', 'h2h4', 'h7h5'];
  const e = fakeEngine((n) => (n === 2 ? { cp: 50 } : n === 3 ? { cp: 150 } : { cp: 0 }));
  const a = await playerAccuracy(e, { startFen: null, moves, color: 'w' }, { depth: 14 });
  assert.ok(a.ok);
  assert.equal(a.playerMoves, 2);
  assert.equal(a.accuracies[0], 100);
  const before = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * 50)) - 1), after = 100 - (50 + 50 * (2 / (1 + Math.exp(-0.00368208 * 150)) - 1));
  assert.ok(Math.abs(a.accuracies[1] - moveAccuracy(before - after)) < 1e-9);
  assert.deepEqual(e.calls, ['new', 2, 3], 'só as posições antes/depois do lance do jogador fora do livro');
  // o mesmo lance sendo o melhor do motor não perde nada
  const e2 = fakeEngine((n) => (n === 2 ? { cp: 50 } : { cp: 150 }), (n) => (n === 2 ? 'h2h4' : null));
  assert.equal((await playerAccuracy(e2, { startFen: null, moves, color: 'w' })).accuracies[1], moveAccuracy(0));
  // pretas: só os lances pretos contam
  const b = await playerAccuracy(fakeEngine(() => ({ cp: 0 })), { startFen: null, moves, color: 'b' });
  assert.equal(b.playerMoves, 2);
});

test('mate dado pelo jogador: o lance vale 100 e a posição de mate não vai ao motor', async () => {
  const e = fakeEngine(() => ({ cp: 0 }));
  const a = await playerAccuracy(e, { startFen: null, moves: SCHOLAR, color: 'w' });
  assert.equal(a.accuracies.at(-1), moveAccuracy(0));
  assert.ok(!e.calls.includes(7));
  assert.ok(confirmOutcome('vitoria', 'w', a.final));
  assert.ok(!confirmOutcome('vitoria', 'b', a.final));
  assert.ok(!confirmOutcome('empate', 'w', a.final));
  assert.ok(confirmOutcome('derrota', 'b', a.final));
});

test('lance ilegal: análise recusada antes do motor', async () => {
  const e = fakeEngine(() => ({ cp: 0 }));
  const a = await playerAccuracy(e, { startFen: null, moves: ['e2e4', 'e7e5', 'e1e3'], color: 'w' });
  assert.equal(a.ok, false);
  assert.equal(a.playerMoves, 2);
  assert.deepEqual(e.calls, []);
});

const game = (o) => ({ white_user_id: 7, black_user_id: null, bot_level: 'intermediario', result: '1-0', result_reason: 'xeque_mate', ...o });
const final = (o = {}) => ({ mate: true, draw: false, toMove: 'b', ...o });

test('cálculo: vitória confirmada no tabuleiro usa a precisão medida', () => {
  const r = computeRating(game(), { ok: true, accuracy: 85, playerMoves: 30, final: final() }, 1200);
  assert.equal(r.delta, 22);
  assert.equal(r.reason, 'vitoria');
  assert.equal(r.botElo, 1200);
});

test('cálculo: vitória que o tabuleiro não confirma vira derrota com precisão 0', () => {
  const r = computeRating(game(), { ok: true, accuracy: 99, playerMoves: 30, final: final({ mate: false }) }, 1200);
  assert.equal(r.reason, 'derrota');
  assert.equal(r.accuracy, 0);
  assert.equal(r.delta, -24);
});

test('cálculo: lances ilegais contam como derrota com precisão 0', () => {
  const r = computeRating(game({ result: '1/2-1/2', result_reason: 'afogamento' }), { ok: false, playerMoves: 10 }, 1200);
  assert.equal(r.reason, 'derrota');
  assert.equal(r.delta, -24);
});

test('cálculo: desistência antes de 6 lances do jogador = penalidade máxima', () => {
  const g = game({ result: '0-1', result_reason: 'desistencia', bot_level: 'novato' });
  const early = computeRating(g, { ok: true, accuracy: 100, playerMoves: 2, final: final({ mate: false, toMove: 'w' }) }, 400);
  assert.equal(early.penalty, true);
  assert.equal(early.delta, -24);
  const late = computeRating(g, { ok: true, accuracy: 100, playerMoves: 12, final: final({ mate: false, toMove: 'w' }) }, 400);
  assert.equal(late.penalty, false);
  assert.equal(late.delta, -8);
});

test('cálculo: jogador de pretas e nível desconhecido', () => {
  const r = computeRating(game({ white_user_id: null, black_user_id: 3, result: '0-1' }), { ok: true, accuracy: 70, playerMoves: 20, final: final({ toMove: 'w' }) }, 1200);
  assert.equal(r.reason, 'vitoria');
  assert.throws(() => computeRating(game({ bot_level: 'robo' }), { ok: true, accuracy: 70, playerMoves: 20, final: final() }, 1200), /nível de bot/);
});
