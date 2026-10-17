/* ---------- Histórico de partidas ----------
   Itens da lista (modal do Tabuleiro, página Histórico e Início), abrir uma partida salva e o modal de histórico. */
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
import { currentView, goView } from '../desktop/views';
import { $, target } from '../ui/dom';
import { esc } from '../ui/escape';
import { fmtDate, fmtDelta } from '../ui/format';
import { viewToast } from '../ui/toast';
import { GLYPH } from '../board/pieces';
import { setDrawer } from './menus';
import { renderAll } from './panel';
import { ratingInfo } from './rating';

export const RESULT_UI: Record<'andamento' | LocalResult, [string, string]> = {
  andamento: ['Em andamento', 'andamento'],
  vitoria: ['Vitória', 'vitoria'],
  derrota: ['Derrota', 'derrota'],
  empate: ['Empate', 'empate'],
  encerrada: ['Encerrada', 'neutra'],
  importada: ['Importada', 'neutra'],
  livre: ['Concluída', 'neutra'],
};
let histFilter = 'todas';
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
  $('#histCount').textContent = n == null ? '' : n ? `${n} salva${n > 1 ? 's' : ''}` : 'nenhuma';
}
let histToken = 0;
export async function renderHistory(): Promise<void> {
  const store = GameStore!;
  for (const x of $('#histFilter').children) x.setAttribute('aria-pressed', String((x as HTMLElement).dataset.f === histFilter));
  const el = $('#histList'),
    t = ++histToken;
  if (!el.children.length) el.innerHTML = '<li class="hist-empty">Carregando…</li>';
  const res = await store.list({ limit: store.kind === 'api' ? 100 : 200 }).catch(() => ({ games: [] as GameRecord[], total: 0, error: 'erro' }));
  if (t !== histToken) return;
  const all = res.games;
  const list = all.filter((g) => histFilter === 'todas' || g.status === histFilter);
  if (!list.length) {
    const empty =
      store.kind === 'api'
        ? 'Nenhuma partida salva ainda. Toda partida que você jogar aparece aqui sozinha.'
        : 'Nenhuma partida salva ainda. Toda partida que você jogar aparece aqui sozinha; para testar, carregue os exemplos abaixo.';
    el.innerHTML = `<li class="hist-empty">${res.error && !all.length ? 'Não foi possível carregar as partidas. Confira sua conexão e abra o histórico de novo.' : all.length ? 'Nenhuma partida neste filtro.' : empty}</li>`;
    return;
  }
  el.innerHTML = list.map((r) => histItemHtml(r)).join('');
}
// um item da lista de partidas (modal de histórico, página Histórico e Início); del:false tira o botão Excluir
export function histItemHtml(r: GameRecord, { del = true }: { del?: boolean } = {}): string {
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
  const ri = r.ratingDelta != null ? { delta: r.ratingDelta } : ratingInfo(r.id);
  const rtxt = ri
    ? ` · <span class="${ri.delta >= 0 ? 'delta-up' : 'delta-down'}">Rating ${fmtDelta(ri.delta)}</span>`
    : r.rated && r.status === 'andamento'
      ? ' · vale rating'
      : '';
  const detail =
    (r.status === 'concluida' && r.resultText) || rtxt ? `<small>${esc(r.status === 'concluida' ? r.resultText || '' : '')}${rtxt}</small>` : '';
  return `<li class="hist-item st-${st}${r.status === 'andamento' ? ' andamento' : ''}${r.id === S.gameId ? ' current' : ''}">
    <button class="hist-open" data-open="${esc(r.id)}">
      <span class="hist-ico ${r.mode === 'review' ? 'w' : r.player === 'b' ? 'b' : 'w'}" aria-hidden="true">${GLYPH.k}</span>
      <span class="hist-main"><b>${esc(recTitle(r))}${r.mock ? '<span class="mock-tag">exemplo</span>' : ''}</b><small>${esc(meta)}</small>${detail}</span>
      <span class="hist-side"><span class="chip">${label}</span><span class="hist-act">${r.status === 'andamento' ? 'Continuar ▸' : 'Rever ▸'}</span></span>
    </button>
    ${del ? `<button class="hist-del" data-del="${esc(r.id)}" aria-label="Excluir ${esc(recTitle(r))}">Excluir</button>` : ''}
  </li>`;
}
let histReturnFocus: Element | null = null;
export function openHistory(): void {
  histReturnFocus = document.activeElement;
  setDrawer(null);
  closeStyle(false);
  $('#historyModal').hidden = false;
  renderHistory();
  $('#historyModal .modal-card').focus();
}
export function closeHistory(): void {
  if ($('#historyModal').hidden) return;
  $('#historyModal').hidden = true;
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
  renderAll();
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
export function initHistoryModal(): void {
  $('#openHistory').onclick = openHistory;
  $('#histClose').onclick = closeHistory;
  $('#historyModal').addEventListener('pointerdown', (e) => {
    if (target(e).id === 'historyModal') closeHistory();
  });
  $('#histFilter').onclick = (e) => {
    const b = target(e).closest<HTMLElement>('button[data-f]');
    if (b) {
      histFilter = b.dataset.f as string;
      renderHistory();
    }
  };
  $('#histList').onclick = async (e) => {
    const del = target(e).closest<HTMLButtonElement>('[data-del]');
    if (del) {
      if (!del.classList.contains('armed')) {
        for (const x of $('#histList').querySelectorAll('.hist-del.armed')) {
          x.classList.remove('armed');
          x.textContent = 'Excluir';
        }
        del.classList.add('armed');
        del.textContent = 'Confirmar';
        return;
      }
      const id = del.dataset.del as string;
      del.disabled = true;
      const ok = await GameStore!.remove(id);
      if (!ok) {
        del.disabled = false;
        del.textContent = 'Tente de novo';
        return;
      }
      if (S.gameId === id) S.gameId = null;
      renderHistory();
      renderHistCount();
      return;
    }
    const open = target(e).closest<HTMLElement>('[data-open]');
    if (open) openGameById(open.dataset.open as string);
  };
}
