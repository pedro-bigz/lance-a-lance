import { describe, expect, it } from 'vitest';
import { BOOK_CLS, classify } from '../src/core/classify';
import { accuracy, evalText, povWp, pvSan, uciToSan, wpCp } from '../src/core/eval';
import type { Analysis, ClassifyInput, ClsResult } from '../src/core/types';
import { analysis, cpForLoss, playSans } from './helpers';

function input(
  sans: string[],
  cache: [number, Analysis][],
  opts: { fen?: string; bookLen?: number; cls?: ClassifyInput['cls'] } = {},
): ClassifyInput {
  const { positions, plies } = playSans(sans, opts.fen);
  return {
    positions,
    plies,
    cls: opts.cls || [],
    cache: new Map(cache.map(([i, a]) => [positions[i] as string, a])),
    bookLen: opts.bookLen ?? 0,
  };
}
const key = (r: ClsResult | null) => r && r.key;

describe('avaliação', () => {
  it('chance de vitória e precisão', () => {
    expect(wpCp(0)).toBe(50);
    expect(povWp(analysis([{ score: { mate: 2 }, pv: [] }]))).toBe(100);
    expect(povWp(analysis([], 'mate'))).toBe(0);
    expect(povWp(analysis([], 'draw'))).toBe(50);
    expect(accuracy(0)).toBeCloseTo(100, 0);
    expect(accuracy(100)).toBe(0);
  });
  it('evalText mostra a nota do ponto de vista das brancas', () => {
    const blackToMove = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
    expect(evalText(analysis([{ score: { cp: 50 }, pv: [] }]), blackToMove)).toBe('−0.5');
    expect(evalText(analysis([{ score: { mate: 3 }, pv: [] }]), blackToMove)).toBe('−M3');
    expect(evalText(null, blackToMove)).toBe('…');
    expect(evalText(analysis([], 'draw'), blackToMove)).toBe('½-½');
  });
  it('uciToSan e pvSan', () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(uciToSan(start, 'g1f3')).toBe('Nf3');
    expect(uciToSan(start, null)).toBe('—');
    expect(pvSan(start, ['e2e4', 'e7e5', 'g1f3'], 6)).toBe('1. e4 e5 2. Nf3');
  });
});

describe('classify', () => {
  it('lance dentro do livro sai como Livro', () => {
    expect(classify(input(['e4'], [], { bookLen: 1 }), 0)).toBe(BOOK_CLS);
  });
  it('sem a análise das duas posições ainda não classifica', () => {
    expect(classify(input(['e4'], [[0, analysis([{ score: { cp: 0 }, pv: ['e2e4'] }])]]), 0)).toBeNull();
  });
  it('o lance do motor é Melhor', () => {
    const r = classify(
      input(
        ['e4'],
        [
          [0, analysis([{ score: { cp: 0 }, pv: ['e2e4', 'e7e5'] }])],
          [1, analysis([{ score: { cp: 0 }, pv: ['e7e5'] }])],
        ],
      ),
      0,
    );
    expect(r).toMatchObject({ key: 'melhor', loss: 0, isBest: true, nLegal: 20 });
  });
  it.each([
    [1, 'excelente'],
    [3, 'boa'],
    [7, 'imprecisao'],
    [15, 'erro'],
    [30, 'capivarada'],
  ])('perda de %d%% de chance de vitória é %s', (loss, expected) => {
    const r = classify(
      input(
        ['a3'],
        [
          [0, analysis([{ score: { cp: 0 }, pv: ['e2e4'] }])],
          [1, analysis([{ score: { cp: cpForLoss(loss) }, pv: ['e7e5'] }])],
        ],
      ),
      0,
    );
    expect(key(r)).toBe(expected);
    expect(r!.loss).toBeCloseTo(loss, 3);
  });
  it('lance que é a 2ª linha do motor usa a nota da mesma busca', () => {
    const r = classify(
      input(
        ['a3'],
        [
          [
            0,
            analysis([
              { score: { cp: 0 }, pv: ['e2e4'] },
              { score: { cp: -cpForLoss(15) }, pv: ['a2a3'] },
            ]),
          ],
          [1, analysis([{ score: { cp: 0 }, pv: [] }])],
        ],
      ),
      0,
    );
    expect(key(r)).toBe('erro');
  });
  it('único lance bom é Ótima', () => {
    const r = classify(
      input(
        ['e4'],
        [
          [
            0,
            analysis([
              { score: { cp: 0 }, pv: ['e2e4'] },
              { score: { cp: -200 }, pv: ['d2d4'] },
            ]),
          ],
          [1, analysis([{ score: { cp: 0 }, pv: [] }])],
        ],
      ),
      0,
    );
    expect(key(r)).toBe('otima');
  });
  it('não punir o erro do rival é Chance perdida; sem erro antes, continua Erro', () => {
    const bestWp = wpCp(300);
    const after = cpForLoss(100 - (bestWp - 12) - 50);
    const cache: [number, Analysis][] = [
      [1, analysis([{ score: { cp: 300 }, pv: ['d7d5'] }])],
      [2, analysis([{ score: { cp: after }, pv: [] }])],
    ];
    const prevErro = { ...BOOK_CLS, key: 'erro' as const, book: false };
    expect(key(classify(input(['e4', 'e5'], cache, { cls: [prevErro] }), 1))).toBe('chance');
    expect(key(classify(input(['e4', 'e5'], cache, { cls: [{ ...prevErro, key: 'melhor' }] }), 1))).toBe('erro');
  });
  it('sacrifício correto é Brilhante', () => {
    const r = classify(
      input(
        ['e4', 'e5', 'Nf3', 'Nc6', 'Nxe5'],
        [
          [4, analysis([{ score: { cp: 30 }, pv: ['f3e5'] }])],
          [5, analysis([{ score: { cp: -40 }, pv: ['c6e5', 'd2d4'] }])],
        ],
      ),
      4,
    );
    expect(key(r)).toBe('brilhante');
  });
  it('xeque-mate e lance único são Melhor', () => {
    const mate = classify(
      input(
        ['f3', 'e5', 'g4', 'Qh4#'],
        [
          [3, analysis([{ score: { mate: 1 }, pv: ['d8h4'] }])],
          [4, analysis([], 'mate')],
        ],
      ),
      3,
    );
    expect(key(mate)).toBe('melhor');
    const only = classify(
      input(
        ['Kxb2'],
        [
          [0, analysis([{ score: { cp: -100 }, pv: ['a1b2'] }])],
          [1, analysis([], 'draw')],
        ],
        { fen: 'k7/8/8/8/8/8/1q6/K7 w - - 0 1' },
      ),
      0,
    );
    expect(only).toMatchObject({ key: 'melhor', nLegal: 1 });
  });
});
