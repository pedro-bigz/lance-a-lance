// Fila de análise da partida: cada posição vai uma vez ao Stockfish (cache por FEN) e, quando a nota chega,
// os lances são reclassificados e a tela redesenhada (publish; no meio de uma animação de lance, logo depois dela).
import { DEPTH } from '../core/constants';
import { classify } from '../core/classify';
import { terminalOf } from '../core/eval';
import { S, blind, isLive } from '../core/state';
import { bookLength } from '../book/index';
import { ding } from '../board/sound';
import { persistCls } from '../store/session';
import { publish } from '../store/view-store';
import { engine, setStatus } from './engine';

export function requestAnalysis(fen: string): void {
  if (S.cache.has(fen) || S.pending.has(fen)) return;
  const t = terminalOf(fen);
  if (t) {
    S.cache.set(fen, { terminal: t, lines: [], best: null });
    return;
  }
  if (S.engineErr) return;
  S.pending.add(fen);
  setStatus();
  const d = DEPTH[S.depth];
  engine.analyse(fen, { depth: d.depth, movetime: d.movetime, multipv: 2, isStale: () => !S.positions.includes(fen) }).then(
    (r) => {
      S.pending.delete(fen);
      if (r) S.cache.set(fen, Object.assign({ terminal: null }, r));
      onAnalysis();
    },
    () => {
      S.pending.delete(fen);
      onAnalysis();
    },
  );
}
function onAnalysis(): void {
  const before = S.cls.map((c) => c && c.key).join();
  classifyAll();
  const changed = before !== S.cls.map((c) => c && c.key).join();
  if (changed) {
    const last = S.cls[S.plies.length - 1];
    if (last && isLive() && S.mode === 'play' && !blind()) ding(last.key);
    persistCls();
  }
  setStatus();
  // não redesenha o tabuleiro no meio de uma animação de lance; redesenha logo depois
  const wait = (S.animUntil || 0) - performance.now();
  if (wait > 0) {
    clearTimeout(S.animRerender);
    S.animRerender = setTimeout(publish, wait + 30);
  } else publish();
}
export function classifyAll(): void {
  S.bookLen = bookLength(S.positions, S.plies.length);
  S.cls.length = S.plies.length;
  for (let i = 0; i < S.plies.length; i++) S.cls[i] = classify(S, i);
}
