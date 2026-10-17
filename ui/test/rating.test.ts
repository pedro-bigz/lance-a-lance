import { describe, expect, it } from 'vitest';
import { RATING_MIN, RATING_START, applyScore, freshRating, parseRating, ratingScore, recommendBot } from '../src/core/rating';

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
  it('vitória +10, derrota −10, empate 0, com contadores e registro por partida', () => {
    const r = freshRating();
    expect(r.rating).toBe(RATING_START);
    expect(applyScore(r, 'g1', 1, 1000)).toEqual({ delta: 10, before: 400, after: 410, at: 1000 });
    expect(applyScore(r, 'g2', 0, 2000)).toMatchObject({ delta: -10, after: 400 });
    expect(applyScore(r, 'g3', 0.5, 3000)).toMatchObject({ delta: 0, after: 400 });
    expect(r).toMatchObject({ rating: 400, games: 3, wins: 1, losses: 1, draws: 1 });
    expect(Object.keys(r.applied)).toEqual(['g1', 'g2', 'g3']);
  });
  it('não desce abaixo do mínimo', () => {
    const r = { ...freshRating(), rating: RATING_MIN + 5 };
    expect(applyScore(r, 'g', 0)).toMatchObject({ delta: -5, after: RATING_MIN });
    expect(applyScore(r, 'h', 0)).toMatchObject({ delta: 0, after: RATING_MIN });
  });
  it('guarda no máximo 500 partidas aplicadas (descarta a mais antiga)', () => {
    const r = freshRating();
    for (let i = 0; i < 501; i++) applyScore(r, 'g' + i, 0.5);
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
