import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import {
  BOOK,
  BOOK_LINES,
  START_KEY,
  bookLength,
  findLines,
  inBook,
  norm,
  openingAt,
  openingName,
  openingNameOfLines,
  pgnOf,
  pickVariety,
  validLine,
} from '../src/book/index';
import { cyrb53, posKey } from '../src/book/hash';
import { bookNext, bookTree, linesNext, sanStep } from '../src/book/tree';
import { playSans } from './helpers';

const fenAfter = (sans: string[]) => {
  const c = new Chess();
  for (const s of sans) c.move(s);
  return c.fen();
};

describe('hash e dados do livro', () => {
  it('cyrb53 dá os mesmos valores da página original e de tools/gerar-livro.mjs', () => {
    expect(cyrb53('abc')).toBe(5059922895146125);
    expect(cyrb53('')).toBe(3338908027751811);
  });
  it('posKey ignora os contadores de lances', () => {
    expect(posKey('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1')).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3');
  });
  it('carrega o livro inteiro', () => {
    expect(BOOK.size).toBe(8094);
    expect(BOOK_LINES.length).toBe(3954);
    expect(START_KEY).toBe(posKey(new Chess().fen()));
  });
});

describe('openingName / openingAt / bookLength', () => {
  it('nomeia posições do livro', () => {
    expect(openingName(fenAfter(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']))).toBe('Abertura Italiana');
    expect(openingName(fenAfter(['e4', 'c5']))).toBe('Defesa Siciliana');
    expect(openingName(new Chess().fen())).toBeNull();
  });
  it('openingAt usa a última posição com nome até o lance', () => {
    const { positions } = playSans(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'a6']);
    expect(openingAt(positions, 5)).toBe('Abertura Italiana');
    expect(openingAt(positions, 6)).toBe('Abertura Italiana');
    expect(openingAt(positions, 0)).toBeNull();
  });
  it('bookLength conta os lances de livro seguidos desde a posição inicial', () => {
    const { positions, plies } = playSans(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Qh4']);
    expect(inBook(positions[5] as string)).toBe(true);
    expect(bookLength(positions, plies.length)).toBe(5);
  });
  it('bookLength é 0 quando a partida não começa da posição inicial', () => {
    const { positions, plies } = playSans(['e5'], 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
    expect(bookLength(positions, plies.length)).toBe(0);
  });
});

describe('findLines', () => {
  it('acha pelo nome em português, sem acento e por apelido em inglês', () => {
    const it1 = findLines('italiana');
    expect(it1.length).toBeGreaterThan(0);
    expect(it1.every((l) => norm(l.name).includes('italiana'))).toBe(true);
    expect(findLines('italian')).toEqual(it1);
    expect(findLines('Índia do Rei').length).toBeGreaterThan(0);
    expect(findLines('kings indian')).toEqual(findLines('india do rei'));
  });
  it('todas as palavras precisam aparecer no nome', () => {
    const l = findLines('gambito evans');
    expect(l.length).toBeGreaterThan(0);
    expect(l.every((x) => /Gambito Evans/.test(x.name))).toBe(true);
    expect(l[0]?.sans.slice(0, 7)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'b4']);
  });
  it('apelido só troca palavra inteira e consulta só com palavras vazias não acha nada', () => {
    expect(findLines('italianaa')).toEqual([]);
    expect(findLines('abertura de defesa')).toEqual([]);
    expect(findLines('')).toEqual([]);
  });
});

describe('próximos lances (árvore do estudo)', () => {
  it('bookNext da posição inicial vem ordenado pelo número de linhas', () => {
    const next = bookNext([], new Chess().fen());
    expect(next.slice(0, 2).map((m) => m.san)).toEqual(['e4', 'd4']);
    expect(next[0]).toMatchObject({ san: 'e4', from: 'e2', to: 'e4', name: 'Jogo do Peão do Rei' });
    for (let i = 1; i < next.length; i++) expect((next[i - 1] as { n: number }).n).toBeGreaterThanOrEqual((next[i] as { n: number }).n);
  });
  it('bookNext depois de 1.e4 traz as respostas de livro com o nome da posição', () => {
    const next = bookNext(['e4'], fenAfter(['e4']));
    expect(next.map((m) => m.san).slice(0, 3)).toEqual(['e5', 'c5', 'e6']);
    expect(next.find((m) => m.san === 'c5')?.name).toBe('Defesa Siciliana');
  });
  it('bookNext fora do livro é vazio; a árvore é montada uma vez', () => {
    expect(bookNext(['a3', 'h6', 'h3', 'a6'], fenAfter(['a3', 'h6', 'h3', 'a6']))).toEqual([]);
    expect(bookTree()).toBe(bookTree());
  });
  it('linesNext conta só as linhas da prática que seguem a sequência', () => {
    const lines = [
      ['e4', 'e5', 'Nf3'],
      ['e4', 'e5', 'Bc4'],
      ['e4', 'c5', 'Nf3'],
      ['d4', 'd5'],
    ];
    const next = linesNext(lines, ['e4'], fenAfter(['e4']));
    expect(next.map((m) => [m.san, m.n])).toEqual([
      ['e5', 2],
      ['c5', 1],
    ]);
  });
  it('sanStep devolve o lance e a posição, ou null se ilegal', () => {
    expect(sanStep(new Chess().fen(), 'Nf3')).toMatchObject({ san: 'Nf3', from: 'g1', to: 'f3' });
    expect(sanStep(new Chess().fen(), 'Ke2')).toBeNull();
  });
});

describe('utilidades das linhas', () => {
  it('pgnOf numera os lances', () => {
    expect(pgnOf(['e4', 'e5', 'Nf3'])).toBe('1. e4 e5 2. Nf3');
  });
  it('validLine aceita números e notação solta e para no primeiro lance ilegal', () => {
    expect(validLine(['1.e4', 'e5', '2.Nf3', 'Ke7', 'Kz9', 'd4'])).toEqual(['e4', 'e5', 'Nf3', 'Ke7']);
    expect(validLine(null)).toEqual([]);
  });
  it('pickVariety devolve nomes diferentes', () => {
    const list = pickVariety(findLines('siciliana'), 5);
    expect(list.length).toBe(5);
    expect(new Set(list.map((l) => l.name)).size).toBe(5);
  });
  it('openingNameOfLines devolve a família comum', () => {
    expect(openingNameOfLines(findLines('gambito evans'))).toBe('Abertura Italiana');
    expect(openingNameOfLines([...findLines('gambito evans'), ...findLines('najdorf')])).toBeNull();
  });
});
