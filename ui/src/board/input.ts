/* Arrastar e clicar: seleção da peça, lances legais, arrastar com "fantasma" e escolha da promoção */
import type { PieceType } from 'chess.js';
import { PIECE } from '../core/constants';
import { userMove } from '../core/game';
import { S } from '../core/state';
import { $, target } from '../ui/dom';
import { IMG_SETS, STYLE, pieceSpan } from './pieces';
import { boardEl, canUserMove, renderBoard, sqAt, squaresEl } from './render';

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
    const opts = $('#promoOpts');
    opts.innerHTML = (['q', 'r', 'b', 'n'] as PieceType[])
      .map((t) => `<button data-p="${t}" aria-label="${PIECE[t][1]}">${pieceSpan(t, p.color)}</button>`)
      .join('');
    $('#promo').hidden = false;
    opts.onclick = (ev) => {
      const b = target(ev).closest<HTMLElement>('button');
      if (!b) return;
      $('#promo').hidden = true;
      userMove(from, to, b.dataset.p);
    };
    $('#promo').onclick = (ev) => {
      if (target(ev).id === 'promo') {
        $('#promo').hidden = true;
        S.selected = null;
        S.targets = [];
        renderBoard();
      }
    };
    return;
  }
  userMove(from, to);
}

export function initBoardInput(): void {
  boardEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !$('#promo').hidden) return;
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
      renderBoard();
      drag = { from: sq, x: e.clientX, y: e.clientY, moved: false, ghost: null };
      boardEl.setPointerCapture(e.pointerId);
    } else if (S.selected) {
      S.selected = null;
      S.targets = [];
      renderBoard();
    }
  });
  boardEl.addEventListener('pointermove', (e) => {
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
      const sqPx = squaresEl.getBoundingClientRect().width / 8;
      if (IMG_SETS.has(STYLE.pieces)) {
        g.style.width = g.style.height = sqPx + 'px';
      } else g.style.fontSize = sqPx * (STYLE.pieces === 'letras' ? 0.45 : 0.86) + 'px';
      document.body.appendChild(g);
      drag.ghost = g;
      const src = squaresEl.querySelector(`[data-sq="${drag.from}"] .pc`);
      if (src) src.classList.add('dragging');
    }
    const ghost = drag.ghost as HTMLElement;
    ghost.style.left = e.clientX + 'px';
    ghost.style.top = e.clientY + 'px';
  });
  const endDrag = (e: PointerEvent) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.ghost) d.ghost.remove();
    if (d.moved) {
      const sq = e && e.type === 'pointerup' ? sqAt(e.clientX, e.clientY) : null;
      if (sq && S.targets.includes(sq)) tryMove(d.from, sq);
      else renderBoard();
    }
  };
  boardEl.addEventListener('pointerup', endDrag);
  boardEl.addEventListener('pointercancel', endDrag);
}
