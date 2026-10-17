/* ---------- Classificação dos lances ----------
   A régua é a perda de chance de vitória em relação ao melhor lance do Stockfish (veja a legenda na página).
   Funções puras: recebem a partida (posições, lances, análises em cache) em vez de ler o estado global. */
import { Chess } from 'chess.js';
import { BAD, VAL, uciObj, type ClsKey } from './constants';
import { accuracy, balance, povWp, wpScore } from './eval';
import type { Analysis, ClassifyInput, ClsResult } from './types';

export const BOOK_CLS: ClsResult = { key: 'livro', loss: 0, bestWp: null, afterWp: null, isBest: true, nLegal: 2, acc: 100, book: true };

/* Sacrifício: o lance entrega material (peça pendurada ou perda líquida na linha do motor) */
export function isSacrifice(g: Pick<ClassifyInput, 'positions' | 'plies'>, i: number, B: Analysis): boolean {
  const ply = g.plies[i]!,
    me = ply.color;
  const before = balance(new Chess(g.positions[i]), me);
  const cb = new Chess(g.positions[i + 1]);
  const v = VAL[ply.promotion || ply.piece],
    gained = ply.captured ? VAL[ply.captured] : 0;
  if (v >= 3 && v - gained >= 2) {
    for (const m of cb.moves({ verbose: true })) {
      if (m.to !== ply.to || !m.captured) continue;
      if (VAL[m.piece] < v) return true;
      const c2 = new Chess(g.positions[i + 1]);
      c2.move(m);
      if (!c2.moves({ verbose: true }).some((x) => x.to === ply.to)) return true;
    }
  }
  const pv = ((B.lines[0] && B.lines[0].pv) || []).slice(0, 4);
  if (pv.length < 2) return false;
  const sim = new Chess(g.positions[i + 1]);
  for (const u of pv) if (!sim.move(uciObj(u))) return false;
  return before - balance(sim, me) >= 2;
}

/** Classifica o lance i (null enquanto faltar a análise de alguma das duas posições). */
export function classify(g: ClassifyInput, i: number): ClsResult | null {
  if (i < g.bookLen) return BOOK_CLS;
  const fa = g.positions[i]!,
    fb = g.positions[i + 1]!;
  const A = g.cache.get(fa),
    B = g.cache.get(fb);
  if (!A || !B) return null;
  const ply = g.plies[i]!;
  const bestWp = povWp(A);
  // se o lance jogado é a 2ª linha do motor, usa a nota da mesma busca (menos ruído entre profundidades)
  const asSecond = A.lines[1] && A.lines[1].pv[0] === ply.uci && !B.terminal;
  const afterWp = asSecond ? wpScore(A.lines[1]!.score) : 100 - povWp(B);
  const bestUci = A.best || (A.lines[0] && A.lines[0].pv[0]);
  const isBest = ply.uci === bestUci || B.terminal === 'mate';
  const loss = isBest ? 0 : Math.max(0, bestWp - afterWp);
  const nLegal = new Chess(fa).moves().length;
  const secondWp = A.lines[1] ? wpScore(A.lines[1].score) : null;
  const prev = i > 0 && g.cls[i - 1] ? g.cls[i - 1]!.key : null;
  const prevBad = prev === 'erro' || prev === 'capivarada' || prev === 'chance';
  // (undefined > 0 é false, como na versão em página única)
  const bestIsMate = !!A.lines[0] && (A.lines[0].score.mate ?? 0) > 0;
  let key: ClsKey;
  if (nLegal === 1) key = 'melhor';
  else if (loss < 2 && afterWp >= 50 && (bestWp < 98 || bestIsMate) && isSacrifice(g, i, B)) key = 'brilhante';
  else if (B.terminal === 'mate') key = 'melhor';
  else if (isBest && secondWp != null && ((bestWp - secondWp >= 15 && secondWp < 85) || (prevBad && bestWp - secondWp >= 8))) key = 'otima';
  else if (isBest) key = 'melhor';
  else if (loss < 2) key = 'excelente';
  else if (loss < 5) key = 'boa';
  else if (loss < 10) key = 'imprecisao';
  else if (loss < 20) key = 'erro';
  else key = 'capivarada';
  if (BAD.includes(key) && loss >= 7 && bestWp >= 70 && afterWp >= 35 && (prevBad || bestIsMate)) key = 'chance';
  return { key, loss, bestWp, afterWp, isBest, nLegal, acc: accuracy(loss) };
}
