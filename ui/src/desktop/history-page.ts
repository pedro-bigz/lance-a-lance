/* ---------- Histórico (view historico): estado e busca ----------
   Mesmos itens e mesma abertura do modal (histItemView, openGameById). A situação (em andamento/concluída) é
   filtrada na API; o resultado, nas partidas já carregadas (a API não filtra por resultado), buscando mais páginas
   enquanto faltar partida para completar a tela. O estado fica num store pequeno (createHistPager) que o componente
   de history-page-view.tsx lê com useSyncExternalStore. */
import type { GameStoreApi } from '../store/game-store';
import type { GameRecord } from '../store/types';

export type StatusFilter = 'todas' | 'andamento' | 'concluida';
export type ResultFilter = 'todos' | 'vitoria' | 'derrota' | 'empate' | 'outras';
export interface HistPageState {
  status: StatusFilter;
  result: ResultFilter;
  games: GameRecord[];
  total: number;
  offset: number;
  error: string | null;
  loading: boolean;
}
export const HPAGE_SIZE = 20;
const HP_RESULTS: Record<Exclude<ResultFilter, 'todos'>, string[]> = {
  vitoria: ['vitoria'],
  derrota: ['derrota'],
  empate: ['empate'],
  outras: ['encerrada', 'importada', 'livre'],
};
export const hpFiltered = (H: HistPageState): GameRecord[] =>
  H.games.filter(
    (g) => H.result === 'todos' || (g.status === 'concluida' && HP_RESULTS[H.result as Exclude<ResultFilter, 'todos'>].includes(g.result || 'livre')),
  );
export const hpHasMore = (H: HistPageState): boolean => H.offset < H.total;
export function hpCountText(H: HistPageState): string {
  const list = hpFiltered(H);
  if (!list.length) return '';
  return H.result === 'todos'
    ? `${list.length} de ${H.total} partida${H.total === 1 ? '' : 's'}`
    : `${list.length} encontrada${list.length === 1 ? '' : 's'} em ${H.games.length} de ${H.total} partida${H.total === 1 ? '' : 's'}`;
}

export interface HistPager {
  getSnapshot(): HistPageState;
  subscribe(fn: () => void): () => void;
  /** reset: recomeça da primeira página; senão busca mais até completar mais uma página filtrada */
  load(reset: boolean): Promise<void>;
  setStatus(f: StatusFilter): void;
  setResult(r: ResultFilter): void;
  clearFilters(): void;
  /** a partida foi excluída: tira da lista e ajusta os contadores */
  removed(id: string): void;
}
export function createHistPager(getStore: () => GameStoreApi | null): HistPager {
  let st: HistPageState = { status: 'todas', result: 'todos', games: [], total: 0, offset: 0, error: null, loading: false };
  let token = 0,
    want = 0;
  const target = new EventTarget();
  const set = (patch: Partial<HistPageState>) => {
    st = { ...st, ...patch };
    target.dispatchEvent(new Event('change'));
  };
  async function load(reset: boolean): Promise<void> {
    const store = getStore();
    if (!store) return;
    if (reset) {
      st = { ...st, games: [], total: 0, offset: 0, error: null };
      want = HPAGE_SIZE;
    } else want = hpFiltered(st).length + HPAGE_SIZE;
    const t = ++token;
    set({ loading: true });
    for (let pages = 0; pages < 6; pages++) {
      const res = await store
        .list({ status: st.status === 'todas' ? null : st.status, limit: HPAGE_SIZE, offset: st.offset })
        .catch(() => ({ games: [] as GameRecord[], total: 0, error: 'erro' }));
      if (t !== token) return;
      if (res.error) {
        // só o que ainda está na fila deste computador
        if (!st.games.length) st = { ...st, error: res.error, games: res.games, total: res.games.length, offset: res.games.length };
        else st = { ...st, error: res.error };
        break;
      }
      const seen = new Set(st.games.map((g) => g.id));
      st = {
        ...st,
        error: null,
        games: [...st.games, ...res.games.filter((g) => !seen.has(g.id))],
        offset: st.offset + HPAGE_SIZE + (st.offset ? 0 : res.games.filter((g) => g.pending && !g.serverId).length),
        total: res.total,
      };
      if (hpFiltered(st).length >= want || !hpHasMore(st)) break;
    }
    set({ loading: false });
  }
  return {
    getSnapshot: () => st,
    subscribe(fn) {
      target.addEventListener('change', fn);
      return () => target.removeEventListener('change', fn);
    },
    load,
    setStatus(f) {
      if (f === st.status) return;
      st = { ...st, status: f };
      load(true);
    },
    setResult(r) {
      if (r === st.result) return;
      // em andamento não tem resultado
      st = { ...st, result: r, status: r !== 'todos' && st.status === 'andamento' ? 'todas' : st.status };
      load(true);
    },
    clearFilters() {
      st = { ...st, status: 'todas', result: 'todos' };
      load(true);
    },
    removed(id) {
      set({ games: st.games.filter((g) => g.id !== id), total: Math.max(0, st.total - 1), offset: Math.max(0, st.offset - 1) });
    },
  };
}
