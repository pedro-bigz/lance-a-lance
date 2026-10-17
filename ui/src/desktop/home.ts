/* ---------- Início (view inicio) ----------
   Saudação, pontuação e bot recomendado, "Continuar partida" (com miniatura da posição), resumo e últimas partidas. */
import { Chess, type Color } from 'chess.js';
import { START_FEN, uciObj } from '../core/constants';
import { recommendBot } from '../core/rating';
import { S, botColor } from '../core/state';
import { openingAt } from '../book/index';
import { STYLE, pieceSpan } from '../board/pieces';
import { histItemHtml, openGameById, recTitle } from '../game/history';
import { RATING, RATING_UI, renderRating } from '../game/rating';
import { GameStore, type ListResult } from '../store/game-store';
import type { GameRecord } from '../store/types';
import type { PieceType } from 'chess.js';
import type { PlayerStats } from '../types/api';
import { $, target } from '../ui/dom';
import { esc } from '../ui/escape';
import { fmtDate, fmtNum, pct } from '../ui/format';
import { formMsg } from '../ui/forms';
import { ACCOUNT } from './account';
import { DESKTOP_STATS } from './bridge';
import { newGameFlow } from './sidebar';
import { goView } from './views';

const HOME = { token: 0 };
function greeting(d = new Date()): string {
  const h = d.getHours();
  return h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}
// tabuleiro pequeno, só para mostrar a posição (usa o estilo de tabuleiro e peças escolhido)
function miniBoardHtml(fen: string, orient: Color = 'w'): string {
  const rows = (fen.split(' ')[0] as string).split('/').map((r) => r.replace(/\d/g, (n) => '.'.repeat(+n)).split(''));
  let h = '';
  for (let i = 0; i < 8; i++)
    for (let j = 0; j < 8; j++) {
      const r = orient === 'w' ? i : 7 - i,
        c = orient === 'w' ? j : 7 - j,
        ch = (rows[r] as string[])[c] as string;
      h += `<i class="${(r + c) % 2 ? 'd' : 'l'}">${ch === '.' ? '' : pieceSpan(ch.toLowerCase() as PieceType, ch === ch.toUpperCase() ? 'w' : 'b')}</i>`;
    }
  return `<div class="mini-board" data-board="${esc(STYLE.board)}" data-pieces="${esc(STYLE.pieces)}" aria-hidden="true">${h}</div>`;
}
function recFen(r: GameRecord): string {
  const c = new Chess(r.start || START_FEN);
  for (const u of r.moves || []) if (!c.move(uciObj(u))) break;
  return c.fen();
}
const liveGame = () => S.mode === 'play' && !S.over && !S.demo && !!botColor() && S.plies.length > 0;
interface Continue {
  current?: boolean;
  id?: string;
  title: string;
  fen: string | null;
  orient: Color;
  plies: number;
  player: Color;
  gameMode: string;
  rated?: boolean;
  opening?: string | null;
  updatedAt: number | null;
}
export async function renderHome(): Promise<void> {
  const u = ACCOUNT.user,
    store = GameStore;
  if (!u || !store) return;
  const t = ++HOME.token;
  try {
    $('#homeDate').textContent = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  } catch (_) {}
  $('#homeHello').textContent = `${greeting()}, ${u.first_name}`;
  const showRating = () => {
    $('#homeRating').textContent = fmtNum(RATING.rating);
    const rec = recommendBot(RATING.rating);
    $('#homeRec').textContent = `Bot recomendado: ${rec.level} (≈${rec.elo})`;
  };
  showRating();
  if (!$('#homeRecent').children.length) $('#homeRecent').innerHTML = '<li class="hist-empty">Carregando…</li>';
  if (!$('#homeContinue').children.length)
    $('#homeContinue').innerHTML =
      `<div class="home-card-h"><h2>Partida em andamento</h2></div><div class="home-continue-body"><div class="mini-board skel"></div><div><small>Carregando…</small></div></div>`;
  if (!$('#homeSummary').children.length) renderHomeSummary(null);
  const fail: ListResult = { games: [], total: 0, error: 'erro' };
  const [st, recent, ongoing] = await Promise.all([
    DESKTOP_STATS ? DESKTOP_STATS.me().catch(() => null) : null,
    store.list({ limit: 5 }).catch(() => fail),
    liveGame() ? null : store.list({ status: 'andamento', limit: 20 }).catch(() => null),
  ]);
  if (t !== HOME.token) return;
  if (st && st.ok) {
    RATING.rating = RATING_UI.shown = st.stats.rating;
    RATING.games = st.stats.games_played;
    RATING.wins = st.stats.wins;
    RATING.losses = st.stats.losses;
    RATING.draws = st.stats.draws;
    renderRating();
  }
  showRating();
  renderHomeSummary(st && st.ok ? st.stats : null, !!st && !st.ok);
  formMsg(
    $('#homeMsg'),
    recent.error ? 'Não foi possível conectar ao servidor: o resumo pode estar incompleto. Confira sua conexão e volte ao Início.' : '',
  );
  // últimas partidas
  $('#homeRecent').innerHTML = recent.games.length
    ? recent.games
        .slice(0, 5)
        .map((r) => histItemHtml(r, { del: false }))
        .join('')
    : `<li class="hist-empty">${recent.error ? 'Não foi possível carregar as partidas agora.' : 'Nenhuma partida ainda. Comece uma e ela aparece aqui sozinha.'}</li>`;
  // continuar partida: a do tabuleiro, se estiver valendo; senão a última contra bot em andamento na conta
  let cont: Continue | null = null;
  if (liveGame())
    cont = {
      current: true,
      title: `Você × ${S.bot.name}`,
      fen: S.game.fen(),
      orient: S.orient,
      plies: S.plies.length,
      player: S.player,
      gameMode: S.gameMode,
      rated: S.rated,
      opening: openingAt(S.positions, S.bookLen || 0),
      updatedAt: null,
    };
  else {
    const g = ongoing && ongoing.games.find((x) => x.mode === 'play' && x.bot !== 'none');
    const r = g ? await store.get(g.id).catch(() => null) : null;
    if (t !== HOME.token) return;
    if (g)
      cont = {
        id: g.id,
        title: recTitle(g),
        fen: r && r.moves ? recFen(r) : null,
        orient: g.orient || g.player,
        plies: g.plyCount != null ? g.plyCount : ((r && r.moves) || []).length,
        player: g.player,
        gameMode: g.gameMode,
        rated: g.rated,
        opening: g.opening,
        updatedAt: g.updatedAt,
      };
  }
  const box = $('#homeContinue');
  if (!cont) {
    box.classList.add('empty');
    box.innerHTML = `<div class="home-card-h"><h2>Partida em andamento</h2></div>
      <div class="home-continue-body"><div class="state-box"><span class="ico" aria-hidden="true">&#9816;</span><b>Nenhuma partida contra bot em andamento</b><span>Comece uma agora: o nível recomendado já vem marcado.</span><div class="row"><button class="btn primary" data-home-new>Nova partida</button></div></div></div>`;
    return;
  }
  box.classList.remove('empty');
  const full = Math.ceil(cont.plies / 2);
  const meta = [
    cont.player === 'b' ? 'Pretas' : 'Brancas',
    `${full} lance${full === 1 ? '' : 's'}`,
    cont.gameMode === 'normal' ? 'Modo normal' : 'Modo assistido',
    cont.rated ? 'vale pontuação' : null,
  ]
    .filter(Boolean)
    .join(' · ');
  box.innerHTML = `<div class="home-card-h"><h2>Partida em andamento</h2>${cont.current ? '' : `<a href="#/historico">Ver todas</a>`}</div>
    <div class="home-continue-body">
      ${cont.fen ? miniBoardHtml(cont.fen, cont.orient === 'b' ? 'b' : 'w') : '<div class="mini-board skel"></div>'}
      <div><span class="live-tag">${cont.current ? 'No tabuleiro agora' : 'Em andamento'}</span>
        <h3>${esc(cont.title)}</h3><small>${esc(meta)}</small>${cont.opening ? `<small>${esc(cont.opening)}</small>` : ''}${cont.updatedAt ? `<small>Último lance: ${esc(fmtDate(cont.updatedAt))}</small>` : ''}
        <div class="row"><button class="btn primary" id="homeContinueBtn" data-cont="${cont.current ? '' : esc(cont.id)}">Continuar partida</button></div>
      </div>
    </div>`;
}
function renderHomeSummary(s: PlayerStats | null, failed?: boolean): void {
  const el = $('#homeSummary');
  const n = s ? s.games_played : 0,
    w = s ? s.wins : 0,
    l = s ? s.losses : 0,
    d = s ? s.draws : 0;
  const bar = n
    ? `<div class="wdl-bar" aria-hidden="true"><i class="st-vitoria" style="width:${pct(w, n)}%"></i><i class="st-empate" style="width:${pct(d, n)}%"></i><i class="st-derrota" style="width:${pct(l, n)}%"></i></div>`
    : '<div class="wdl-bar" aria-hidden="true"></div>';
  const note = failed
    ? 'Não foi possível carregar o resumo agora.'
    : !s
      ? 'Carregando…'
      : n
        ? `${fmtNum(n)} partida${n === 1 ? '' : 's'} com resultado · ${pct(w, n)}% de vitórias`
        : 'Nenhuma partida com resultado ainda. Vitória, derrota e empate contra bot entram aqui.';
  el.innerHTML = `<div class="home-card-h"><h2>Seu resumo</h2><a href="#/estatisticas">Estatísticas →</a></div>
    <div class="wdl">
      <div class="st-vitoria"><span>Vitórias</span><b>${s ? fmtNum(w) : '—'}</b></div>
      <div class="st-derrota"><span>Derrotas</span><b>${s ? fmtNum(l) : '—'}</b></div>
      <div class="st-empate"><span>Empates</span><b>${s ? fmtNum(d) : '—'}</b></div>
    </div>${bar}<p class="home-sum-note">${esc(note)}</p>`;
}
export function initHome(): void {
  $('#homeNew').onclick = newGameFlow;
  $('#homeContinue').onclick = (e) => {
    if (target(e).closest('[data-home-new]')) {
      newGameFlow();
      return;
    }
    const b = target(e).closest<HTMLElement>('#homeContinueBtn');
    if (!b) return;
    if (!b.dataset.cont) {
      goView('jogo');
      return;
    }
    openGameById(b.dataset.cont);
  };
  $('#homeRecent').onclick = (e) => {
    const o = target(e).closest<HTMLElement>('[data-open]');
    if (o) openGameById(o.dataset.open as string);
  };
}
