/* ---------- Animações de lance ----------
   Peça deslizando, peça capturada sumindo, xeque, xeque-mate (faixa, coroa e rei caído). Imperativas (Web Animations
   API) sobre os elementos que o componente Board desenhou: quem chama já publicou o lance (o DOM está em dia). */
import type { Color } from 'chess.js';
import { S, botColor } from '../core/state';
import type { Ply } from '../core/types';
import { esc } from '../ui/escape';
import { rippleFx } from './capture-fx';
import { REFS } from '../game/ui-state';
import { STYLE, pieceSpan } from './pieces';
import { sqXY } from './render';

export const reducedMotion = (): boolean => !!window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
function pieceAt(sq: string): HTMLElement | null {
  return REFS.squares ? REFS.squares.querySelector<HTMLElement>(`[data-sq="${sq}"] .pc`) : null;
}
function squareEl(sq: string): HTMLElement | null {
  return REFS.squares ? REFS.squares.querySelector<HTMLElement>(`[data-sq="${sq}"]`) : null;
}
// desliza a peça da casa de origem até a de destino (ela já está desenhada no destino)
export function slidePiece(from: string, to: string, dur: number): Promise<void> {
  const el = pieceAt(to);
  if (!el || !REFS.squares) return Promise.resolve();
  const [fx, fy] = sqXY(from),
    [tx, ty] = sqXY(to);
  const size = REFS.squares.getBoundingClientRect().width / 8;
  const dx = (fx - tx) * size,
    dy = (fy - ty) * size;
  el.style.zIndex = '6';
  const a = el.animate(
    [
      { translate: `${dx}px ${dy}px`, scale: 1 },
      { translate: `${dx * 0.45}px ${dy * 0.45 - size * 0.08}px`, scale: 1.08, offset: 0.45 },
      { translate: '0px 0px', scale: 1 },
    ],
    { duration: dur, easing: 'cubic-bezier(.3,.7,.25,1)' },
  );
  return a.finished
    .catch(() => {})
    .then(() => {
      el.style.zIndex = '';
      if (!el.style.cssText) el.removeAttribute('style'); // o nó continua o mesmo depois do lance (React): sem style="" sobrando
    });
}
// a peça capturada some aos poucos enquanto a outra chega
export function fadeCaptured(ply: Ply): void {
  let sq = ply.to;
  if (ply.flags && ply.flags.includes('e')) sq = ply.to[0] + (ply.from[1] as string);
  const host = squareEl(sq);
  if (!host) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = pieceSpan(ply.captured!, ply.color === 'w' ? 'b' : 'w');
  const g = tmp.firstElementChild as HTMLElement;
  g.style.position = 'absolute';
  g.style.zIndex = '2';
  host.appendChild(g);
  g.animate(
    [
      { opacity: 1, scale: 1 },
      { opacity: 0, scale: 0.7 },
    ],
    { duration: 340, delay: 120, easing: 'ease-in', fill: 'forwards' },
  ).finished.then(
    () => g.remove(),
    () => g.remove(),
  );
}
function checkFx(): void {
  const squaresEl = REFS.squares;
  const sqEl = squaresEl && squaresEl.querySelector('.sq.chk');
  if (!sqEl) return;
  const king = sqEl.querySelector('.pc');
  if (king)
    king.animate([{ rotate: '0deg' }, { rotate: '-12deg' }, { rotate: '10deg' }, { rotate: '-6deg' }, { rotate: '3deg' }, { rotate: '0deg' }], {
      duration: 520,
      easing: 'ease-out',
    });
  const ring = document.createElement('span');
  ring.className = 'chk-ring';
  sqEl.appendChild(ring);
  ring
    .animate(
      [
        { opacity: 0.95, scale: 0.5 },
        { opacity: 0, scale: 1.6 },
      ],
      { duration: 750, easing: 'ease-out' },
    )
    .finished.then(
      () => ring.remove(),
      () => ring.remove(),
    );
  const tag = document.createElement('span');
  tag.className = 'chk-tag';
  tag.textContent = 'Xeque!';
  sqEl.appendChild(tag);
  tag
    .animate(
      [
        { opacity: 0, transform: 'translate(-50%, 0) scale(.6)' },
        { opacity: 1, transform: 'translate(-50%, -60%) scale(1.05)', offset: 0.25 },
        { opacity: 1, transform: 'translate(-50%, -80%) scale(1)', offset: 0.75 },
        { opacity: 0, transform: 'translate(-50%, -110%) scale(.95)' },
      ],
      { duration: 1100, easing: 'ease-out' },
    )
    .finished.then(
      () => tag.remove(),
      () => tag.remove(),
    );
}
function mateFx(winner: Color): void {
  const boardEl = REFS.board,
    squaresEl = REFS.squares;
  if (!boardEl || !squaresEl) return;
  const banner = document.createElement('div');
  banner.className = 'board-banner';
  const you = botColor() ? (winner === S.player ? 'Você venceu!' : `${S.bot.name} venceu`) : winner === 'w' ? 'Brancas vencem' : 'Pretas vencem';
  banner.innerHTML = `<b>Xeque-mate</b><span>${esc(you)}</span>`;
  boardEl.appendChild(banner);
  banner
    .animate(
      [
        { opacity: 0, transform: 'translate(-50%,-50%) scale(.6)' },
        { opacity: 1, transform: 'translate(-50%,-50%) scale(1.06)', offset: 0.18 },
        { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: 0.3 },
        { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: 0.82 },
        { opacity: 0, transform: 'translate(-50%,-50%) scale(.96)' },
      ],
      { duration: 2600, easing: 'ease-out' },
    )
    .finished.then(
      () => banner.remove(),
      () => banner.remove(),
    );
  for (const b of squaresEl.querySelectorAll('.end-badge'))
    b.animate(
      [
        { opacity: 0, scale: 0.2 },
        { opacity: 1, scale: 1.25, offset: 0.6 },
        { opacity: 1, scale: 1 },
      ],
      { duration: 520, delay: 250, easing: 'ease-out', fill: 'backwards' },
    );
  const lose = squaresEl.querySelector('.pc.fallen');
  if (lose)
    lose.animate([{ rotate: '0deg' }, { rotate: '-8deg', offset: 0.3 }, { rotate: '-75deg' }], { duration: 700, easing: 'cubic-bezier(.5,0,.8,.4)' });
  const winKing = [...squaresEl.querySelectorAll('.sq')].find((el) => el.querySelector('.end-badge.win'));
  const wk = winKing && winKing.querySelector('.pc');
  if (wk)
    wk.animate(
      [
        { filter: 'drop-shadow(0 0 0 rgba(255,200,40,0))' },
        { filter: 'drop-shadow(0 0 1.6cqw rgba(255,200,40,.95))', offset: 0.4 },
        { filter: 'drop-shadow(0 0 0 rgba(255,200,40,0))' },
      ],
      { duration: 1400, iterations: 2, easing: 'ease-in-out' },
    );
}
export const slideDuration = (from: string, to: string): number => {
  const [fx, fy] = sqXY(from),
    [tx, ty] = sqXY(to);
  return Math.min(560, 260 + Math.hypot(fx - tx, fy - ty) * 45);
};
// chamado depois de redesenhar o tabuleiro com o lance novo
export async function moveFx(ply: Ply | undefined, { slide }: { slide: boolean }): Promise<void> {
  if (!ply || reducedMotion()) {
    if (ply && S.game.in_checkmate()) mateFx(ply.color);
    return;
  }
  const tasks: Promise<void>[] = [];
  const dur = slideDuration(ply.from, ply.to);
  const mate = S.game.in_checkmate(),
    check = ply.san.includes('+');
  S.animUntil = performance.now() + (slide ? dur : 0) + Math.max(mate ? 2700 : check ? 1150 : 0, ply.captured ? 1250 : 0);
  if (slide) {
    if (ply.captured) fadeCaptured(ply);
    tasks.push(slidePiece(ply.from, ply.to, dur));
    if (ply.flags && (ply.flags.includes('k') || ply.flags.includes('q'))) {
      const rank = ply.from[1] as string,
        king = ply.flags.includes('k');
      tasks.push(slidePiece((king ? 'h' : 'a') + rank, (king ? 'f' : 'd') + rank, dur));
    }
  }
  await Promise.all(tasks);
  if (ply.captured) rippleFx(ply.to, STYLE.capture, ply.color === 'w' ? 'b' : 'w');
  if (S.game.in_checkmate()) mateFx(ply.color);
  else if (ply.san.includes('+')) checkFx();
}
