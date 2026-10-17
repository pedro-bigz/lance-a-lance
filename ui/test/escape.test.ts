import { describe, expect, it } from 'vitest';
import { esc } from '../src/ui/escape';
import { fmtDelta, pct } from '../src/ui/format';
import { parseInfo } from '../src/engine/engine';

describe('escape de HTML', () => {
  it('escapa & < > e aspas duplas', () => {
    expect(esc('<b class="x">Tom & Jerry</b>')).toBe('&lt;b class=&quot;x&quot;&gt;Tom &amp; Jerry&lt;/b&gt;');
    expect(esc("d'Ávila")).toBe("d'Ávila");
    expect(esc(42)).toBe('42');
    expect(esc(null)).toBe('null');
  });
});

describe('formatação', () => {
  it('variação de pontuação com sinal', () => {
    expect(fmtDelta(10)).toBe('+10');
    expect(fmtDelta(-10)).toBe('−10');
    expect(fmtDelta(0)).toBe('±0');
  });
  it('porcentagem inteira, 0 sem total', () => {
    expect(pct(1, 3)).toBe(33);
    expect(pct(5, 0)).toBe(0);
  });
});

describe('linha "info" do Stockfish', () => {
  it('lê profundidade, multipv, nota e variante', () => {
    expect(parseInfo('info depth 12 seldepth 18 multipv 2 score cp -35 nodes 1 pv e7e5 g1f3')).toEqual({
      multipv: 2,
      depth: 12,
      score: { cp: -35 },
      pv: ['e7e5', 'g1f3'],
    });
    expect(parseInfo('info depth 9 score mate 3 pv h5f7')).toEqual({ multipv: 1, depth: 9, score: { mate: 3 }, pv: ['h5f7'] });
  });
  it('ignora limites (lowerbound/upperbound) e linhas sem nota', () => {
    expect(parseInfo('info depth 9 score cp 20 lowerbound pv e2e4')).toBeNull();
    expect(parseInfo('info string NNUE')).toBeNull();
  });
});
