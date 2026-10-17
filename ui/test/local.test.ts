import { beforeEach, describe, expect, it } from 'vitest';
import { GAMES, arrayOf, isGameRecord, isStr, lsGet, readGames } from '../src/store/local';

const mem = new Map<string, string>();
beforeEach(() => {
  mem.clear();
  globalThis.localStorage = {
    getItem: (k: string) => (mem.has(k) ? (mem.get(k) as string) : null),
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: () => null,
    length: 0,
  } as Storage;
});

const ok = { id: 'g1', updatedAt: 1, createdAt: 1, status: 'concluida', mode: 'play', moves: ['e2e4'], start: 'x' };

describe('checagem do localStorage', () => {
  it('isGameRecord confere os campos usados pela página', () => {
    expect(isGameRecord(ok)).toBe(true);
    expect(isGameRecord({ ...ok, moves: null })).toBe(true);
    expect(isGameRecord({ ...ok, id: 3 })).toBe(false);
    expect(isGameRecord({ ...ok, status: 'outra' })).toBe(false);
    expect(isGameRecord({ ...ok, moves: [1, 2] })).toBe(false);
    expect(isGameRecord([ok])).toBe(false);
  });
  it('readGames descarta só os itens fora do formato', () => {
    mem.set(GAMES, JSON.stringify([ok, { id: 'ruim' }, null, { ...ok, id: 'g2' }]));
    expect(readGames().map((g) => g.id)).toEqual(['g1', 'g2']);
    mem.set(GAMES, '{"não":"é lista"}');
    expect(readGames()).toEqual([]);
    mem.set(GAMES, 'json quebrado');
    expect(readGames()).toEqual([]);
  });
  it('lsGet com checagem volta ao padrão quando o valor não tem a forma pedida', () => {
    mem.set('k', JSON.stringify(['a', 'b']));
    expect(lsGet('k', [], arrayOf(isStr))).toEqual(['a', 'b']);
    mem.set('k', JSON.stringify(['a', 2]));
    expect(lsGet<string[]>('k', [], arrayOf(isStr))).toEqual([]);
    mem.set('k', JSON.stringify({ x: 1 }));
    expect(lsGet('k', 'padrão', isStr)).toBe('padrão');
    expect(lsGet('falta', 'padrão', isStr)).toBe('padrão');
  });
});
