/* ---------- Interações do Tabuleiro ----------
   Navegação pelos lances, teclado, modo de jogo, nova partida, PGN (colar, arquivo, arrastar, copiar) e escolha do bot. */
import { Chess } from 'chess.js';
import { BOTS, CLS, CLS_KEYS, SAMPLE_PGN, uciObj, type DepthKey } from '../core/constants';
import { afterChange, save, saveGame } from '../store/session';
import { checkOver, loadPgn, startGame, undo } from '../core/game';
import { recommendBot } from '../core/rating';
import { S, botColor, viewIdx } from '../core/state';
import { badgeHtml, renderBoard } from '../board/render';
import { requestAnalysis } from '../engine/analysis';
import { boardCtx } from '../store/contexts';
import { goView } from '../desktop/views';
import { $, target } from '../ui/dom';
import { setDrawer } from './menus';
import { renderAll } from './panel';
import { RATING, renderRecNote } from './rating';
import { goTo, replaying, startReplay, stopReplay } from './replay';

/** app desktop ainda sem login: atalhos e arrastar arquivo ficam desligados */
export const locked = (): boolean => document.documentElement.classList.contains('needs-auth');

// o modo vale na hora, inclusive para a partida em andamento
export function renderModeSeg(): void {
  const sel = $<HTMLSelectElement>('#modeSel');
  sel.value = S.gameMode;
  sel.disabled = S.mode === 'review';
  sel.title = S.mode === 'review' ? 'Partidas importadas por PGN são sempre avaliadas' : '';
}
export function renderBots(): void {
  const rec = recommendBot(RATING.rating);
  $('#bots').innerHTML = BOTS.map(
    (b) =>
      `<button class="bot${b.id === 'none' ? ' bot-none' : ''}${b.id === rec.id ? ' recommended' : ''}" data-id="${b.id}" aria-pressed="${b.id === S.pickBot.id}"><b>${b.level}</b><span>${b.elo ? '≈' + b.elo + ' · ' : ''}${b.desc}</span>${b.id === rec.id ? '<em class="rec">Recomendado</em>' : ''}</button>`,
  ).join('');
}
function readPgnFile(file: File | undefined): void {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    const text = String(r.result || '');
    $<HTMLTextAreaElement>('#pgnIn').value = text;
    loadPgn(text);
  };
  r.readAsText(file);
}

// setas, lista de lances, gráfico e atalhos de teclado
export function initNav(): void {
  $('#navFirst').onclick = () => goTo(0);
  $('#navPrev').onclick = () => goTo(viewIdx() - 1);
  $('#navNext').onclick = () => goTo(viewIdx() + 1);
  $('#navLast').onclick = () => goTo(S.positions.length - 1);
  $('#btnFlip').onclick = () => {
    S.orient = S.orient === 'w' ? 'b' : 'w';
    renderAll();
  };
  $('#btnUndo').onclick = undo;
  $('#btnHint').onclick = () => {
    S.hintAt = viewIdx();
    requestAnalysis(S.positions[S.hintAt] as string);
    renderBoard();
  };
  $('#moveList').onclick = (e) => {
    const b = target(e).closest<HTMLElement>('.mv[data-i]');
    if (b) goTo(+(b.dataset.i as string));
  };
  $('#graph').onclick = (e) => {
    const r = (e.currentTarget as Element).getBoundingClientRect();
    goTo(Math.round(((e.clientX - r.left) / r.width) * (S.positions.length - 1)));
  };
  document.addEventListener('keydown', (e) => {
    if (locked()) return;
    const t = e.target as Element | null;
    if (t && t.closest && t.closest('textarea,select,input')) return;
    if (document.querySelector('.modal:not([hidden])')) return;
    if (document.documentElement.dataset.view && document.documentElement.dataset.view !== 'jogo') return; // atalhos do tabuleiro só na view do jogo
    if (e.key === 'ArrowLeft') {
      goTo(viewIdx() - 1);
      e.preventDefault();
    }
    if (e.key === 'ArrowRight') {
      goTo(viewIdx() + 1);
      e.preventDefault();
    }
    if (e.key === 'Home') goTo(0);
    if (e.key === 'End') goTo(S.positions.length - 1);
  });
}

export function initGameControls(): void {
  $<HTMLSelectElement>('#modeSel').onchange = (e) => {
    S.gameMode = (e.target as HTMLSelectElement).value === 'normal' ? 'normal' : 'assistido';
    if (S.mode === 'play' && !S.over) {
      if (S.gameMode === 'assistido') S.rated = false;
      else if (!S.plies.length && botColor() && !S.trainer) S.rated = true; // treino e estudo nunca valem rating
    }
    renderRecNote();
    save();
    if (S.mode === 'play' && S.plies.length && !S.over) saveGame(); // o modo (e se vale rating) vai junto para o histórico
    renderAll();
  };
  $('#btnFinish').onclick = () => {
    if (!S.plies.length) return;
    S.botToken++;
    S.botThinking = false;
    S.ended = true;
    checkOver();
    S.view = null;
    afterChange();
    renderAll();
  };
  // nova partida e PGN são do Tabuleiro: no estudo, voltam para a partida do Tabuleiro antes
  $('#btnStart').onclick = () => {
    setDrawer(null);
    if (boardCtx() !== 'jogo') goView('jogo');
    startGame();
  };
  $('#btnPgn').onclick = () => {
    if (boardCtx() !== 'jogo') goView('jogo');
    loadPgn($<HTMLTextAreaElement>('#pgnIn').value);
  };
  $<HTMLInputElement>('#pgnFile').onchange = (e) => {
    const input = e.target as HTMLInputElement;
    readPgnFile(input.files ? input.files[0] : undefined);
    input.value = '';
  };
  document.addEventListener('dragover', (e) => {
    if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault();
  });
  document.addEventListener('drop', (e) => {
    const f = e.dataTransfer && e.dataTransfer.files[0];
    if (f) {
      e.preventDefault();
      if (!locked()) readPgnFile(f);
    }
  });
  $('#btnSample').onclick = () => {
    $<HTMLTextAreaElement>('#pgnIn').value = SAMPLE_PGN;
    loadPgn(SAMPLE_PGN);
  };
  $('#btnCopy').onclick = async (e) => {
    const c = new Chess(S.positions[0]);
    for (const p of S.plies) c.move(uciObj(p.uci));
    const pgn = c.pgn({ max_width: 80 });
    const btn = e.currentTarget as HTMLElement;
    try {
      await navigator.clipboard.writeText(pgn);
      btn.textContent = 'PGN copiado';
    } catch (_) {
      setDrawer('pgnBox');
      const t = $<HTMLTextAreaElement>('#pgnIn');
      t.value = pgn;
      t.select();
      btn.textContent = 'Selecione e copie';
    }
    setTimeout(() => {
      btn.textContent = 'Copiar PGN';
    }, 1800);
  };
  $('#colorSeg').onclick = (e) => {
    const b = target(e).closest('button');
    if (!b) return;
    for (const x of $('#colorSeg').children) x.setAttribute('aria-pressed', String(x === b));
  };
  $<HTMLSelectElement>('#depthSel').onchange = (e) => {
    S.depth = (e.target as HTMLSelectElement).value as DepthKey;
    save();
  };
  $('#bots').onclick = (e) => {
    const b = target(e).closest<HTMLElement>('.bot');
    if (!b) return;
    S.pickBot = BOTS.find((x) => x.id === b.dataset.id)!;
    renderBots();
  };
  $('#legend').innerHTML = CLS_KEYS.map(
    (k) => `<div>${badgeHtml(k, 'mini')}<span><b>${CLS[k].label}</b><small>${CLS[k].desc}</small></span></div>`,
  ).join('');
}

export function initReplayButton(): void {
  $('#btnReplay').onclick = () => {
    if (replaying()) stopReplay();
    else startReplay();
  };
}
