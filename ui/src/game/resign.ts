/* Desistência: dois cliques (o primeiro pede confirmação). O botão é desenhado em panels.tsx (UI.resignArmed). */
import { checkOver } from '../core/game';
import { S, botColor } from '../core/state';
import { reducedMotion } from '../board/animations';
import { afterChange } from '../store/session';
import { publish } from '../store/view-store';
import { REFS, UI } from './ui-state';

let resignTimer: ReturnType<typeof setTimeout> | 0 = 0;
export const canResign = (): boolean => S.mode === 'play' && !!botColor() && !S.over;
/** desarma sem redesenhar (quem chama publica) */
function disarm(): void {
  clearTimeout(resignTimer);
  resignTimer = 0;
  UI.resignArmed = false;
}
/** antes de redesenhar: sem desistência possível, o botão volta a "Desistir" */
export function resignSync(): void {
  if (UI.resignArmed && !canResign()) disarm();
}
export function resignClick(): void {
  if (!canResign()) return;
  if (!resignTimer) {
    UI.resignArmed = true;
    resignTimer = setTimeout(() => {
      disarm();
      publish('board');
    }, 4000);
    publish('board');
    return;
  }
  disarm();
  S.botToken++;
  S.botThinking = false;
  S.resigned = true;
  S.selected = null;
  S.targets = [];
  checkOver();
  S.view = null;
  afterChange();
  publish();
  if (!reducedMotion() && REFS.squares)
    for (const b of REFS.squares.querySelectorAll('.end-badge'))
      b.animate(
        [
          { opacity: 0, scale: 0.2 },
          { opacity: 1, scale: 1.25, offset: 0.6 },
          { opacity: 1, scale: 1 },
        ],
        { duration: 520, easing: 'ease-out' },
      );
}
