/* ---------- Persistência da partida aberta e gravação no histórico ----------
   save/restore: a partida aberta no tabuleiro fica no localStorage para retomar ao reabrir (no desktop a chave é por
   usuário, veja bootApp). saveGame: grava a partida no GameStore (histórico) a cada mudança. */
import { Chess } from 'chess.js';
import { DEPTH, uciObj, type BotId, type DepthKey } from '../core/constants';
import { applyMove, checkOver, resetBoard } from '../core/game';
import { resultOf, type Outcome } from '../core/result';
import { S, botColor, findBot, sideName } from '../core/state';
import { openingAt } from '../book/index';
import { requestAnalysis } from '../engine/analysis';
import { ACCOUNT } from '../desktop/account';
import { refreshIfCurrent, viewDataChanged } from '../desktop/views';
import { renderHistCount, renderHistory, openRecord } from '../game/history';
import { RATING, RATING_UI, animateRating, applyRatingIfDone, rememberServerRating, renderRating, setRatingPending } from '../game/rating';
import { UI } from '../game/ui-state';
import { studySnapshot, type StudySnapshot } from '../study/practice';
import { boardCtx } from './contexts';
import { LEGACY_SID, UUID_RE } from './convert';
import { GameStore, type SaveResponse } from './game-store';
import type { RatingChange } from '../types/api';
import { arrayOf, isStr, lsGet, lsSet, newId } from './local';
import type { BoardMode, GameMode, SaveRecord } from './types';

// partida aberta no tabuleiro, para retomar ao reabrir. No desktop a chave é por usuário (veja bootApp)
export let STORE = 'lance-a-lance:v1';
export function setStoreKey(key: string): void {
  STORE = key;
}
export const studyStoreKey = (): string => STORE + ':estudo'; // STORE já é por usuário no desktop

/** O que fica guardado da partida aberta (lance-a-lance:v1…); o slot do estudo leva também a prática. */
export interface BoardSnapshot {
  view: number | null;
  rated: boolean;
  gameId: string | null;
  createdAt: number | null;
  demo: boolean;
  resigned: boolean;
  fromHistory: boolean;
  recResult: string | null;
  recText: string | null;
  gameMode: GameMode;
  ended: boolean;
  bot: BotId;
  player: 'w' | 'b';
  depth: DepthKey;
  mode: BoardMode;
  headers: Record<string, string>;
  start: string;
  moves: string[];
  orient: 'w' | 'b';
  study?: StudySnapshot | null;
}
export function save(): void {
  try {
    const d = boardSnapshot();
    // o estudo tem slot próprio (com a prática); o do Tabuleiro continua em STORE
    if (boardCtx() === 'estudo') localStorage.setItem(studyStoreKey(), JSON.stringify({ ...d, study: studySnapshot() }));
    else localStorage.setItem(STORE, JSON.stringify(d));
  } catch (_) {}
}
function boardSnapshot(): BoardSnapshot {
  return {
    view: S.view,
    rated: S.rated,
    gameId: S.gameId,
    createdAt: S.createdAt,
    demo: S.demo,
    resigned: S.resigned,
    fromHistory: S.fromHistory,
    recResult: S.recResult,
    recText: S.recText,
    gameMode: S.gameMode,
    ended: S.ended,
    bot: S.bot.id,
    player: S.player,
    depth: S.depth,
    mode: S.mode,
    headers: S.headers,
    start: S.positions[0] as string,
    moves: S.plies.map((p) => p.uci),
    orient: S.orient,
  };
}
export function restore(key = STORE): boolean {
  let d: Partial<BoardSnapshot> | null = null;
  try {
    d = JSON.parse(localStorage.getItem(key) || 'null');
  } catch (_) {}
  if (!d) return false;
  S.bot = S.pickBot = findBot(d.bot) || S.bot;
  S.depth = d.depth && DEPTH[d.depth] ? d.depth : 'normal';
  S.player = d.player === 'b' ? 'b' : 'w';
  S.gameMode = d.gameMode === 'normal' ? 'normal' : 'assistido';
  UI.color = S.player; // "Suas peças" da nova partida volta à cor da partida guardada
  if (!d.start || !Array.isArray(d.moves)) return false;
  try {
    S.mode = d.mode === 'review' ? 'review' : 'play';
    S.headers = d.headers || {};
    resetBoard(d.start);
    requestAnalysis(S.positions[0] as string);
    for (const u of d.moves) if (!applyMove(uciObj(u), { silent: true })) break;
    if (d.ended && S.plies.length) {
      S.ended = true;
      checkOver();
    }
    if (d.resigned && S.mode === 'play') {
      S.resigned = true;
      checkOver();
    }
    S.gameId = d.gameId && !LEGACY_SID.test(d.gameId) ? d.gameId : null;
    S.fromHistory = !!d.fromHistory && S.mode === 'review';
    S.recResult = (d.recResult as typeof S.recResult) || null;
    S.recText = d.recText || null;
    S.rated = !!d.rated && S.mode === 'play';
    S.createdAt = typeof d.createdAt === 'number' ? d.createdAt : null;
    S.demo = !!d.demo && S.mode === 'review';
    S.orient = d.orient === 'b' ? 'b' : 'w';
    if (Number.isInteger(d.view) && (d.view as number) >= 0 && (d.view as number) < S.positions.length - 1) S.view = d.view as number; // lance que estava na tela (revisão)
    return true;
  } catch (_) {
    return false;
  }
}

// Chaves por usuário (partida aberta, estudo, fila de gravação, animações vistas) passaram do id numérico para o
// uuid. O app recebe o id antigo uma vez, no primeiro login da mesma conta depois da troca, e move as chaves.
// Sem esse id (outra conta, outro computador) as chaves antigas ficam onde estão e são ignoradas.
export function migrateLegacyKeys(oldId: string | null, uuid: string): void {
  if (!oldId || !/^\d{1,19}$/.test(String(oldId)) || !UUID_RE.test(uuid)) return;
  const pairs = [
    [`lance-a-lance:v1:u${oldId}`, `lance-a-lance:v1:u${uuid}`],
    [`lance-a-lance:v1:u${oldId}:estudo`, `lance-a-lance:v1:u${uuid}:estudo`],
    [`lance-a-lance:fila:u${oldId}`, `lance-a-lance:fila:u${uuid}`],
    [`lance-a-lance:pontuacao-animada:u${oldId}`, `lance-a-lance:pontuacao-animada:u${uuid}`],
  ] as const;
  try {
    for (const [from, to] of pairs) {
      const v = localStorage.getItem(from);
      if (v == null) continue;
      if (localStorage.getItem(to) == null) localStorage.setItem(to, v);
      localStorage.removeItem(from);
    }
  } catch (_) {}
}

function outcome(): Outcome {
  if (S.mode === 'review') {
    const r = S.headers.Result;
    return { status: 'concluida', result: S.recResult || 'importada', text: S.recText || (r && r !== '*' ? `Resultado ${r}` : 'Partida importada') };
  }
  return resultOf(S.game, { player: S.player, hasBot: !!botColor(), resigned: S.resigned, ended: S.ended, botName: S.bot.name });
}
// resultado no formato da API (1-0, 0-1, 1/2-1/2) e o motivo; encerrar uma partida que vale rating conta como derrota
function apiOutcome(): { result: string | null; reason: string | null } {
  if (S.mode === 'review') {
    const r = S.headers.Result;
    return { result: ['1-0', '0-1', '1/2-1/2'].includes(r as string) ? (r as string) : null, reason: 'importada' };
  }
  const g = S.game,
    lose = S.player === 'w' ? '0-1' : '1-0';
  if (S.resigned) return { result: lose, reason: 'desistencia' };
  if (g.in_checkmate()) return { result: g.turn() === 'w' ? '0-1' : '1-0', reason: 'xeque_mate' };
  if (g.game_over())
    return {
      result: '1/2-1/2',
      reason: g.in_stalemate()
        ? 'afogamento'
        : g.in_threefold_repetition()
          ? 'repeticao'
          : g.insufficient_material()
            ? 'material_insuficiente'
            : 'regra_50_lances',
    };
  if (S.ended) return { result: S.rated && botColor() ? lose : null, reason: 'encerrada' };
  return { result: null, reason: null };
}
function currentPgn(res: string | null): string {
  const c = new Chess(S.positions[0]);
  for (const p of S.plies) c.move(uciObj(p.uci));
  if (S.mode === 'review') {
    for (const [k, v] of Object.entries(S.headers || {})) if (typeof v === 'string' && k !== 'SetUp' && k !== 'FEN') c.header(k, v);
  } else c.header('Event', 'Lance a Lance', 'White', sideName('w'), 'Black', sideName('b'), 'Result', res || '*');
  return c.pgn({ max_width: 80 });
}
export function saveGame(): boolean {
  if (!GameStore || (!S.plies.length && !S.resigned)) return false;
  if ((S.mode === 'review' && S.fromHistory) || S.demo) return false; // revisão do histórico e demonstração do tutor não viram partida nova
  if (!S.gameId) S.gameId = newId();
  if (!S.createdAt) S.createdAt = Date.now();
  const o = outcome(),
    a = apiOutcome();
  GameStore.save({
    id: S.gameId,
    createdAt: S.createdAt,
    updatedAt: Date.now(),
    mode: S.mode,
    gameMode: S.gameMode,
    bot: S.bot.id,
    player: S.player,
    orient: S.orient,
    start: S.positions[0] as string,
    moves: S.plies.map((p) => p.uci),
    sans: S.plies.map((p) => p.san),
    cls: S.cls.map((c) => (c ? c.key : null)),
    headers: S.headers,
    ended: S.ended,
    resigned: S.resigned,
    status: o.status,
    result: o.result,
    resultText: o.text,
    rated: S.mode === 'play' ? S.rated : false,
    apiResult: a.result,
    apiReason: a.reason,
    pgn: GameStore.kind === 'api' ? currentPgn(a.result) : null,
    opening: openingAt(S.positions, S.bookLen || 0),
  });
  return true;
}
// a avaliação do Stockfish termina depois do lance (ou depois do fim da partida): grava as classificações novas
let clsTimer: ReturnType<typeof setTimeout> | 0 = 0;
export function persistCls(): void {
  clearTimeout(clsTimer);
  clsTimer = setTimeout(() => {
    if (!GameStore || !S.gameId || S.demo) return;
    if (S.mode === 'review' && S.fromHistory) {
      if (GameStore.kind === 'api')
        GameStore.save({ id: S.gameId, clsOnly: true, moves: S.plies.map((p) => p.uci), cls: S.cls.map((c) => (c ? c.key : null)) });
    } else saveGame();
  }, 800);
}
// chamado depois de cada jogada e de cada mudança de estado da partida
export function afterChange(): void {
  applyRatingIfDone();
  save();
  if (S.plies.length || S.resigned) saveGame();
}
// resposta de uma gravação: contador do histórico e, no desktop, a pontuação calculada pela API
const ANIM_KEY = () => `lance-a-lance:pontuacao-animada:u${ACCOUNT.user ? ACCOUNT.user.id : 0}`;
export function onGameSaved(rec: SaveRecord, resp: SaveResponse, created: boolean): void {
  if (created) renderHistCount();
  if (UI.history) renderHistory();
  viewDataChanged(created || !!(resp && resp.game && resp.game.status === 'concluida'));
  if (!resp || !resp.game || resp.game.status !== 'concluida') return;
  const ch = resp.rating_change,
    seen = lsGet<string[]>(ANIM_KEY(), [], arrayOf(isStr));
  if (ch && ch.status === 'pending') {
    // a API está calculando a pontuação com o Stockfish: "Calculando…" no topo e pergunta até sair o valor
    if (!seen.includes(rec.id)) followServerRating(rec.id, rec.id === S.gameId && S.game.in_checkmate() ? 1700 : 400);
  } else if (ch && ch.status !== 'failed' && !seen.includes(rec.id)) {
    markSeen(rec.id);
    showServerRating(rec.id, ch, resp.rating, rec.id === S.gameId && S.game.in_checkmate() ? 1700 : 400);
  } else if (resp.rating != null && resp.rating !== RATING.rating && RATING_UI.pending !== rec.id) {
    RATING.rating = RATING_UI.shown = resp.rating;
    renderRating();
  }
  refreshIfCurrent('estatisticas');
}
function markSeen(id: string): void {
  const seen = lsGet<string[]>(ANIM_KEY(), [], arrayOf(isStr));
  if (!seen.includes(id)) lsSet(ANIM_KEY(), [...seen, id].slice(-50));
}
/** pontuação real de uma partida: guarda (fim de jogo, histórico) e anima o topo de before até after */
function showServerRating(id: string, ch: RatingChange, rating: number | null, wait: number): void {
  rememberServerRating(id, { delta: ch.delta, before: ch.before, after: ch.after, accuracy: ch.accuracy ?? null });
  if (rating != null) RATING.rating = rating;
  if (RATING_UI.pending === id) RATING_UI.pending = null;
  // espera a animação de fim de jogo antes de mexer no número do topo
  setTimeout(() => animateRating(ch.before, ch.after), wait);
}
/** intervalo e limite das perguntas pela pontuação (a análise de uma partida típica leva poucos segundos) */
export const RATING_POLL_MS = 1500,
  RATING_POLL_MAX = 80;
const following = new Set<string>();
export function followServerRating(id: string, wait = 400): void {
  if (following.has(id) || !GameStore || !GameStore.rating) return;
  following.add(id);
  setRatingPending(id);
  if (UI.history) renderHistory();
  let tries = 0;
  const done = () => {
    following.delete(id);
    if (RATING_UI.pending === id) setRatingPending(null);
    viewDataChanged(true);
    if (UI.history) renderHistory();
    refreshIfCurrent('estatisticas');
  };
  const ask = async () => {
    const r = GameStore && GameStore.rating ? await GameStore.rating(id).catch(() => null) : null;
    const ch = r && r.rating_change;
    if (ch && ch.status === 'applied') {
      markSeen(id);
      showServerRating(id, ch, r!.rating, tries ? 0 : wait);
      done();
    } else if ((ch && ch.status === 'failed') || ++tries >= RATING_POLL_MAX) {
      // não deu para calcular agora: o topo volta ao número que a API tem (a pontuação sai quando a API conseguir)
      if (ch && ch.status === 'failed') markSeen(id);
      if (r && r.rating != null) RATING.rating = RATING_UI.shown = r.rating;
      done();
    } else setTimeout(ask, RATING_POLL_MS);
  };
  setTimeout(ask, RATING_POLL_MS);
}
// sem partida guardada neste computador: retoma a última partida contra bot em andamento na conta
export async function resumeFromApi(): Promise<void> {
  const store = GameStore!;
  const res = await store.list({ status: 'andamento', limit: 5 }).catch(() => null);
  const g = res && res.games.find((x) => x.mode === 'play' && x.bot !== 'none');
  if (!g || S.plies.length || S.mode !== 'play') return;
  const r = await store.get(g.id);
  if (r && r.moves && !S.plies.length && S.mode === 'play') openRecord(r);
}
