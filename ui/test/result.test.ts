import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { resultOf, type ResultOpts } from '../src/core/result';

const base: ResultOpts = { player: 'w', hasBot: true, resigned: false, ended: false, botName: 'Bot Mestre' };
const after = (sans: string[], fen?: string) => {
  const c = fen ? new Chess(fen) : new Chess();
  for (const s of sans) c.move(s);
  return c;
};
const foolsMate = () => after(['f3', 'e5', 'g4', 'Qh4#']);

describe('resultOf', () => {
  it('partida em andamento', () => {
    expect(resultOf(after(['e4']), base)).toEqual({ status: 'andamento', result: null, text: 'Em andamento' });
  });
  it('desistência: derrota contra bot, livre sem bot', () => {
    expect(resultOf(after(['e4']), { ...base, resigned: true })).toEqual({
      status: 'concluida',
      result: 'derrota',
      text: 'Você desistiu. Bot Mestre vence',
    });
    expect(resultOf(after(['e4']), { ...base, hasBot: false, resigned: true }).result).toBe('livre');
  });
  it('xeque-mate: vitória ou derrota conforme o lado do jogador; livre sem bot', () => {
    expect(resultOf(foolsMate(), base)).toEqual({ status: 'concluida', result: 'derrota', text: 'Pretas vencem por xeque-mate' });
    expect(resultOf(foolsMate(), { ...base, player: 'b' }).result).toBe('vitoria');
    expect(resultOf(foolsMate(), { ...base, hasBot: false }).result).toBe('livre');
  });
  it('empates com o motivo no texto', () => {
    expect(resultOf(new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'), base).text).toBe('Empate por afogamento');
    expect(resultOf(new Chess('8/8/8/8/8/8/8/K6k w - - 0 1'), base).text).toBe('Empate por material insuficiente');
    expect(resultOf(after(['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']), base)).toEqual({
      status: 'concluida',
      result: 'empate',
      text: 'Empate por repetição',
    });
    expect(resultOf(new Chess('8/8/8/8/8/8/R7/K6k w - - 100 80'), base).text).toBe('Empate pela regra dos 50 lances');
  });
  it('encerrada pelo jogador', () => {
    expect(resultOf(after(['e4']), { ...base, ended: true })).toEqual({
      status: 'concluida',
      result: 'encerrada',
      text: 'Partida encerrada pelo jogador',
    });
  });
  it('desistir vale mais que o resto (mesmo com mate na posição)', () => {
    expect(resultOf(foolsMate(), { ...base, player: 'b', resigned: true }).result).toBe('derrota');
  });
});
