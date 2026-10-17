/* ---------- Avaliação ----------
   Chance de vitória (0 a 100) a partir da nota do Stockfish, precisão do lance e textos da avaliação. */
import { Chess, type Color } from 'chess.js';
import { VAL, stm, uciObj } from './constants';
import type { Analysis, Score } from './types';

export const wpCp = (cp: number): number => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
export const wpScore = (s: Score | null | undefined): number => (!s ? 50 : s.mate != null ? (s.mate > 0 ? 100 : 0) : wpCp(s.cp));
export const povWp = (r: Analysis): number => (r.terminal === 'mate' ? 0 : r.terminal === 'draw' ? 50 : wpScore(r.lines[0] && r.lines[0].score));
export const whiteWp = (r: Analysis, fen: string): number => (stm(fen) === 'w' ? povWp(r) : 100 - povWp(r));
export const accuracy = (loss: number): number => Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));
export function terminalOf(fen: string): 'mate' | 'draw' | null {
  const c = new Chess(fen);
  if (c.in_checkmate()) return 'mate';
  if (c.in_stalemate() || c.insufficient_material() || c.in_draw()) return 'draw';
  return null;
}
export function evalText(r: Analysis | null | undefined, fen: string): string {
  if (!r) return '…';
  if (r.terminal === 'mate') return stm(fen) === 'w' ? '0-1' : '1-0';
  if (r.terminal === 'draw') return '½-½';
  const s = r.lines[0] && r.lines[0].score;
  if (!s) return '0.0';
  const sign = stm(fen) === 'w' ? 1 : -1;
  if (s.mate != null) {
    const m = s.mate * sign;
    return (m > 0 ? '+M' : '−M') + Math.abs(m);
  }
  const v = (s.cp * sign) / 100;
  return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1);
}
export function balance(c: Chess, color: Color): number {
  let s = 0;
  for (const row of c.board()) for (const p of row) if (p) s += (p.color === color ? 1 : -1) * VAL[p.type];
  return s;
}
export function uciToSan(fen: string, uci: string | null | undefined): string {
  if (!uci) return '—';
  const c = new Chess(fen);
  const m = c.move(uciObj(uci));
  return m ? m.san : uci;
}
export function pvSan(fen: string, pv: string[] | null | undefined, n: number): string {
  const c = new Chess(fen);
  const out: string[] = [];
  for (const u of (pv || []).slice(0, n)) {
    const white = c.turn() === 'w';
    const num = c.fen().split(' ')[5];
    const m = c.move(uciObj(u));
    if (!m) break;
    out.push(white ? `${num}. ${m.san}` : out.length ? m.san : `${num}… ${m.san}`);
  }
  return out.join(' ');
}
