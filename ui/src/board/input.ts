/* Arrastar e clicar: seleção da peça, lances legais, arrastar com "fantasma" e escolha da promoção.
   Os handlers ficam no elemento do tabuleiro (componente Board); o fantasma é um elemento solto no body, como antes. */
import type { PieceType } from 'chess.js';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { userMove } from '../core/game';
import { S } from '../core/state';
import { REFS, UI } from '../game/ui-state';
import { publish } from '../store/view-store';
import { IMG_SETS, STYLE, pieceSpan } from './pieces';
import { canUserMove, sqAt } from './render';

interface Drag {
  from: string;
  x: number;
  y: number;
  moved: boolean;
  ghost: HTMLElement | null;
}
let drag: Drag | null = null;

function tryMove(from: string, to: string): void {
  const p = S.game.get(from);
  if (p && p.type === 'p' && (to[1] === '8' || to[1] === '1')) {
    UI.promo = { from, to, color: p.color };
    publish('board');
    return;
  }
  userMove(from, to);
}
export function choosePromo(t: PieceType): void {
  const pr = UI.promo;
  if (!pr) return;
  UI.promo = null;
  userMove(pr.from, pr.to, t);
}
export function cancelPromo(): void {
  UI.promo = null;
  S.selected = null;
  S.targets = [];
  publish('board');
}

type PE = ReactPointerEvent<HTMLElement>;
export function onBoardPointerDown(e: PE): void {
  if (e.button !== 0 || UI.promo) return;
  const sq = sqAt(e.clientX, e.clientY);
  if (!sq) return;
  if (S.selected && S.targets.includes(sq)) {
    tryMove(S.selected, sq);
    return;
  }
  const p = S.game.get(sq);
  if (canUserMove() && p && p.color === S.game.turn()) {
    S.selected = sq;
    S.targets = S.game.moves({ square: sq, verbose: true }).map((m) => m.to);
    publish('board');
    drag = { from: sq, x: e.clientX, y: e.clientY, moved: false, ghost: null };
    const board = e.currentTarget;
    if (board.setPointerCapture) board.setPointerCapture(e.pointerId);
  } else if (S.selected) {
    S.selected = null;
    S.targets = [];
    publish('board');
  }
}
export function onBoardPointerMove(e: PE): void {
  if (!drag) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) return;
  if (!drag.moved) {
    drag.moved = true;
    const p = S.game.get(drag.from)!;
    const tpl = document.createElement('div');
    tpl.innerHTML = pieceSpan(p.type, p.color);
    const g = tpl.firstElementChild as HTMLElement;
    g.classList.add('ghost');
    g.dataset.pieces = STYLE.pieces;
    const sqPx = REFS.squares ? REFS.squares.getBoundingClientRect().width / 8 : 0;
    if (IMG_SETS.has(STYLE.pieces)) {
      g.style.width = g.style.height = sqPx + 'px';
    } else g.style.fontSize = sqPx * (STYLE.pieces === 'letras' ? 0.45 : 0.86) + 'px';
    document.body.appendChild(g);
    drag.ghost = g;
    const src = REFS.squares && REFS.squares.querySelector(`[data-sq="${drag.from}"] .pc`);
    if (src) src.classList.add('dragging');
  }
  const ghost = drag.ghost as HTMLElement;
  ghost.style.left = e.clientX + 'px';
  ghost.style.top = e.clientY + 'px';
}
function endDrag(e: PE, up: boolean): void {
  if (!drag) return;
  const d = drag;
  drag = null;
  if (d.ghost) d.ghost.remove();
  if (d.moved) {
    const src = REFS.squares && REFS.squares.querySelector(`[data-sq="${d.from}"] .pc.dragging`);
    if (src) src.classList.remove('dragging');
    const sq = up ? sqAt(e.clientX, e.clientY) : null;
    if (sq && S.targets.includes(sq)) tryMove(d.from, sq);
    else publish('board');
  }
}
export const onBoardPointerUp = (e: PE): void => endDrag(e, true);
export const onBoardPointerCancel = (e: PE): void => endDrag(e, false);
