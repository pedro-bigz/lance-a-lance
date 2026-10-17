/* ---------- Reprodução e navegação pelos lances ----------
   Reprodução da partida terminada, um lance a cada 1,5 s, e goTo (setas, lista de lances, gráfico). */
import { S, viewIdx } from '../core/state';
import type { Ply } from '../core/types';
import { fadeCaptured, reducedMotion, slideDuration, slidePiece } from '../board/animations';
import { rippleFx } from '../board/capture-fx';
import { STYLE } from '../board/pieces';
import { moveSound } from '../board/sound';
import { playDemo } from '../tutor/training';
import { $, $opt } from '../ui/dom';
import { renderAll } from './panel';

const REPLAY_MS = 1500;
let replayTimer: ReturnType<typeof setInterval> | null = null;
export const canReplay = (): boolean => S.plies.length > 0 && (S.mode === 'review' || !!S.over);
function replayFx(ply: Ply | undefined): void {
  if (!ply) return;
  moveSound(/#/.test(ply.san) ? 'mate' : ply.san.includes('+') ? 'check' : 'move', !!ply.captured);
  if (reducedMotion()) return;
  const dur = slideDuration(ply.from, ply.to);
  S.animUntil = performance.now() + dur + (ply.captured ? 1250 : 0);
  if (ply.captured) fadeCaptured(ply);
  slidePiece(ply.from, ply.to, dur).then(() => {
    if (ply.captured) rippleFx(ply.to, STYLE.capture, ply.color === 'w' ? 'b' : 'w');
  });
  if (ply.flags && (ply.flags.includes('k') || ply.flags.includes('q'))) {
    const rank = ply.from[1] as string,
      king = ply.flags.includes('k');
    slidePiece((king ? 'h' : 'a') + rank, (king ? 'f' : 'd') + rank, dur);
  }
}
function replayStep(): void {
  const n = S.positions.length - 1;
  if (viewIdx() >= n) {
    stopReplay();
    return;
  }
  goTo(viewIdx() + 1, true);
  replayFx(S.plies[viewIdx() - 1]);
  if (viewIdx() >= n) {
    stopReplay();
    if (S.demoQueue && S.demoQueue.length)
      setTimeout(() => {
        if (S.demoQueue!.length) playDemo(S.demoQueue!.shift()!);
      }, 2500);
  }
}
export function startReplay(): void {
  if (!canReplay()) return;
  if (viewIdx() >= S.positions.length - 1) goTo(0, true); // terminou no último lance: recomeça do início
  replayTimer = setInterval(replayStep, REPLAY_MS);
  renderReplayBtn();
}
export function stopReplay(): void {
  if (replayTimer) {
    clearInterval(replayTimer);
    replayTimer = null;
  }
  if ($opt('#btnReplay')) renderReplayBtn();
}
export const replaying = (): boolean => !!replayTimer;
export function renderReplayBtn(): void {
  const b = $('#btnReplay');
  b.hidden = !canReplay();
  b.setAttribute('aria-pressed', String(!!replayTimer));
  (b.querySelector('.ic') as HTMLElement).innerHTML = replayTimer ? '&#10074;&#10074;' : '&#9654;';
  (b.querySelector('.tx') as HTMLElement).textContent = replayTimer ? 'Pausar' : 'Reproduzir';
  b.title = replayTimer ? 'Pausar a reprodução' : 'Reproduzir a partida lance a lance (1,5 s por lance)';
}
export function goTo(i: number, fromReplay?: boolean): void {
  if (!fromReplay) {
    stopReplay();
    if (S.demoQueue) S.demoQueue = [];
  }
  const n = S.positions.length - 1;
  i = Math.max(0, Math.min(n, i));
  S.view = i === n ? null : i;
  S.selected = null;
  S.targets = [];
  renderAll();
}
