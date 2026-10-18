/* Estilo do tabuleiro e das peças (rodapé): escolha pendente até Salvar. O desenho é StylePicker
   (board/style-picker-view.tsx); a prévia da animação de captura roda imperativa sobre a miniatura do botão. */
import { closeHistory } from '../game/history';
import { setDrawer } from '../game/menus';
import { UI, focusId } from '../game/ui-state';
import { publish } from '../store/view-store';
import { target } from '../ui/dom';
import { writePrefs } from '../ui/theme';
import { CAPTURE_FX } from './capture-fx';
import { BOARD_STYLES, CAPTURE_STYLES, PIECE_STYLES, STYLE, preloadPieces } from './pieces';

/** escolha em andamento no painel (vale só depois de Salvar) */
export const PICK_STYLE = { ...STYLE };
export function styleNowText(): string {
  const b = BOARD_STYLES.find((x) => x.id === STYLE.board),
    pc = PIECE_STYLES.find((x) => x.id === STYLE.pieces);
  const cp = CAPTURE_STYLES.find((x) => x.id === STYLE.capture);
  return `Tabuleiro ${b ? b.name : ''} · peças ${pc ? pc.name : ''} · captura ${cp ? cp.name : ''}`;
}
/** aplica o estilo salvo (tabuleiro, peças e o texto do rodapé) */
export function applyStyle(): void {
  publish('board');
}
function playCapturePreview(btn: HTMLElement | null): void {
  const stage = btn && btn.querySelector<HTMLElement>('.cap-stage');
  if (!stage || !btn) return;
  const host = stage.querySelector<HTMLElement>('[data-x="2"][data-y="2"]')!;
  const neighbors = [...stage.querySelectorAll<HTMLElement>('i')].map((el) => ({
    el,
    d: Math.max(Math.abs(Number(el.dataset.x) - 2), Math.abs(Number(el.dataset.y) - 2)),
  }));
  (CAPTURE_FX[btn.dataset.pickCapture as string] || CAPTURE_FX.gota)!({
    host,
    size: host.getBoundingClientRect().width,
    neighbors,
    shakeEl: stage,
    capturedColor: 'b',
  });
}
export function pickBoard(id: string): void {
  PICK_STYLE.board = id;
  publish('board');
}
export function pickPieces(id: string): void {
  PICK_STYLE.pieces = id;
  publish('board');
}
export function pickCapture(id: string): void {
  PICK_STYLE.capture = id;
  publish('board');
  playCapturePreview(document.querySelector<HTMLElement>(`#captureStyles [data-pick-capture="${PICK_STYLE.capture}"]`));
}
export function closeStyle(focusBtn: boolean): void {
  if (!UI.style) return;
  UI.style = false;
  publish('board');
  if (focusBtn) focusId('openStyle');
}
export function toggleStyle(): void {
  if (UI.style) {
    closeStyle(false);
    return;
  }
  setDrawer(null);
  Object.assign(PICK_STYLE, STYLE);
  UI.style = UI.styleOpened = true;
  publish('board');
  focusId('stylePop');
}
let savedTimer: ReturnType<typeof setTimeout> | 0 = 0;
export function saveStyle(): void {
  Object.assign(STYLE, PICK_STYLE);
  writePrefs();
  preloadPieces(STYLE.pieces);
  // só redesenha: a partida, a seleção e a análise continuam como estavam
  closeStyle(true);
  UI.styleLabel = 'Estilo salvo';
  publish('board');
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => {
    UI.styleLabel = 'Estilo do tabuleiro e peças';
    publish('board');
  }, 1500);
}
export function initStylePicker(): void {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (UI.history) {
      e.preventDefault();
      closeHistory();
    } else if (UI.style) {
      e.preventDefault();
      closeStyle(true);
    }
  });
  document.addEventListener('pointerdown', (e) => {
    if (UI.style && !target(e).closest('#stylePop, #openStyle')) closeStyle(false);
  });
}
