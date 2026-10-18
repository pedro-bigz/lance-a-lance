/* ---------- Regras do rating ----------
   Começa em 400. Só partidas contra bot jogadas do início ao fim no modo normal contam. Os pontos de cada partida
   dependem do resultado, da força do bot em relação ao rating e da precisão dos lances do jogador medida pelo
   Stockfish; o mínimo é 100. A fórmula é uma só (shared/rating.mjs), importada também pela API:
   - no app desktop a API calcula no servidor, com o próprio Stockfish (a página só mostra o resultado);
   - no artifact o rating fica neste navegador e usa a análise da própria página (playerAccuracy abaixo). */
import {
  BOT_ELO,
  RATING_MIN as MIN,
  RATING_START as START,
  gameAccuracy,
  ratingDelta,
  type MoveAccuracy,
  type RatingOutcome,
} from '../../../shared/rating.mjs';
import { BOTS, type Bot } from './constants';
import type { LocalResult } from './result';
import type { ClsResult } from './types';

export const RATING_START = START,
  RATING_MIN = MIN;
/** texto curto da regra (dica do rating e nota da tela de Estatísticas) */
export const RATING_RULE = 'Os pontos dependem do resultado, da força do bot e da precisão dos seus lances, medida pelo Stockfish.';

export interface RatingApplied {
  delta: number;
  before: number;
  after: number;
  at: number;
  /** precisão do jogador (0–100) usada no cálculo; ausente nos registros de antes da fórmula pelo Stockfish */
  accuracy?: number | null;
}
/** Registro do rating no localStorage (lance-a-lance:rating:v1). applied: partida → variação já aplicada. */
export interface RatingRecord {
  rating: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  applied: Record<string, RatingApplied>;
}
export const freshRating = (): RatingRecord => ({ rating: RATING_START, games: 0, wins: 0, losses: 0, draws: 0, applied: {} });

// pontuação da partida para o rating: 1 vitória, 0,5 empate, 0 derrota (desistir ou encerrar contam como derrota)
export function ratingScore(result: LocalResult | null): 1 | 0.5 | 0 | null {
  if (result === 'vitoria') return 1;
  if (result === 'empate') return 0.5;
  if (result === 'derrota' || result === 'encerrada') return 0;
  return null;
}

/** Precisão do jogador pela análise da página: lances de livro = 100, os outros pela perda (cls.acc), com as chances
    antes/depois para o peso (gameAccuracy). null enquanto faltar a classificação de algum lance do jogador; com
    partial, usa só os lances já classificados (moves conta todos os lances do jogador). */
export function playerAccuracy(
  cls: readonly (ClsResult | null | undefined)[],
  colors: readonly string[],
  player: string,
  partial = false,
): { accuracy: number | null; moves: number } | null {
  const accs: MoveAccuracy[] = [];
  let moves = 0;
  for (let i = 0; i < colors.length; i++) {
    if (colors[i] !== player) continue;
    moves++;
    const c = cls[i];
    if (!c) {
      if (partial) continue;
      return null;
    }
    accs.push(c.book ? { acc: 100 } : { acc: c.acc, before: c.bestWp, after: c.afterWp });
  }
  return { accuracy: gameAccuracy(accs), moves };
}

export interface LocalGame {
  score: 1 | 0.5 | 0;
  bot: string;
  accuracy: number | null;
  playerMoves: number;
  /** acabou por desistência ou "encerrar" (não no tabuleiro) */
  early: boolean;
}
/** Pontos de uma partida local pela fórmula única. */
export function localDelta(rating: number, g: LocalGame): RatingOutcome {
  const botElo = BOT_ELO[g.bot as keyof typeof BOT_ELO] ?? (BOTS.find((b) => b.id === g.bot)?.elo as number);
  return ratingDelta({ score: g.score, rating, botElo, accuracy: g.accuracy, playerMoves: g.playerMoves, early: g.early });
}
/** Aplica o resultado de uma partida ao registro; devolve a variação gravada. */
export function applyResult(r: RatingRecord, gameId: string, out: RatingOutcome, now = Date.now()): RatingApplied {
  const before = r.rating;
  r.rating = Math.max(RATING_MIN, before + out.delta);
  r.games++;
  if (out.score === 1) r.wins++;
  else if (out.score === 0) r.losses++;
  else r.draws++;
  r.applied[gameId] = { delta: r.rating - before, before, after: r.rating, at: now, accuracy: Math.round(out.accuracy * 10) / 10 };
  const keys = Object.keys(r.applied);
  if (keys.length > 500) delete r.applied[keys[0] as string];
  return r.applied[gameId];
}
/** Lê o registro guardado (texto do localStorage), com padrões para o que faltar. */
export function parseRating(text: string | null): RatingRecord {
  try {
    const d = JSON.parse(text || 'null');
    if (d && typeof d.rating === 'number') return Object.assign({ games: 0, wins: 0, losses: 0, draws: 0, applied: {} }, d);
  } catch (_) {}
  return freshRating();
}
// bot com o Elo mais próximo do rating
export function recommendBot(r: number): Bot {
  return BOTS.filter((b) => b.elo).reduce((best, b) => (Math.abs((b.elo as number) - r) < Math.abs((best.elo as number) - r) ? b : best));
}
