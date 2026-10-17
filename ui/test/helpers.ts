import { Chess } from 'chess.js';
import type { Analysis, ClassifyInput, Ply, Score } from '../src/core/types';

/** joga lances (SAN) a partir de uma FEN e devolve posições e lances no formato do estado da página */
export function playSans(sans: string[], fen?: string): Pick<ClassifyInput, 'positions' | 'plies'> {
  const c = fen ? new Chess(fen) : new Chess();
  const positions = [c.fen()],
    plies: Ply[] = [];
  for (const s of sans) {
    const m = c.move(s);
    if (!m) throw new Error(`lance ilegal no teste: ${s}`);
    plies.push({
      san: m.san,
      uci: m.from + m.to + (m.promotion || ''),
      from: m.from,
      to: m.to,
      color: m.color,
      piece: m.piece,
      captured: m.captured,
      promotion: m.promotion,
      flags: m.flags,
    });
    positions.push(c.fen());
  }
  return { positions, plies };
}
/** análise do motor com uma ou duas linhas (notas do ponto de vista de quem joga na posição) */
export function analysis(lines: { score: Score; pv: string[] }[], terminal: Analysis['terminal'] = null): Analysis {
  return {
    terminal,
    lines: lines.map((l, i) => ({ multipv: i + 1, depth: 15, score: l.score, pv: l.pv })),
    best: lines[0] ? (lines[0].pv[0] as string) : null,
  };
}
/** centipeões que dão uma perda de chance de vitória de `loss` pontos quando o melhor lance vale 0 */
export function cpForLoss(loss: number): number {
  return -Math.log(2 / (1 + loss / 50) - 1) / 0.00368208;
}
