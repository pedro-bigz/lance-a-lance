// Da análise ao delta (puro): junta o resultado gravado, o lado do jogador, o Elo do bot e a precisão medida pelo
// Stockfish e aplica a fórmula única (shared/rating.mjs).
// Proteções além da fórmula: lances ilegais ou um resultado que o tabuleiro não confirma (vitória sem mate do bot,
// empate sem empate no tabuleiro) contam como derrota com precisão 0; o app oficial nunca grava nada disso.
import { BOT_ELO, ratingDelta } from '../../../shared/rating.mjs';
import { confirmOutcome } from './analyse-game.mjs';
import { PermanentRatingError } from './queue.mjs';

/** motivos de conclusão que não vêm do tabuleiro: com menos de 6 lances do jogador, penalidade máxima */
export const EARLY_REASONS = ['desistencia', 'encerrada'];

export function outcomeFor(result, color) {
  if (!result || !color) return null;
  if (result === '1/2-1/2') return 'empate';
  return (result === '1-0') === (color === 'w') ? 'vitoria' : 'derrota';
}
export const playerColor = (g) => (g.white_user_id != null ? 'w' : g.black_user_id != null ? 'b' : null);
const SCORE = { vitoria: 1, empate: 0.5, derrota: 0 };
const REASON = { 1: 'vitoria', 0.5: 'empate', 0: 'derrota' };

/**
 * @param g linha de games (result, result_reason, bot_level, white_user_id, black_user_id)
 * @param a resultado de playerAccuracy (ok, accuracy, playerMoves, final)
 * @param rating pontuação atual do jogador
 */
export function computeRating(g, a, rating) {
  const color = playerColor(g);
  const outcome = outcomeFor(g.result, color);
  if (!outcome) throw new PermanentRatingError('partida sem resultado ou sem jogador');
  const botElo = BOT_ELO[g.bot_level];
  if (!botElo) throw new PermanentRatingError(`nível de bot desconhecido: ${g.bot_level}`);
  const trusted = a.ok && confirmOutcome(outcome, color, a.final);
  const r = ratingDelta({
    score: trusted ? SCORE[outcome] : 0,
    rating,
    botElo,
    accuracy: trusted ? a.accuracy : 0,
    playerMoves: a.playerMoves,
    early: EARLY_REASONS.includes(g.result_reason),
  });
  return { ...r, botElo, outcome, reason: REASON[r.score], trusted };
}
