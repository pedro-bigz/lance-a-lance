// Dados de teste das telas: partidas (GameRecord), usuários e estatísticas no formato da API.
import type { GameStoreApi, ListResult } from '../../src/store/game-store';
import type { GameRecord } from '../../src/store/types';
import type { ApiUser, PlayerStats } from '../../src/types/api';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export function game(id: string, over: Partial<GameRecord> = {}): GameRecord {
  return {
    id,
    createdAt: Date.UTC(2026, 9, 1, 12),
    updatedAt: Date.UTC(2026, 9, 1, 12),
    mode: 'play',
    gameMode: 'normal',
    bot: 'novato',
    player: 'w',
    orient: 'w',
    start: START,
    moves: null,
    plyCount: 10,
    headers: {},
    ended: false,
    resigned: false,
    status: 'concluida',
    result: 'vitoria',
    resultText: 'Você venceu por xeque-mate',
    rated: true,
    ratingDelta: 10,
    ...over,
  };
}
/** GameStore falso: list filtra por status e pagina; remove tira da lista */
export function fakeStore(games: GameRecord[], opts: { fail?: boolean } = {}) {
  let all = [...games];
  const calls: { status?: string | null; limit?: number; offset?: number }[] = [];
  const store: GameStoreApi & { calls: typeof calls; removed: string[] } = {
    kind: 'api',
    calls,
    removed: [],
    save() {},
    flush: async () => true,
    async list(o = {}) {
      calls.push(o);
      if (opts.fail) return { games: [], total: 0, error: 'erro' } as ListResult;
      const f = all.filter((g) => !o.status || g.status === o.status);
      const off = o.offset || 0,
        lim = o.limit || 20;
      return { games: f.slice(off, off + lim), total: f.length };
    },
    async get(id) {
      const g = all.find((x) => x.id === id);
      return g ? { ...g, moves: ['e2e4', 'e7e5'] } : null;
    },
    async remove(id) {
      store.removed.push(id);
      all = all.filter((g) => g.id !== id);
      return true;
    },
    count: async () => all.length,
    onSaved() {},
  };
  return store;
}
export function user(id: string, over: Partial<ApiUser> = {}): ApiUser {
  return {
    id,
    first_name: 'Ana',
    last_name: 'Souza',
    email: `${id}@lance.local`,
    role: 'jogador',
    role_name: 'Jogador',
    active: true,
    forbidden: false,
    created_at: '2026-10-01T12:00:00Z',
    ...over,
  };
}
export function stats(over: Partial<PlayerStats> = {}): PlayerStats {
  return {
    user_id: 'u1',
    rating: 410,
    games_played: 6,
    wins: 4,
    losses: 2,
    draws: 0,
    games_classified: 6,
    total_moves: 146,
    avg_moves: 24.3,
    moves: { book_moves: { total: 15, avg: 2.5 }, best_moves: { total: 38, avg: 6.3 } },
    ...over,
  };
}
