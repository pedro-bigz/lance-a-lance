/* ---------- Histórico (view historico) ----------
   Mesmos itens e mesma abertura do modal (histItemHtml, openGameById). A situação (em andamento/concluída) é
   filtrada na API; o resultado, nas partidas já carregadas (a API não filtra por resultado), buscando mais páginas
   enquanto faltar partida para completar a tela. */
import { S } from '../core/state';
import { RESULT_UI, histItemHtml, openGameById, recTitle, renderHistCount } from '../game/history';
import { GameStore } from '../store/game-store';
import type { GameRecord } from '../store/types';
import { $, target } from '../ui/dom';
import { fmtDate } from '../ui/format';
import { busy, formMsg } from '../ui/forms';
import { viewToast } from '../ui/toast';
import { newGameFlow } from './sidebar';

type ResultFilter = 'todos' | 'vitoria' | 'derrota' | 'empate' | 'outras';
const HPAGE = {
  status: 'todas' as 'todas' | 'andamento' | 'concluida',
  result: 'todos' as ResultFilter,
  games: [] as GameRecord[],
  total: 0,
  offset: 0,
  error: null as string | null,
  loading: false,
  token: 0,
  want: 0,
};
const HPAGE_SIZE = 20;
const HP_RESULTS: Record<Exclude<ResultFilter, 'todos'>, string[]> = {
  vitoria: ['vitoria'],
  derrota: ['derrota'],
  empate: ['empate'],
  outras: ['encerrada', 'importada', 'livre'],
};
const hpFiltered = () =>
  HPAGE.games.filter(
    (g) =>
      HPAGE.result === 'todos' ||
      (g.status === 'concluida' && HP_RESULTS[HPAGE.result as Exclude<ResultFilter, 'todos'>].includes(g.result || 'livre')),
  );
const hpHasMore = () => HPAGE.offset < HPAGE.total;
export async function loadHistPage(reset: boolean): Promise<void> {
  const store = GameStore;
  if (!store) return;
  if (reset) Object.assign(HPAGE, { games: [], total: 0, offset: 0, error: null, want: HPAGE_SIZE });
  else HPAGE.want = hpFiltered().length + HPAGE_SIZE;
  const t = ++HPAGE.token;
  HPAGE.loading = true;
  renderHistPage();
  for (let pages = 0; pages < 6; pages++) {
    const res = await store
      .list({ status: HPAGE.status === 'todas' ? null : HPAGE.status, limit: HPAGE_SIZE, offset: HPAGE.offset })
      .catch(() => ({ games: [] as GameRecord[], total: 0, error: 'erro' }));
    if (t !== HPAGE.token) return;
    if (res.error) {
      HPAGE.error = res.error;
      if (!HPAGE.games.length) {
        HPAGE.games = res.games;
        HPAGE.total = HPAGE.offset = res.games.length;
      } // só o que ainda está na fila deste computador
      break;
    }
    HPAGE.error = null;
    const seen = new Set(HPAGE.games.map((g) => g.id));
    HPAGE.games.push(...res.games.filter((g) => !seen.has(g.id)));
    HPAGE.offset += HPAGE_SIZE + (HPAGE.offset ? 0 : res.games.filter((g) => g.pending && !g.serverId).length);
    HPAGE.total = res.total;
    if (hpFiltered().length >= HPAGE.want || !hpHasMore()) break;
  }
  HPAGE.loading = false;
  renderHistPage();
}
function renderHistPage(): void {
  for (const b of $('#hpStatus').children) b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.f === HPAGE.status));
  for (const b of $('#hpResult').children) b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.r === HPAGE.result));
  const list = hpFiltered(),
    el = $('#hpList'),
    H = HPAGE;
  $('#hpMoreWrap').hidden = !list.length || !hpHasMore() || !!H.error;
  const more = $<HTMLButtonElement>('#hpMore');
  more.disabled = H.loading;
  more.textContent = H.loading && list.length ? 'Carregando…' : 'Carregar mais';
  formMsg(
    $('#hpMsg'),
    H.error && H.games.length ? 'Não foi possível conectar ao servidor: aparecem só as partidas que ainda estão na fila deste computador.' : '',
  );
  if (!list.length) {
    $('#hpCount').textContent = '';
    if (H.loading) {
      el.innerHTML = '<li class="hist-empty">Carregando…</li>';
      return;
    }
    if (H.error && !H.games.length) {
      el.innerHTML = `<li class="state-box err"><span class="ico" aria-hidden="true">&#9888;</span><b>Não foi possível carregar as partidas</b><span>Confira sua conexão e tente de novo.</span><div class="row"><button class="btn primary" data-hp-retry>Tentar de novo</button></div></li>`;
      return;
    }
    const filtered = H.status !== 'todas' || H.result !== 'todos';
    el.innerHTML = filtered
      ? `<li class="state-box"><span class="ico" aria-hidden="true">&#9817;</span><b>Nenhuma partida neste filtro</b><span>${hpHasMore() ? 'Pode haver mais partidas antigas.' : 'Troque o filtro para ver as outras.'}</span><div class="row">${hpHasMore() ? '<button class="btn" data-hp-more>Procurar nas mais antigas</button>' : ''}<button class="btn" data-hp-clear>Limpar filtros</button></div></li>`
      : `<li class="state-box"><span class="ico" aria-hidden="true">&#9822;</span><b>Nenhuma partida ainda</b><span>Toda partida que você jogar aparece aqui sozinha.</span><div class="row"><button class="btn primary" data-home-new>Nova partida</button></div></li>`;
    return;
  }
  const loaded = H.games.length;
  $('#hpCount').textContent =
    H.result === 'todos'
      ? `${list.length} de ${H.total} partida${H.total === 1 ? '' : 's'}`
      : `${list.length} encontrada${list.length === 1 ? '' : 's'} em ${loaded} de ${H.total} partida${H.total === 1 ? '' : 's'}`;
  el.innerHTML = list.map((r) => histItemHtml(r)).join('');
}
// excluir: confirmação num diálogo da página (confirm() não funciona no artifact e trava a janela no desktop)
let gameDeleting: GameRecord | null = null,
  gameConfirmFocus: HTMLElement | null = null;
function openGameConfirm(r: GameRecord, fromBtn: HTMLElement | null): void {
  gameDeleting = r;
  gameConfirmFocus = fromBtn || (document.activeElement as HTMLElement | null);
  const when = fmtDate(r.updatedAt),
    state = r.status === 'andamento' ? 'em andamento' : (RESULT_UI[r.result || 'livre'] || RESULT_UI.livre)[0].toLowerCase();
  $('#gameConfirmTxt').textContent =
    `Excluir a partida ${recTitle(r)} (${state}, ${when})? Ela some do histórico e não pode ser recuperada. A pontuação que ela já deu ou tirou continua valendo.`;
  formMsg($('#gameConfirmMsg'), '');
  $('#gameConfirmModal').hidden = false;
  $('#gameConfirmNo').focus();
}
function closeGameConfirm(): void {
  if ($('#gameConfirmModal').hidden) return;
  $('#gameConfirmModal').hidden = true;
  gameDeleting = null;
  if (gameConfirmFocus && gameConfirmFocus.isConnected) gameConfirmFocus.focus();
}
export function initHistoryPage(): void {
  $('#hpStatus').onclick = (e) => {
    const b = target(e).closest<HTMLElement>('button[data-f]');
    if (!b || b.dataset.f === HPAGE.status) return;
    HPAGE.status = b.dataset.f as typeof HPAGE.status;
    loadHistPage(true);
  };
  $('#hpResult').onclick = (e) => {
    const b = target(e).closest<HTMLElement>('button[data-r]');
    if (!b || b.dataset.r === HPAGE.result) return;
    HPAGE.result = b.dataset.r as ResultFilter;
    if (HPAGE.result !== 'todos' && HPAGE.status === 'andamento') HPAGE.status = 'todas'; // em andamento não tem resultado
    loadHistPage(true);
  };
  $('#hpReload').onclick = () => loadHistPage(true);
  $('#hpMore').onclick = () => loadHistPage(false);
  $('#hpList').onclick = (e) => {
    const t = target(e);
    if (t.closest('[data-hp-retry]')) {
      loadHistPage(true);
      return;
    }
    if (t.closest('[data-hp-more]')) {
      loadHistPage(false);
      return;
    }
    if (t.closest('[data-hp-clear]')) {
      HPAGE.status = 'todas';
      HPAGE.result = 'todos';
      loadHistPage(true);
      return;
    }
    if (t.closest('[data-home-new]')) {
      newGameFlow();
      return;
    }
    const del = t.closest<HTMLElement>('[data-del]');
    if (del) {
      const r = HPAGE.games.find((g) => g.id === del.dataset.del);
      if (r) openGameConfirm(r, del);
      return;
    }
    const open = t.closest<HTMLElement>('[data-open]');
    if (open) openGameById(open.dataset.open as string);
  };
  $('#gameConfirmNo').onclick = closeGameConfirm;
  $('#gameConfirmModal').addEventListener('pointerdown', (e) => {
    if (target(e).id === 'gameConfirmModal') closeGameConfirm();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#gameConfirmModal').hidden) {
      e.preventDefault();
      closeGameConfirm();
    }
  });
  $('#gameConfirmYes').onclick = async () => {
    const r = gameDeleting,
      btn = $<HTMLButtonElement>('#gameConfirmYes');
    if (!r) return;
    busy(btn, true, 'Excluindo…');
    const ok = await GameStore!.remove(r.id).catch(() => false);
    busy(btn, false);
    if (!ok) {
      formMsg($('#gameConfirmMsg'), 'Não foi possível excluir a partida agora. Confira sua conexão e tente de novo.');
      return;
    }
    if (S.gameId === r.id) S.gameId = null;
    HPAGE.games = HPAGE.games.filter((g) => g.id !== r.id);
    HPAGE.total = Math.max(0, HPAGE.total - 1);
    HPAGE.offset = Math.max(0, HPAGE.offset - 1);
    gameConfirmFocus = $('#hpReload');
    closeGameConfirm();
    renderHistPage();
    renderHistCount();
    viewToast(`Partida ${recTitle(r)} excluída.`);
  };
}
