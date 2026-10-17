/* Estilo do tabuleiro e das peças (rodapé): escolha pendente até Salvar */
import { $, target } from '../ui/dom';
import { writePrefs } from '../ui/theme';
import { CAPTURE_FX } from './capture-fx';
import { BOARD_STYLES, CAPTURE_STYLES, PIECE_STYLES, STYLE, pieceSpan, preloadPieces } from './pieces';
import { boardEl, renderBoard } from './render';
import { setDrawer } from '../game/menus';
import { closeHistory } from '../game/history';

const pickStyle = { ...STYLE };
export function applyStyle(): void {
  boardEl.dataset.board = STYLE.board;
  boardEl.dataset.pieces = STYLE.pieces;
  const b = BOARD_STYLES.find((x) => x.id === STYLE.board),
    pc = PIECE_STYLES.find((x) => x.id === STYLE.pieces);
  const cp = CAPTURE_STYLES.find((x) => x.id === STYLE.capture);
  $('#styleNow').textContent = `Tabuleiro ${b ? b.name : ''} · peças ${pc ? pc.name : ''} · captura ${cp ? cp.name : ''}`;
}
function capStage(boardId: string, piecesId: string): string {
  let h = '';
  for (let y = 0; y < 5; y++)
    for (let x = 0; x < 5; x++)
      h += `<i class="${(x + y) % 2 ? 'd' : 'l'}" data-x="${x}" data-y="${y}">${x === 2 && y === 2 ? pieceSpan('n', 'w', piecesId) : ''}</i>`;
  return `<span class="cap-stage" data-board="${boardId}" data-pieces="${piecesId}" aria-hidden="true">${h}</span>`;
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
function renderStyleOpts(): void {
  $('#boardStyles').innerHTML = BOARD_STYLES.map(
    (b) =>
      `<button class="style-opt" data-board="${b.id}" data-pick-board="${b.id}" aria-pressed="${b.id === pickStyle.board}"><span class="sw" aria-hidden="true">${'<i></i>'.repeat(8)}</span>${b.name}</button>`,
  ).join('');
  $('#captureStyles').innerHTML = CAPTURE_STYLES.map(
    (c) =>
      `<button class="style-opt cap-opt" data-pick-capture="${c.id}" aria-pressed="${c.id === pickStyle.capture}">${capStage(pickStyle.board, pickStyle.pieces)}<span class="cap-name">${c.name}<small>${c.desc}</small></span></button>`,
  ).join('');
  $('#pieceStyles').innerHTML = PIECE_STYLES.map(
    (p) =>
      `<button class="style-opt" data-board="${pickStyle.board}" data-pieces="${p.id}" data-pick-pieces="${p.id}" aria-pressed="${p.id === pickStyle.pieces}"><span class="pv" aria-hidden="true">${pieceSpan('k', 'w', p.id)}${pieceSpan('q', 'b', p.id)}${pieceSpan('n', 'w', p.id)}${pieceSpan('p', 'b', p.id)}</span>${p.name}</button>`,
  ).join('');
}
export function closeStyle(focusBtn: boolean): void {
  if ($('#stylePop').hidden) return;
  $('#stylePop').hidden = true;
  $('#openStyle').setAttribute('aria-expanded', 'false');
  if (focusBtn) $('#openStyle').focus();
}
export function initStylePicker(): void {
  $('#openStyle').onclick = () => {
    if (!$('#stylePop').hidden) {
      closeStyle(false);
      return;
    }
    setDrawer(null);
    Object.assign(pickStyle, STYLE);
    renderStyleOpts();
    $('#stylePop').hidden = false;
    $('#openStyle').setAttribute('aria-expanded', 'true');
    $('#stylePop').focus();
  };
  $('#boardStyles').onclick = (e) => {
    const b = target(e).closest<HTMLElement>('[data-pick-board]');
    if (b) {
      pickStyle.board = b.dataset.pickBoard as string;
      renderStyleOpts();
    }
  };
  $('#captureStyles').onclick = (e) => {
    const b = target(e).closest<HTMLElement>('[data-pick-capture]');
    if (!b) return;
    pickStyle.capture = b.dataset.pickCapture as string;
    renderStyleOpts();
    playCapturePreview(document.querySelector<HTMLElement>(`#captureStyles [data-pick-capture="${pickStyle.capture}"]`));
  };
  $('#pieceStyles').onclick = (e) => {
    const b = target(e).closest<HTMLElement>('[data-pick-pieces]');
    if (b) {
      pickStyle.pieces = b.dataset.pickPieces as string;
      renderStyleOpts();
    }
  };
  $('#styleCancel').onclick = () => closeStyle(true);
  $('#styleSave').onclick = () => {
    Object.assign(STYLE, pickStyle);
    writePrefs();
    applyStyle();
    preloadPieces(STYLE.pieces);
    // só redesenha: a partida, a seleção e a análise continuam como estavam
    renderBoard();
    closeStyle(true);
    const b = $('#openStyle');
    b.textContent = 'Estilo salvo';
    setTimeout(() => {
      b.textContent = 'Estilo do tabuleiro e peças';
    }, 1500);
  };
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#historyModal').hidden) {
      e.preventDefault();
      closeHistory();
    } else if (!$('#stylePop').hidden) {
      e.preventDefault();
      closeStyle(true);
    }
  });
  document.addEventListener('pointerdown', (e) => {
    if (!$('#stylePop').hidden && !target(e).closest('#stylePop, #openStyle')) closeStyle(false);
  });
}
