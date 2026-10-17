/* ---------- Partidas salvas: GameStore ----------
   Toda partida é salva sozinha, a cada lance e a cada mudança de estado (saveGame em afterChange): não há botão
   nem opção de salvar. No artifact as partidas ficam no localStorage deste navegador; no app desktop vão para a
   API (MySQL), na conta de quem está logado. As duas formas têm a mesma interface:
     GameStore.kind                            'local' | 'api'
     GameStore.save(rec)                       agenda a gravação (com debounce); nunca trava o jogo. rec.clsOnly = só
                                               as classificações de uma partida já concluída ({id, clsOnly, moves, cls})
     GameStore.flush()                         → Promise: grava já o que estiver pendente
     GameStore.list({status, limit, offset})   → Promise<{games: rec[], total, error?}>; status 'andamento' | 'concluida' | null.
                                               No desktop os itens vêm resumidos (moves = null, plyCount = nº de meios-lances)
     GameStore.get(id)                         → Promise<rec | null>, completa (com moves) para abrir no tabuleiro
     GameStore.remove(id)                      → Promise<boolean>
     GameStore.count()                         → Promise<number>
     GameStore.onSaved(fn)                     fn(rec, resposta, criada) a cada gravação aceita; no desktop a resposta da
                                               API traz {game, rating_change: {before, after, delta} | null, rating}
   rec: veja GameRecord em store/types.ts.
   No desktop, se a API cair, a fila fica no localStorage (por usuário) e é reenviada com espera crescente (2 s a 1 min),
   inclusive ao reabrir o app. */
import type { GameSaveData, IpcResult, LanceDesktop } from '../types/api';
import { LEGACY_SID, UUID_RE, apiBody, apiMoves, fromApi } from './convert';
import { lsGet, lsSet, readGames, writeGames } from './local';
import type { GameRecord, SaveRecord } from './types';
import type { GameStatus } from '../core/result';

export type SaveResponse = (({ ok: true } & GameSaveData) | { ok: true; skip: true; game?: undefined }) | null;
export type SavedListener = (rec: SaveRecord, resp: SaveResponse, created: boolean) => void;
export interface ListResult {
  games: GameRecord[];
  total: number;
  error?: string;
}
export interface GameStoreApi {
  kind: 'local' | 'api';
  save(rec: SaveRecord): void;
  flush(): Promise<boolean>;
  list(opts?: { status?: GameStatus | null; limit?: number; offset?: number }): Promise<ListResult>;
  get(id: string): Promise<GameRecord | null>;
  remove(id: string): Promise<boolean>;
  count(): Promise<number | null>;
  onSaved(fn: SavedListener): void;
}

/** criado em bootApp (no desktop depende do usuário logado) */
export let GameStore: GameStoreApi | null = null;
export function setGameStore(store: GameStoreApi): void {
  GameStore = store;
}

export function localGameStore(): GameStoreApi {
  const queue = new Map<string, GameRecord>(),
    listeners: SavedListener[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  function write(): boolean {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!queue.size) return true;
    let list = readGames(),
      ok = true;
    const items = [...queue.values()];
    queue.clear();
    for (const q of items) {
      const prev = list.find((g) => g.id === q.id);
      const rec: GameRecord = {
        id: q.id,
        createdAt: prev ? prev.createdAt : q.createdAt || q.updatedAt,
        updatedAt: q.updatedAt,
        mock: prev ? !!prev.mock : false,
        mode: q.mode,
        gameMode: q.gameMode,
        bot: q.bot,
        player: q.player,
        orient: q.orient,
        start: q.start,
        moves: q.moves,
        headers: q.headers,
        ended: q.ended,
        resigned: q.resigned,
        status: q.status,
        result: q.result,
        resultText: q.resultText,
        rated: q.mode === 'play' ? !!q.rated : prev ? !!prev.rated : false,
      };
      list = [rec, ...list.filter((g) => g.id !== rec.id)];
      ok = writeGames(list) && ok;
      for (const fn of listeners) fn(rec, null, !prev);
    }
    return ok;
  }
  window.addEventListener('pagehide', write);
  const all = () => {
    write();
    return readGames();
  };
  return {
    kind: 'local',
    save(rec) {
      if (rec.clsOnly) return;
      queue.set(rec.id, rec);
      if (timer) clearTimeout(timer);
      timer = setTimeout(write, 250);
    },
    flush: () => Promise.resolve(write()),
    async list({ status = null, limit = 200, offset = 0 } = {}) {
      const l = all().filter((g) => !status || g.status === status);
      return { games: l.slice(offset, offset + limit), total: l.length };
    },
    async get(id) {
      return all().find((g) => g.id === id) || null;
    },
    async remove(id) {
      return writeGames(all().filter((g) => g.id !== id));
    },
    async count() {
      return all().length;
    },
    onSaved(fn) {
      listeners.push(fn);
    },
  };
}

type GamesBridge = NonNullable<LanceDesktop['games']>;
export function apiGameStore(api: GamesBridge, uid: string): GameStoreApi {
  const QKEY = `lance-a-lance:fila:u${uid}`; // uid = uuid do usuário
  // id → última versão pendente (gravação de partida identificada pelo id numérico antigo é descartada)
  const queue = new Map<string, SaveRecord>(
    (lsGet<SaveRecord[]>(QKEY, []) || []).filter((e) => e && typeof e.id === 'string' && !LEGACY_SID.test(e.id)).map((e) => [e.id, e]),
  );
  const serverIds = new Map<string, string>(),
    concluded = new Set<string>(),
    listeners: SavedListener[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null,
    running: Promise<boolean> | null = null,
    retry = 0;
  const persist = () => lsSet(QKEY, [...queue.values()].slice(-30));
  const sid = (id: string) => serverIds.get(id) || (id[0] === 's' && UUID_RE.test(id.slice(1)) ? id.slice(1) : null);
  const schedule = (ms: number) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, ms);
  };
  const remember = (r: GameRecord) => {
    serverIds.set(r.id, String(r.serverId));
    if (r.status === 'concluida') concluded.add(r.id);
  };
  function send(rec: SaveRecord): Promise<IpcResult<GameSaveData> | { ok: true; skip: true; game?: undefined }> {
    const id = sid(rec.id);
    if (rec.clsOnly) return id ? api.update(id, { moves: apiMoves(rec) }) : Promise.resolve({ ok: true, skip: true });
    // sem id da API ainda: POST com client_ref (se o POST anterior chegou e a resposta se perdeu, a API atualiza a mesma partida)
    return id ? api.update(id, apiBody(rec, concluded.has(rec.id) ? 'done' : 'update')) : api.create(apiBody(rec, 'create'));
  }
  function flush(): Promise<boolean> {
    if (running) return running;
    if (timer) clearTimeout(timer);
    timer = null;
    running = (async () => {
      for (const [id, rec] of [...queue]) {
        const created = !rec.clsOnly && !sid(id);
        let r: Awaited<ReturnType<typeof send>> | null = null;
        try {
          r = await send(rec);
        } catch (_) {}
        if (!r || (!r.ok && (r.status === 0 || r.status === 401 || r.status === 429 || r.status >= 500))) {
          // API fora do ar (ou sessão encerrada): guarda e tenta de novo mais tarde, com espera crescente
          if (!r || r.status !== 401) {
            retry = Math.min(60000, retry ? retry * 2 : 2000);
            schedule(retry);
          }
          return false;
        }
        retry = 0;
        if (queue.get(id) === rec) queue.delete(id);
        if (r.ok && r.game) {
          serverIds.set(id, String(r.game.id));
          if (r.game.status === 'concluida') concluded.add(id);
          for (const fn of listeners) fn(rec, r, created);
        } else if (!r.ok) console.warn('Lance a Lance: a API recusou a gravação da partida', id, r.status, r.error);
      }
      return true;
    })().finally(() => {
      running = null;
      persist();
      if (queue.size && !retry && !timer) schedule(1200);
    });
    return running;
  }
  if (queue.size) schedule(1500); // fila que sobrou de outra abertura do app
  const matches = (r: GameRecord, status: GameStatus | null) => !status || r.status === status;
  const store: GameStoreApi = {
    kind: 'api',
    save(rec) {
      const prev = queue.get(rec.id);
      if (rec.clsOnly && prev && !prev.clsOnly)
        prev.cls = rec.cls; // não troca uma gravação completa pendente por uma parcial
      else queue.set(rec.id, rec);
      persist();
      if (!retry) schedule(1200);
    },
    flush,
    async list({ status = null, limit = 100, offset = 0 } = {}) {
      const r = await api.list({ status: status === 'andamento' ? 'em_andamento' : status || undefined, limit, offset }).catch(() => null);
      const pend = [...queue.values()]
        .filter((p): p is GameRecord & { clsOnly?: undefined } => !p.clsOnly && matches(p, status))
        .map((p) => ({ ...p, pending: true }));
      if (!r || !r.ok) return { games: pend, total: pend.length, error: (r && r.error) || 'servidor indisponível' };
      const games = r.games.map(fromApi);
      games.forEach(remember);
      let added = 0;
      // o que ainda está na fila aparece com os dados mais novos (ou no topo, se a API ainda não conhece)
      for (const p of pend) {
        const i = games.findIndex((g) => g.id === p.id);
        if (i >= 0) games[i] = { ...p, serverId: games[i]!.serverId, ratingDelta: games[i]!.ratingDelta };
        else if (!offset) {
          games.unshift(p);
          added++;
        }
      }
      return { games, total: r.total + added };
    },
    async get(id) {
      const p = queue.get(id);
      if (p && !p.clsOnly) return { ...p };
      const s = sid(id);
      if (!s) return null;
      const r = await api.get(s).catch(() => null);
      if (!r || !r.ok) return null;
      const rec = fromApi(r.game);
      remember(rec);
      return rec;
    },
    async remove(id) {
      queue.delete(id);
      persist();
      const s = sid(id);
      if (!s) return true;
      const r = await api.remove(s).catch(() => null);
      return !!(r && r.ok);
    },
    async count() {
      const r = await store.list({ limit: 1 });
      return r.error ? null : r.total;
    },
    onSaved(fn) {
      listeners.push(fn);
    },
  };
  return store;
}
