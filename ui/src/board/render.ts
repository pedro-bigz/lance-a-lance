/* ---------- Tabuleiro: geometria e o que é desenhado ----------
   Funções puras sobre S: casa ↔ posição na tela, quem pode mover, casas marcadas, fim de jogo e setas. O desenho é o
   componente Board (board/board.tsx); os elementos do tabuleiro ficam em REFS para as animações e o arrastar. */
import { Chess, type Color } from 'chess.js';
import { S, blind, botColor, isLive, viewIdx } from '../core/state';
import { REFS } from '../game/ui-state';

export function sqXY(sq: string): [number, number] {
  const f = 'abcdefgh'.indexOf(sq[0] as string),
    r = +(sq[1] as string);
  return S.orient === 'w' ? [f, 8 - r] : [7 - f, r - 1];
}
export function sqAt(x: number, y: number): string | null {
  if (!REFS.squares) return null;
  const b = REFS.squares.getBoundingClientRect();
  const cx = Math.floor(((x - b.left) / b.width) * 8),
    cy = Math.floor(((y - b.top) / b.height) * 8);
  if (!(cx >= 0 && cx <= 7 && cy >= 0 && cy <= 7)) return null;
  return S.orient === 'w' ? 'abcdefgh'[cx] + (8 - cy) : 'abcdefgh'[7 - cx] + (cy + 1);
}
export function canUserMove(): boolean {
  if (!isLive() || S.over || S.botThinking) return false;
  if (S.mode === 'review' && S.fromHistory) return false; // partida concluída do histórico: só revisão
  const bc = botColor();
  return !bc || S.game.turn() !== bc;
}
/** fim de jogo decidido na posição exibida: quem perdeu e como (mate ou desistência) */
export function endState(c: Chess, idx: number): { loser: Color; how: 'mate' | 'resign' } | null {
  if (idx !== S.positions.length - 1) return null;
  if (c.in_checkmate()) return { loser: c.turn(), how: 'mate' };
  const resignedReview = S.mode === 'review' && S.fromHistory && /desistiu/i.test(S.recText || '');
  if ((S.mode === 'play' && S.resigned) || resignedReview) return { loser: S.player, how: 'resign' };
  return null;
}
/** casa do rei em xeque na posição (o chess.js 0.10 não informa a casa em board(): sai da posição na matriz) */
export function checkSquare(c: Chess): string | null {
  let chk: string | null = null;
  if (c.in_check())
    c.board().forEach((row, ri) =>
      row.forEach((p, fi) => {
        if (p && p.type === 'k' && p.color === c.turn()) chk = 'abcdefgh'[fi] + (8 - ri);
      }),
    );
  return chk;
}
export interface Arrow {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  points: string;
  color: string;
}
export function arrowGeom(uci: string, color: string): Arrow {
  const [x1, y1] = sqXY(uci.slice(0, 2)).map((v) => v + 0.5) as [number, number],
    [x2, y2] = sqXY(uci.slice(2, 4)).map((v) => v + 0.5) as [number, number];
  const dx = x2 - x1,
    dy = y2 - y1,
    len = Math.hypot(dx, dy),
    ux = dx / len,
    uy = dy / len;
  const sx = x1 + ux * 0.28,
    sy = y1 + uy * 0.28,
    hx = x2 - ux * 0.42,
    hy = y2 - uy * 0.42;
  const px = -uy * 0.27,
    py = ux * 0.27,
    tx = x2 - ux * 0.12,
    ty = y2 - uy * 0.12;
  return { x1: sx, y1: sy, x2: hx, y2: hy, points: `${tx},${ty} ${hx + px},${hy + py} ${hx - px},${hy - py}`, color };
}
/** setas da posição exibida: melhor lance (depois de um lance que não foi o melhor), dica e o lance do estudo */
export function arrowsOf(): Arrow[] {
  const idx = viewIdx(),
    out: Arrow[] = [];
  // lance destacado pelo explorador do estudo (seta na cor do livro)
  const mk =
    S.studyMark && S.studyMark.to && S.studyMark.fen === S.positions[idx] ? arrowGeom(S.studyMark.from + S.studyMark.to, 'var(--c-livro)') : null;
  if (!blind()) {
    if (idx > 0) {
      const k = S.cls[idx - 1],
        A = S.cache.get(S.positions[idx - 1] as string);
      if (k && A && A.best && !k.isBest && !['brilhante', 'otima', 'melhor'].includes(k.key)) out.push(arrowGeom(A.best, 'var(--c-melhor)'));
    }
    if (S.hintAt === idx) {
      const r = S.cache.get(S.positions[idx] as string);
      if (r && r.best) out.push(arrowGeom(r.best, 'var(--c-otima)'));
    }
  }
  if (mk) out.push(mk);
  return out;
}
