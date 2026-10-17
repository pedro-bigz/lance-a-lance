/* ---------- Regras do rating local (artifact) ----------
   Começa em 400. Só partidas contra bot jogadas do início ao fim no modo normal contam. Cada vitória soma 10
   pontos e cada derrota tira 10; empate não muda; o mínimo é 100. No app desktop a pontuação é calculada pela API. */
import { BOTS, type Bot } from './constants';
import type { LocalResult } from './result';

export const RATING_START = 400,
  RATING_MIN = 100;
export const RATING_STEP = 10;

export interface RatingApplied {
  delta: number;
  before: number;
  after: number;
  at: number;
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
export function ratingScore(result: LocalResult | null): number | null {
  if (result === 'vitoria') return 1;
  if (result === 'empate') return 0.5;
  if (result === 'derrota' || result === 'encerrada') return 0;
  return null;
}
/** Aplica o resultado de uma partida (score de ratingScore) ao registro; devolve o registro novo e a variação. */
export function applyScore(r: RatingRecord, gameId: string, score: number, now = Date.now()): RatingApplied {
  const before = r.rating;
  const delta = score === 1 ? RATING_STEP : score === 0 ? -RATING_STEP : 0;
  r.rating = Math.max(RATING_MIN, before + delta);
  r.games++;
  if (score === 1) r.wins++;
  else if (score === 0) r.losses++;
  else r.draws++;
  r.applied[gameId] = { delta: r.rating - before, before, after: r.rating, at: now };
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
