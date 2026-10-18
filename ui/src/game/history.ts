/* ---------- Histórico de partidas ----------
   Dados dos itens da lista (modal do Tabuleiro, página Histórico e Início), abrir uma partida salva e o estado do
   modal de histórico do Tabuleiro (desenhado por HistoryModal em game/history-modal.tsx). */
import { DEFAULT_BOT, uciObj, type Bot } from '../core/constants';
import { applyMove, checkOver, resetBoard } from '../core/game';
import { S, botColor, findBot, sideName } from '../core/state';
import type { LocalResult } from '../core/result';
import { closeStyle } from '../board/style-picker';
import { requestAnalysis } from '../engine/analysis';
import { maybeBot } from '../engine/bot';
import { boardCtx } from '../store/contexts';
import { GameStore } from '../store/game-store';
import { save } from '../store/session';
import type { GameRecord } from '../store/types';
import { publish } from '../store/view-store';
import { currentView, goView } from '../desktop/views';
import { fmtDate, fmtDelta } from '../ui/format';
import { viewToast } from '../ui/toast';
import { setDrawer } from './menus';
import { RATING_UI, ratingInfo, rememberServerRating } from './rating';
import { UI } from './ui-state';

export const RESULT_UI: Record<'andamento' | LocalResult, [string, string]> = {
  andamento: ['Em andamento', 'andamento'],
  vitoria: ['Vitória', 'vitoria'],
  derrota: ['Derrota', 'derrota'],
  empate: ['Empate', 'empate'],
  encerrada: ['Encerrada', 'neutra'],
  importada: ['Importada', 'neutra'],
  livre: ['Concluída', 'neutra'],
};
export type HistFilter = 'todas' | 'andamento' | 'concluida';
/** lista do modal de histórico: filtro, partidas carregadas (null = nunca carregou) e erro */
export const HIST: {
  filter: HistFilter;
  /** null = ainda não carregou ("Carregando…" depois da primeira abertura) */
  games: GameRecord[] | null;
  /** a lista já foi pedida alguma vez (antes disso fica vazia) */
  asked: boolean;
  error: boolean;
  del: Record<string, 'armed' | 'busy' | 'retry'>;
} = {
  filter: 'todas',
  games: null,
  asked: false,
  error: false,
  del: {},
};
export function recBot(r: Pick<GameRecord, 'bot'>): Bot {
  return findBot(r.bot) || DEFAULT_BOT;
}
export function recTitle(r: GameRecord): string {
  if (r.mode === 'review') return `${(r.headers && r.headers.White) || 'Brancas'} × ${(r.headers && r.headers.Black) || 'Pretas'}`;
  const b = recBot(r);
  return b.id === 'none' ? 'Tabuleiro livre' : `Você × ${b.name}`;
}
let histCountToken = 0;
export async function renderHistCount(): Promise<void> {
  const store = GameStore;
  if (!store) return;
  const t = ++histCountToken;
  const n = await store.count().catch(() => null);
  if (t !== histCountToken) return;
  UI.histCount = n == null ? '' : n ? `${n} salva${n > 1 ? 's' : ''}` : 'nenhuma';
  publish('board');
}
let histToken = 0;
/** recarrega a lista do modal (o desenho filtra por HIST.filter) */
export async function renderHistory(): Promise<void> {
  const store = GameStore!;
  const t = ++histToken;
  if (!HIST.asked) {
    HIST.asked = true;
    publish('board');
  }
  const res = await store.list({ limit: store.kind === 'api' ? 100 : 200 }).catch(() => ({ games: [] as GameRecord[], total: 0, error: 'erro' }));
  if (t !== histToken) return;
  HIST.games = res.games;
  HIST.error = !!res.error;
  HIST.del = {};
  publish('board');
}
/** texto da lista vazia do modal (null = há itens no filtro) */
export function histEmptyText(list: GameRecord[]): string | null {
  const all = HIST.games || [];
  if (list.length) return null;
  const empty =
    GameStore && GameStore.kind === 'api'
      ? 'Nenhuma partida salva ainda. Toda partida que você jogar aparece aqui sozinha.'
      : 'Nenhuma partida salva ainda. Toda partida que você jogar aparece aqui sozinha; para testar, carregue os exemplos abaixo.';
  return HIST.error && !all.length
    ? 'Não foi possível carregar as partidas. Confira sua conexão e abra o histórico de novo.'
    : all.length
      ? 'Nenhuma partida neste filtro.'
      : empty;
}
export function setHistFilter(f: HistFilter): void {
  HIST.filter = f;
  publish('board');
  renderHistory();
}
/** dados de um item da lista de partidas (modal de histórico, página Histórico e Início); o componente HistItem
    (react/hist-item.tsx) só desenha isto */
export interface HistItemView {
  id: string;
  cls: string;
  label: string;
  ico: 'w' | 'b';
  title: string;
  mock: boolean;
  meta: string;
  /** linha de detalhe: texto do resultado e a variação do rating (ou "vale rating") */
  detail: { text: string; rating: { cls: string; text: string } | null; rated: boolean } | null;
  act: string;
}
export function histItemView(r: GameRecord): HistItemView {
  const key = r.status === 'andamento' ? 'andamento' : r.result || 'livre';
  const [label, st] = RESULT_UI[key] || RESULT_UI.livre;
  const full = Math.ceil((r.plyCount != null ? r.plyCount : (r.moves || []).length) / 2);
  const meta = [
    r.mode === 'review' ? 'PGN' : r.player === 'b' ? 'Pretas' : 'Brancas',
    `${full} lance${full === 1 ? '' : 's'}`,
    r.mode === 'review' ? null : r.gameMode === 'normal' ? 'Modo normal' : 'Modo assistido',
    r.opening || null,
    fmtDate(r.updatedAt),
  ]
    .filter(Boolean)
    .join(' · ');
  const known = ratingInfo(r.id);
  const ri = r.ratingDelta != null ? { delta: r.ratingDelta, accuracy: r.accuracy ?? (known && known.accuracy) } : known;
  const acc = ri && ri.accuracy != null ? ` · Precisão ${Math.round(ri.accuracy)}%` : '';
  const rating = ri
    ? { cls: ri.delta >= 0 ? 'delta-up' : 'delta-down', text: `Rating ${fmtDelta(ri.delta)}${acc}` }
    : r.ratingStatus === 'pending' || (RATING_UI.pending && RATING_UI.pending === r.id)
      ? { cls: '', text: 'Calculando a pontuação…' }
      : null;
  const rated = !ri && !!r.rated && r.status === 'andamento';
  const andamento = r.status === 'andamento';
  return {
    id: r.id,
    cls: `hist-item st-${st}${andamento ? ' andamento' : ''}${r.id === S.gameId ? ' current' : ''}`,
    label,
    ico: r.mode === 'review' ? 'w' : r.player === 'b' ? 'b' : 'w',
    title: recTitle(r),
    mock: !!r.mock,
    meta,
    detail:
      (r.status === 'concluida' && r.resultText) || rating || rated
        ? { text: r.status === 'concluida' ? r.resultText || '' : '', rating, rated }
        : null,
    act: andamento ? 'Continuar ▸' : 'Rever ▸',
  };
}
let histReturnFocus: Element | null = null;
export function openHistory(): void {
  histReturnFocus = document.activeElement;
  setDrawer(null);
  closeStyle(false);
  UI.history = true;
  publish('board');
  renderHistory();
  const card = document.querySelector<HTMLElement>('#historyModal .modal-card');
  if (card) card.focus();
}
export function closeHistory(): void {
  if (!UI.history) return;
  UI.history = false;
  publish('board');
  if (histReturnFocus && (histReturnFocus as HTMLElement).focus) (histReturnFocus as HTMLElement).focus();
}
export function openRecord(r: GameRecord): void {
  const concluded = r.status === 'concluida';
  S.headers = Object.assign({}, r.headers || {});
  S.bot = S.pickBot = recBot(r);
  S.player = r.player === 'b' ? 'b' : 'w';
  S.gameMode = r.gameMode === 'normal' ? 'normal' : 'assistido';
  // refaz os lances como partida jogada, para que fim de jogo e lados saiam certos
  S.mode = r.mode === 'review' ? 'review' : 'play';
  resetBoard(r.start);
  requestAnalysis(S.positions[0] as string);
  for (const u of r.moves || []) if (!applyMove(uciObj(u), { silent: true })) break;
  S.gameId = r.id;
  S.createdAt = r.createdAt || null;
  S.ended = !!r.ended;
  S.resigned = !!r.resigned;
  S.rated = !!r.rated && r.gameMode === 'normal';
  // pontuação que a API já calculou (o fim de jogo da revisão mostra o delta e a precisão)
  if (r.ratingDelta != null) rememberServerRating(r.id, { delta: r.ratingDelta, before: null, after: null, accuracy: r.accuracy ?? null });
  if (concluded) {
    if (S.mode === 'play') {
      const names = { w: sideName('w'), b: sideName('b') };
      S.headers = { White: names.w, Black: names.b };
      const bc = botColor();
      if (bc) S.headers[bc === 'w' ? 'WhiteElo' : 'BlackElo'] = String(S.bot.elo);
    }
    S.mode = 'review';
    S.fromHistory = true;
    S.recResult = r.result;
    S.recText = r.resultText;
    S.ended = S.resigned = false;
    S.over = null;
    checkOver();
  } else {
    S.fromHistory = false;
    S.recResult = S.recText = null;
    checkOver();
  }
  S.orient = r.orient === 'b' ? 'b' : r.orient === 'w' ? 'w' : S.player;
  S.view = null;
  closeHistory();
  save();
  publish();
  if (!concluded) maybeBot();
}
// abre uma partida da lista: em andamento retoma, concluída abre em revisão. No desktop vai para a view do jogo.
export async function openGameById(id: string): Promise<boolean> {
  const r = await GameStore!.get(id).catch(() => null);
  if (!r || !r.moves) {
    viewToast('Não foi possível abrir essa partida agora. Confira sua conexão.');
    return false;
  }
  if (boardCtx() !== 'jogo') goView('jogo'); // grava o estudo e volta à partida do Tabuleiro antes de abrir
  openRecord(r);
  const cv = currentView();
  if (cv && cv !== 'jogo') goView('jogo');
  return true;
}
// Excluir em dois cliques no modal: o primeiro arma (e desarma os outros), o segundo apaga
export async function histDelete(id: string): Promise<void> {
  const st = HIST.del[id];
  if (!st) {
    HIST.del = { [id]: 'armed' };
    publish('board');
    return;
  }
  if (st === 'busy') return;
  HIST.del = { ...HIST.del, [id]: 'busy' };
  publish('board');
  const ok = await GameStore!.remove(id);
  if (!ok) {
    HIST.del = { ...HIST.del, [id]: 'retry' };
    publish('board');
    return;
  }
  if (S.gameId === id) S.gameId = null;
  renderHistory();
  renderHistCount();
}
