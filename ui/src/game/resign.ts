/* Desistência: dois cliques (o primeiro pede confirmação) */
import { checkOver } from '../core/game';
import { S, botColor } from '../core/state';
import { reducedMotion } from '../board/animations';
import { squaresEl } from '../board/render';
import { afterChange } from '../store/session';
import { $ } from '../ui/dom';
import { renderAll } from './panel';

let resignTimer: ReturnType<typeof setTimeout> | 0 = 0;
export const canResign = (): boolean => S.mode === 'play' && !!botColor() && !S.over;
export function disarmResign(): void {
  clearTimeout(resignTimer);
  resignTimer = 0;
  const b = $('#btnResign');
  b.textContent = 'Desistir';
  b.classList.remove('armed');
}
export function initResign(): void {
  $('#btnResign').onclick = () => {
    if (!canResign()) return;
    const b = $('#btnResign');
    if (!resignTimer) {
      b.textContent = 'Confirmar desistência';
      b.classList.add('armed');
      resignTimer = setTimeout(disarmResign, 4000);
      return;
    }
    disarmResign();
    S.botToken++;
    S.botThinking = false;
    S.resigned = true;
    S.selected = null;
    S.targets = [];
    checkOver();
    S.view = null;
    afterChange();
    renderAll();
    if (!reducedMotion())
      for (const b of squaresEl.querySelectorAll('.end-badge'))
        b.animate(
          [
            { opacity: 0, scale: 0.2 },
            { opacity: 1, scale: 1.25, offset: 0.6 },
            { opacity: 1, scale: 1 },
          ],
          { duration: 520, easing: 'ease-out' },
        );
  };
}
