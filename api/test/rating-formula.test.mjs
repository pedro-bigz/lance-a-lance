// Fórmula da pontuação (shared/rating.mjs, a mesma da interface). Rodar: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACC_FLOOR, BOT_ELO, MIN_WEIGHT, expectedScore, gameAccuracy, moveWeight, moveAccuracy, ratingDelta, RATING_MIN, scoreWinPct, winPct, WP_K } from '../../shared/rating.mjs';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test('precisão do lance: curva 103,1668·e^(−0,04354·Δ) − 3,1669 limitada a [0, 100]', () => {
  near(moveAccuracy(0), 99.9999, 1e-3);
  near(moveAccuracy(10), 103.1668 * Math.exp(-0.4354) - 3.1669);
  assert.equal(moveAccuracy(100), 0);
  assert.equal(moveAccuracy(-5), moveAccuracy(0));
  assert.ok(moveAccuracy(5) > moveAccuracy(20));
});

test('chance de vitória: mesma curva logística da interface (wpK) e notas de mate', () => {
  assert.equal(WP_K, 0.00368208);
  near(winPct(0), 50);
  assert.ok(winPct(300) > 70 && winPct(300) < 80);
  near(winPct(-300), 100 - winPct(300));
  assert.equal(scoreWinPct({ mate: 3 }), 100);
  assert.equal(scoreWinPct({ mate: -2 }), 0);
  assert.equal(scoreWinPct(null), 50);
});

test('precisão da partida: média harmônica ponderada, com piso por lance; null sem lances', () => {
  near(gameAccuracy([100, 80, 60]), 3 / (1 / 100 + 1 / 80 + 1 / 60));
  near(gameAccuracy([100, 0]), 2 / (1 / 100 + 1 / ACC_FLOOR), 1e-9);
  assert.equal(gameAccuracy([]), null);
  near(gameAccuracy([90, NaN, 70]), 2 / (1 / 90 + 1 / 70));
  assert.equal(gameAccuracy([100, 100, 100]), 100);
});

test('peso do lance: partida em jogo pesa 1; decidida, quase nada; o lance que joga fora a vitória pesa inteiro', () => {
  assert.equal(moveWeight(50, 50), 1);
  assert.equal(moveWeight(null, null), 1);
  assert.equal(moveWeight(0.5, 0.2), MIN_WEIGHT);
  assert.equal(moveWeight(99, 50), 1);
  // perdendo para o GM: 20 lances "perfeitos" já perdidos e 2 erros com a partida em jogo
  const lost = [...Array(20).fill({ acc: 100, before: 1, after: 1 }), { acc: 20, before: 50, after: 25 }, { acc: 40, before: 45, after: 30 }];
  const simple = lost.reduce((s, m) => s + m.acc, 0) / lost.length;
  assert.ok(simple > 90 && gameAccuracy(lost) < 50, `simples ${simple}, ponderada ${gameAccuracy(lost)}`);
});

test('expectativa pelo Elo', () => {
  near(expectedScore(1200, 1200), 0.5);
  near(expectedScore(1200, 1600), 1 / (1 + 10));
  assert.ok(expectedScore(400, 2700) < 0.001);
});

// [descrição, entrada, delta esperado]
const CASES = [
  ['vitória contra bot muito mais forte, precisão alta → teto', { score: 1, rating: 1200, botElo: BOT_ELO.mestre, accuracy: 92, playerMoves: 30 }, 25],
  ['vitória contra bot do mesmo nível, precisão 85', { score: 1, rating: 1200, botElo: BOT_ELO.intermediario, accuracy: 85, playerMoves: 30 }, 22],
  ['vitória contra bot do mesmo nível, precisão 60', { score: 1, rating: 1200, botElo: BOT_ELO.intermediario, accuracy: 60, playerMoves: 30 }, 18],
  ['vitória contra bot muito mais fraco → piso +4', { score: 1, rating: 1200, botElo: BOT_ELO.novato, accuracy: 70, playerMoves: 30 }, 4],
  ['derrota contra bot mais fraco, precisão baixa → −25', { score: 0, rating: 1200, botElo: BOT_ELO.novato, accuracy: 30, playerMoves: 30 }, -25],
  ['derrota contra bot do mesmo nível, precisão 70', { score: 0, rating: 1200, botElo: BOT_ELO.intermediario, accuracy: 70, playerMoves: 30 }, -13],
  ['derrota contra bot do mesmo nível, precisão 40', { score: 0, rating: 1200, botElo: BOT_ELO.intermediario, accuracy: 40, playerMoves: 30 }, -18],
  ['derrota contra bot muito mais forte jogando bem → −4', { score: 0, rating: 1200, botElo: BOT_ELO.gm, accuracy: 85, playerMoves: 30 }, -4],
  ['empate contra bot do mesmo nível, precisão 80', { score: 0.5, rating: 1200, botElo: BOT_ELO.intermediario, accuracy: 80, playerMoves: 30 }, 1],
  ['empate contra bot do mesmo nível, precisão 50', { score: 0.5, rating: 1200, botElo: BOT_ELO.intermediario, accuracy: 50, playerMoves: 30 }, -2],
  ['empate contra bot muito mais forte → teto +10', { score: 0.5, rating: 1200, botElo: BOT_ELO.gm, accuracy: 90, playerMoves: 30 }, 10],
  ['empate contra bot muito mais fraco → piso −10', { score: 0.5, rating: 1200, botElo: BOT_ELO.novato, accuracy: 50, playerMoves: 30 }, -10],
  ['desistência com 3 lances: derrota com precisão 0', { score: 0, rating: 400, botElo: BOT_ELO.novato, accuracy: 95, playerMoves: 3, early: true }, -24],
  ['desistência com 6 lances: precisão medida vale', { score: 0, rating: 400, botElo: BOT_ELO.novato, accuracy: 95, playerMoves: 6, early: true }, -9],
  ['mínimo de 100', { score: 0, rating: 105, botElo: BOT_ELO.novato, accuracy: 50, playerMoves: 30 }, -5],
  ['no mínimo não desce', { score: 0, rating: RATING_MIN, botElo: BOT_ELO.novato, accuracy: 10, playerMoves: 30 }, 0],
];
for (const [name, input, delta] of CASES) {
  test(`tabela: ${name} (${delta > 0 ? '+' : ''}${delta})`, () => {
    const r = ratingDelta(input);
    assert.equal(r.delta, delta);
    assert.equal(r.after, Math.max(RATING_MIN, input.rating + delta));
  });
}

test('limites: vitória +4…+25, derrota −25…−4, empate −10…+10', () => {
  for (const rating of [100, 400, 800, 1200, 1600, 2200, 2700, 3200]) {
    for (const botElo of Object.values(BOT_ELO)) {
      for (const accuracy of [0, 25, 50, 75, 100]) {
        const w = ratingDelta({ score: 1, rating, botElo, accuracy, playerMoves: 20 }).delta;
        const l = ratingDelta({ score: 0, rating: rating + 200, botElo, accuracy, playerMoves: 20 }).delta;
        const d = ratingDelta({ score: 0.5, rating: rating + 200, botElo, accuracy, playerMoves: 20 }).delta;
        assert.ok(w >= 4 && w <= 25, `vitória ${w}`);
        assert.ok(l >= -25 && l <= -4, `derrota ${l}`);
        assert.ok(d >= -10 && d <= 10, `empate ${d}`);
        assert.ok(Number.isInteger(w) && Number.isInteger(l) && Number.isInteger(d));
      }
    }
  }
});

test('jogar bem perdendo custa menos; jogar bem ganhando vale mais', () => {
  const base = { rating: 1200, botElo: 1200, playerMoves: 30 };
  assert.ok(ratingDelta({ ...base, score: 0, accuracy: 90 }).delta > ratingDelta({ ...base, score: 0, accuracy: 40 }).delta);
  assert.ok(ratingDelta({ ...base, score: 1, accuracy: 90 }).delta > ratingDelta({ ...base, score: 1, accuracy: 40 }).delta);
});

test('entrada inválida é erro', () => {
  assert.throws(() => ratingDelta({ score: 2, rating: 400, botElo: 400, accuracy: 50 }), RangeError);
  assert.throws(() => ratingDelta({ score: 1, rating: NaN, botElo: 400, accuracy: 50 }), RangeError);
});

// a API aceita bot_level = Object.keys(BOT_ELO) (src/games.mjs) e a interface monta BOTS com BOT_ELO
// (ui/test/rating.test.ts confere BOTS e o UCI_Elo do adaptador); aqui fica o valor esperado de cada nível
test('tabela de Elo nominal dos bots', () => {
  assert.deepEqual({ ...BOT_ELO }, { novato: 400, iniciante: 800, intermediario: 1200, avancado: 1600, mestre: 2200, gm: 2700 });
});
