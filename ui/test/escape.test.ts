import { describe, expect, it } from 'vitest';
import { esc } from '../src/ui/escape';
import { fmtDelta, pct } from '../src/ui/format';

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
