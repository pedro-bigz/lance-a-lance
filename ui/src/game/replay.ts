/* ---------- Reprodução e navegação pelos lances ----------
   Reprodução da partida terminada, um lance a cada 1,5 s, e goTo (setas, lista de lances, gráfico). O botão
   Reproduzir/Pausar é desenhado em panels.tsx a partir de replaying(). */
import { S, viewIdx } from '../core/state';
import type { Ply } from '../core/types';
import { fadeCaptured, reducedMotion, slideDuration, slidePiece } from '../board/animations';
import { rippleFx } from '../board/capture-fx';
import { STYLE } from '../board/pieces';
import { moveSound } from '../board/sound';
import { publish } from '../store/view-store';
import { playDemo } from '../tutor/training';

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
  publish('board');
}
export function stopReplay(): void {
  if (replayTimer) {
    clearInterval(replayTimer);
    replayTimer = null;
    publish('board');
  }
}
export const replaying = (): boolean => !!replayTimer;
/** antes de redesenhar: a partida mudou e não dá mais para reproduzir → para (sem publicar de novo) */
export function replaySync(): void {
  if (replayTimer && !canReplay()) {
    clearInterval(replayTimer);
    replayTimer = null;
  }
}
export function toggleReplay(): void {
  if (replaying()) stopReplay();
  else startReplay();
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
  publish();
}
