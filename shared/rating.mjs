// Fórmula da pontuação (rating) do Lance a Lance: módulo único, puro (sem DOM, sem Node, sem dependências), importado
// pela API (api/src/rating/, que analisa a partida com o Stockfish no servidor) e pela interface (ui/src/core/rating.ts,
// o rating local do artifact, que usa a análise do próprio navegador). Mudar um número aqui muda os dois lados.
//
// Pontos de uma partida que vale pontuação (modo normal contra bot):
//   1. precisão do jogador (0–100): para cada lance DELE, a perda de chance de vitória Δ = max(0, antes − depois)
//      (curva logística do motor, WP_K); precisão do lance = 103,1668·e^(−0,04354·Δ) − 3,1669, limitada a [0, 100];
//      lance de livro de abertura = 100. Precisão da partida = média harmônica ponderada das precisões dos lances
//      (peso = quanto a partida ainda estava em jogo naquele lance; veja gameAccuracy).
//   2. expectativa pelo Elo: E = 1 / (1 + 10^((eloBot − ratingJogador) / 400)); resultado S = 1 / 0,5 / 0.
//   3. base = K·(S − E), K = 32.
//   4. qualidade: vitória → base × (0,5 + precisão/100); derrota → base × (1,5 − precisão/100);
//      empate → K·(0,5 − E) + (precisão − 70)/10.
//   5. limites: vitória +4…+25, derrota −25…−4, empate −10…+10; inteiro; rating mínimo 100.
//   6. antiabuso: desistir ou encerrar antes de 6 lances do jogador conta como derrota com precisão 0.

/** inclinação da curva centipeões → chance de vitória (a mesma do Lichess; a interface usa a mesma em core/eval.ts) */
export const WP_K = 0.00368208;
export const RATING_START = 400;
export const RATING_MIN = 100;
export const K_FACTOR = 32;
/** lances do jogador abaixo dos quais desistir/encerrar recebe a penalidade máxima */
export const MIN_PLAYER_MOVES = 6;
export const LIMITS = Object.freeze({ win: [4, 25], loss: [-25, -4], draw: [-10, 10] });

/** Elo nominal de cada nível do bot (o mesmo que a interface mostra em BOTS, core/constants.ts) */
export const BOT_ELO = Object.freeze({ novato: 400, iniciante: 800, intermediario: 1200, avancado: 1600, mestre: 2200, gm: 2700 });

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** chance de vitória (0–100) de quem joga a partir dos centipeões */
export const winPct = (cp, k = WP_K) => 50 + 50 * (2 / (1 + Math.exp(-k * cp)) - 1);
/** chance de vitória de uma nota {cp} ou {mate} do ponto de vista de quem joga; sem nota = 50 */
export const scoreWinPct = (s, k = WP_K) => (!s ? 50 : s.mate != null ? (s.mate > 0 ? 100 : 0) : winPct(s.cp, k));
/** precisão (0–100) de um lance a partir da perda de chance de vitória (0–100) */
export const moveAccuracy = (loss) => clamp(103.1668 * Math.exp(-0.04354 * Math.max(0, loss)) - 3.1669, 0, 100);

/** piso da precisão de um lance dentro da média harmônica (sem ele, um único lance com precisão 0 zera a partida) */
export const ACC_FLOOR = 10;
/** peso mínimo de um lance (posição já decidida) */
export const MIN_WEIGHT = 0.1;
/**
 * Peso de um lance na média: quanto a partida ainda estava em jogo, 4·p·(1−p) com p = chance de vitória antes ou
 * depois do lance (o maior dos dois; 1 com a partida equilibrada, perto de 0 com ela decidida), no mínimo MIN_WEIGHT.
 * Sem as chances (lance de livro) o peso é 1. Assim os lances feitos numa posição já perdida (ou já ganha), em que
 * qualquer lance "não perde nada", quase não contam; e o lance que joga fora uma vitória conta inteiro (depois dele
 * a partida voltou a ficar em jogo).
 */
export function moveWeight(before, after) {
  if (!Number.isFinite(before) || !Number.isFinite(after)) return 1;
  const w = (p) => 4 * (p / 100) * (1 - p / 100);
  return Math.max(MIN_WEIGHT, w(clamp(before, 0, 100)), w(clamp(after, 0, 100)));
}
/**
 * Precisão da partida: média harmônica ponderada das precisões dos lances do jogador, Σw / Σ(w / max(ACC_FLOOR, a)).
 * Cada item é a precisão do lance (número, peso 1) ou {acc, before, after} (chances de vitória do jogador antes e
 * depois do lance, para o peso). Lances de livro entram como 100. null se não há lance.
 * Medido em partidas reais (Stockfish 19, profundidade 14; api/README.md, "Pontuação"): a média simples dava 95 a
 * quem perdeu para o Grão-mestre jogando lances ao acaso, porque depois de perdida a partida todo lance "perde 0";
 * a harmônica ponderada dá 68 nessa partida e mantém 96–99 nas partidas limpas.
 */
export function gameAccuracy(moves) {
  let W = 0, inv = 0;
  for (const m of moves || []) {
    const o = typeof m === 'number' ? { acc: m } : m || {};
    if (!Number.isFinite(o.acc)) continue;
    const w = moveWeight(o.before, o.after);
    W += w;
    inv += w / Math.max(ACC_FLOOR, clamp(o.acc, 0, 100));
  }
  return W ? W / inv : null;
}

/** pontuação esperada pelo Elo */
export const expectedScore = (playerRating, botElo) => 1 / (1 + Math.pow(10, (botElo - playerRating) / 400));

/**
 * Pontos de uma partida.
 * @param {{score: 1|0.5|0, rating: number, botElo: number, accuracy: number|null, playerMoves: number, early?: boolean}} p
 *   early: a partida acabou por desistência/encerramento (não no tabuleiro); com menos de MIN_PLAYER_MOVES lances do
 *   jogador vira derrota com precisão 0.
 * @returns {{delta: number, before: number, after: number, expected: number, accuracy: number, score: number, raw: number, penalty: boolean}}
 */
export function ratingDelta({ score, rating, botElo, accuracy, playerMoves = 0, early = false }) {
  if (score !== 1 && score !== 0.5 && score !== 0) throw new RangeError('score deve ser 1, 0,5 ou 0');
  if (!Number.isFinite(rating) || !Number.isFinite(botElo)) throw new RangeError('rating e botElo devem ser números');
  const penalty = early && playerMoves < MIN_PLAYER_MOVES;
  const s = penalty ? 0 : score;
  const acc = penalty ? 0 : clamp(Number.isFinite(accuracy) ? accuracy : 0, 0, 100);
  const E = expectedScore(rating, botElo);
  let raw, lim;
  if (s === 1) {
    raw = K_FACTOR * (1 - E) * (0.5 + acc / 100);
    lim = LIMITS.win;
  } else if (s === 0) {
    raw = K_FACTOR * (0 - E) * (1.5 - acc / 100);
    lim = LIMITS.loss;
  } else {
    raw = K_FACTOR * (0.5 - E) + (acc - 70) / 10;
    lim = LIMITS.draw;
  }
  const step = Math.round(clamp(raw, lim[0], lim[1])) || 0;
  const after = Math.max(RATING_MIN, rating + step);
  return { delta: after - rating, before: rating, after, expected: E, accuracy: acc, score: s, raw, penalty };
}
