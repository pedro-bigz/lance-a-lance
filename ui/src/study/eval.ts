/* Avaliação do Stockfish para o estudo: {w: centipeões do ponto de vista das brancas, m: mate em N (com sinal) ou null, best}.
   As avaliações usam o botEngine (o mesmo das demonstrações): o motor da análise da partida fica livre. */
import { stm } from '../core/constants';
import { terminalOf } from '../core/eval';
import type { EngineResult } from '../core/types';
import { botEngine } from '../engine/engine';
import { STUDY, type StudyEval } from './state';

export const STUDY_EVAL = { depth: 12, movetime: 600 };
export const MATE_CP = 100000;

export function studyEvalOf(r: EngineResult, fen: string): StudyEval {
  const s = r.lines[0] && r.lines[0].score,
    sign = stm(fen) === 'w' ? 1 : -1,
    best = r.bestmove || r.best || null;
  if (!s) return { w: 0, m: null, best };
  if (s.mate != null) return { w: sign * (s.mate > 0 ? 1 : -1) * (MATE_CP - Math.abs(s.mate)), m: sign * s.mate, best };
  return { w: sign * s.cp, m: null, best };
}
// avalia uma posição (cache por FEN). isStale cancela pedidos que ainda não começaram: resolve null nesse caso
export function studyEval(fen: string, isStale?: () => boolean): Promise<StudyEval | null> {
  const hit = STUDY.evals.get(fen);
  if (hit) return Promise.resolve(hit);
  const t = terminalOf(fen);
  if (t) {
    const e: StudyEval = t === 'mate' ? { w: stm(fen) === 'w' ? -MATE_CP : MATE_CP, m: 0, best: null } : { w: 0, m: null, best: null };
    STUDY.evals.set(fen, e);
    return Promise.resolve(e);
  }
  let p = STUDY.pending.get(fen);
  if (!p) {
    p = botEngine
      .analyse(fen, { ...STUDY_EVAL, skill: 20, multipv: 1, isStale })
      .then(
        (r): StudyEval | null => {
          if (!r) return null;
          const e = studyEvalOf(r, fen);
          STUDY.evals.set(fen, e);
          if (STUDY.evals.size > 3000) STUDY.evals.delete(STUDY.evals.keys().next().value as string);
          return e;
        },
        () => ({ w: 0, m: null, best: null, err: true }),
      )
      .finally(() => STUDY.pending.delete(fen));
    STUDY.pending.set(fen, p);
  }
  // o pedido de outro chamador pode ter sido cancelado: pede de novo se este ainda quiser
  return p.then((e) => e || (isStale && isStale() ? null : studyEval(fen, isStale)));
}
// avaliação em peões do ponto de vista de uma cor (mate vira +M3 / −M2, mate na posição vira #)
export function fmtEv(e: StudyEval | null | undefined, color = 'w'): string {
  if (!e) return '…';
  if (e.err) return '—';
  const v = color === 'w' ? e.w : -e.w;
  if (e.m != null) return (v > 0 ? '+' : '−') + (e.m === 0 ? '#' : 'M' + Math.abs(e.m));
  const p = v / 100;
  return (p > 0 ? '+' : p < 0 ? '−' : '') + Math.abs(p).toFixed(2);
}
export const moveNo = (fen: string): string => fen.split(' ')[5] + (stm(fen) === 'w' ? '.' : '…');
