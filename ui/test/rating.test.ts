import { describe, expect, it } from 'vitest';
import {
  RATING_MIN,
  RATING_START,
  applyResult,
  freshRating,
  localDelta,
  parseRating,
  playerAccuracy,
  ratingScore,
  recommendBot,
} from '../src/core/rating';
import { BOTS } from '../src/core/constants';
import type { ClsResult } from '../src/core/types';
import { Stockfish19LiteAdapter } from '../src/engine/adapters/sf19-lite';
import { BOT_ELO, gameAccuracy } from '../../shared/rating.mjs';

describe('regras do rating local', () => {
  it('pontuação da partida', () => {
    expect(ratingScore('vitoria')).toBe(1);
    expect(ratingScore('empate')).toBe(0.5);
    expect(ratingScore('derrota')).toBe(0);
    expect(ratingScore('encerrada')).toBe(0);
    expect(ratingScore('livre')).toBeNull();
    expect(ratingScore('importada')).toBeNull();
    expect(ratingScore(null)).toBeNull();
  });
  it('aplica a variação da fórmula única, com contadores, precisão e registro por partida', () => {
    const r = freshRating();
    expect(r.rating).toBe(RATING_START);
    const w = localDelta(400, { score: 1, bot: 'intermediario', accuracy: 85, playerMoves: 30, early: false });
    expect(w.delta).toBe(25); // bot 800 acima: vitória perto do teto
    expect(applyResult(r, 'g1', w, 1000)).toEqual({ delta: 25, before: 400, after: 425, at: 1000, accuracy: 85 });
    const l = localDelta(425, { score: 0, bot: 'novato', accuracy: 40, playerMoves: 30, early: false });
    expect(applyResult(r, 'g2', l, 2000)).toMatchObject({ delta: l.delta, after: 425 + l.delta });
    expect(l.delta).toBeLessThan(-15);
    const d = localDelta(r.rating, { score: 0.5, bot: 'iniciante', accuracy: 70, playerMoves: 30, early: false });
    applyResult(r, 'g3', d, 3000);
    expect(r).toMatchObject({ games: 3, wins: 1, losses: 1, draws: 1 });
    expect(Object.keys(r.applied)).toEqual(['g1', 'g2', 'g3']);
  });
  it('mesmos números da API (shared/rating.mjs): desistência precoce e limites', () => {
    const early = localDelta(400, { score: 0, bot: 'novato', accuracy: 100, playerMoves: 2, early: true });
    expect(early).toMatchObject({ delta: -24, penalty: true, accuracy: 0 });
    expect(localDelta(400, { score: 1, bot: 'gm', accuracy: 100, playerMoves: 40, early: false }).delta).toBe(25);
    expect(localDelta(2000, { score: 0, bot: 'gm', accuracy: 90, playerMoves: 40, early: false }).delta).toBeGreaterThanOrEqual(-25);
  });
  it('não desce abaixo do mínimo', () => {
    const r = { ...freshRating(), rating: RATING_MIN + 5 };
    const out = localDelta(r.rating, { score: 0, bot: 'novato', accuracy: 20, playerMoves: 30, early: false });
    expect(applyResult(r, 'g', out)).toMatchObject({ delta: -5, after: RATING_MIN });
    const out2 = localDelta(r.rating, { score: 0, bot: 'novato', accuracy: 20, playerMoves: 30, early: false });
    expect(applyResult(r, 'h', out2)).toMatchObject({ delta: 0, after: RATING_MIN });
  });
  it('precisão do jogador pela análise da página: livro = 100, espera a classificação de todos os lances dele', () => {
    const c = (acc: number, book = false): ClsResult => ({
      key: book ? 'livro' : 'boa',
      loss: 0,
      bestWp: null,
      afterWp: null,
      isBest: false,
      nLegal: 2,
      acc,
      book,
    });
    const colors = ['w', 'b', 'w', 'b', 'w'];
    // média harmônica ponderada (sem as chances, peso 1): 3 / (1/100 + 1/80 + 1/60)
    expect(playerAccuracy([c(0, true), null, c(80), c(10), c(60)], colors, 'w')!.accuracy).toBeCloseTo(3 / (1 / 100 + 1 / 80 + 1 / 60), 9);
    expect(playerAccuracy([c(0, true), c(50), null, c(10), c(60)], colors, 'w')).toBeNull();
    // precisão 10 ou menos entra como 10 (piso): 2 / (1/50 + 1/10)
    expect(playerAccuracy([c(0, true), c(50), null, c(10), c(60)], colors, 'b')!.accuracy).toBeCloseTo(2 / (1 / 50 + 1 / 10), 9);
    // parcial (motor indisponível): só os lances já classificados, moves conta todos
    expect(playerAccuracy([c(0, true), c(50), null, c(10), c(60)], colors, 'w', true)).toEqual({ accuracy: gameAccuracy([100, 60]), moves: 3 });
  });
  it('Elo dos bots: o mesmo da tabela da API (BOT_ELO) na lista de bots e no UCI_Elo do Stockfish 19', () => {
    for (const b of BOTS) if (b.id !== 'none') expect(b.elo).toBe(BOT_ELO[b.id]);
    const sf = new Stockfish19LiteAdapter();
    expect(sf.botLevels.avancado.elo).toBe(BOT_ELO.avancado);
    expect(sf.botLevels.mestre.elo).toBe(BOT_ELO.mestre);
    expect(Object.keys(BOT_ELO)).toEqual(BOTS.filter((b) => b.id !== 'none').map((b) => b.id));
  });
  it('guarda no máximo 500 partidas aplicadas (descarta a mais antiga)', () => {
    const r = freshRating();
    const draw = localDelta(400, { score: 0.5, bot: 'novato', accuracy: 70, playerMoves: 20, early: false });
    for (let i = 0; i < 501; i++) applyResult(r, 'g' + i, draw);
    expect(Object.keys(r.applied).length).toBe(500);
    expect(r.applied.g0).toBeUndefined();
    expect(r.applied.g500).toBeDefined();
  });
  it('lê o registro guardado com padrões e ignora lixo', () => {
    expect(parseRating(null)).toEqual(freshRating());
    expect(parseRating('{nada')).toEqual(freshRating());
    expect(parseRating('{"rating":"x"}')).toEqual(freshRating());
    expect(parseRating('{"rating":520,"wins":3}')).toEqual({ rating: 520, games: 0, wins: 3, losses: 0, draws: 0, applied: {} });
  });
  it('recomenda o bot de Elo mais próximo', () => {
    expect(recommendBot(400).id).toBe('novato');
    expect(recommendBot(1000).id).toBe('iniciante');
    expect(recommendBot(1300).id).toBe('intermediario');
    expect(recommendBot(3000).id).toBe('gm');
  });
});
