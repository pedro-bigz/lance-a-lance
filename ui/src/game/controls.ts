/* ---------- Interações do Tabuleiro ----------
   Navegação pelos lances, teclado, modo de jogo, nova partida, PGN (colar, arquivo, arrastar, copiar) e escolha do bot.
   Os botões ficam nos componentes (panels.tsx, top-bar.tsx, game-view.tsx); aqui ficam as ações e os atalhos do
   document, registrados em main.tsx na ordem de sempre. */
import { Chess } from 'chess.js';
import { BOTS, SAMPLE_PGN, uciObj, type DepthKey } from '../core/constants';
import { afterChange, save, saveGame } from '../store/session';
import { checkOver, loadPgn, startGame, undo } from '../core/game';
import { S, botColor, viewIdx } from '../core/state';
import { requestAnalysis } from '../engine/analysis';
import { boardCtx } from '../store/contexts';
import { publish } from '../store/view-store';
import { goView } from '../desktop/views';
import { setDrawer } from './menus';
import { renderRecNote } from './rating';
import { goTo } from './replay';
import { REFS, UI } from './ui-state';

/** app desktop ainda sem login: atalhos e arrastar arquivo ficam desligados */
export const locked = (): boolean => document.documentElement.classList.contains('needs-auth');

function readPgnFile(file: File | undefined): void {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    const text = String(r.result || '');
    if (REFS.pgnIn) REFS.pgnIn.value = text;
    loadPgn(text);
  };
  r.readAsText(file);
}

export function flipBoard(): void {
  S.orient = S.orient === 'w' ? 'b' : 'w';
  publish();
}
export const undoClick = (): void => undo();
export function hintClick(): void {
  S.hintAt = viewIdx();
  requestAnalysis(S.positions[S.hintAt] as string);
  publish('board');
}
// setas, lista de lances, gráfico e atalhos de teclado
export function initNav(): void {
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

// o modo vale na hora, inclusive para a partida em andamento
export function setGameMode(v: string): void {
  S.gameMode = v === 'normal' ? 'normal' : 'assistido';
  if (S.mode === 'play' && !S.over) {
    if (S.gameMode === 'assistido') S.rated = false;
    else if (!S.plies.length && botColor() && !S.trainer) S.rated = true; // treino e estudo nunca valem rating
  }
  renderRecNote();
  save();
  if (S.mode === 'play' && S.plies.length && !S.over) saveGame(); // o modo (e se vale rating) vai junto para o histórico
  publish();
}
export function finishGame(): void {
  if (!S.plies.length) return;
  S.botToken++;
  S.botThinking = false;
  S.ended = true;
  checkOver();
  S.view = null;
  afterChange();
  publish();
}
// nova partida e PGN são do Tabuleiro: no estudo, voltam para a partida do Tabuleiro antes
export function startClick(): void {
  setDrawer(null);
  if (boardCtx() !== 'jogo') goView('jogo');
  startGame();
}
export function analyzePgn(): void {
  if (boardCtx() !== 'jogo') goView('jogo');
  loadPgn(REFS.pgnIn ? REFS.pgnIn.value : '');
}
export function pgnFileChosen(input: HTMLInputElement): void {
  readPgnFile(input.files ? input.files[0] : undefined);
  input.value = '';
}
export function loadSample(): void {
  if (REFS.pgnIn) REFS.pgnIn.value = SAMPLE_PGN;
  loadPgn(SAMPLE_PGN);
}
let copyTimer: ReturnType<typeof setTimeout> | 0 = 0;
export async function copyPgn(): Promise<void> {
  const c = new Chess(S.positions[0]);
  for (const p of S.plies) c.move(uciObj(p.uci));
  const pgn = c.pgn({ max_width: 80 });
  try {
    await navigator.clipboard.writeText(pgn);
    UI.copyLabel = 'PGN copiado';
    publish('board');
  } catch (_) {
    setDrawer('pgnBox');
    UI.copyLabel = 'Selecione e copie';
    publish('board');
    const t = REFS.pgnIn;
    if (t) {
      t.value = pgn;
      t.select();
    }
  }
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    UI.copyLabel = 'Copiar PGN';
    publish('board');
  }, 1800);
}
export function pickColor(v: 'w' | 'b' | 'r'): void {
  UI.color = v;
  publish('board');
}
export function setDepth(v: string): void {
  S.depth = v as DepthKey;
  save();
  publish('board');
}
export function pickBot(id: string): void {
  S.pickBot = BOTS.find((x) => x.id === id)!;
  publish('board');
}
export function initGameControls(): void {
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
}
