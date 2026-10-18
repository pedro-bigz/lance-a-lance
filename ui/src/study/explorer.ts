/* Explorador de livro: próximos lances de livro da posição exibida (índice prefixo → lances, montado uma vez em
   bookTree) com a avaliação do Stockfish de cada um, em sequência, com cache por FEN e cancelada quando a posição muda.
   explorerView() calcula o que mostrar; o componente (study-panel.tsx) pede as avaliações num efeito quando a chave
   da posição muda (explorerEvals) e redesenha a cada avaliação que chega. */
import { terminalOf } from '../core/eval';
import { userMove } from '../core/game';
import { S, blind, botColor, isLive, viewIdx } from '../core/state';
import { START_KEY, openingAt, posKey } from '../book/index';
import { bookNext, type NextMove } from '../book/tree';
import { canUserMove } from '../board/render';
import { goTo } from '../game/replay';
import { publish } from '../store/view-store';
import { studyEval } from './eval';
import { STUDY, type StudyEval } from './state';

export interface ExplorerView {
  /** muda quando a posição (ou o que se pode fazer nela) muda: as avaliações são pedidas de novo */
  key: string;
  idx: number;
  fen: string;
  fromStart: boolean;
  hide: boolean;
  play: boolean;
  name: string | null;
  moves: NextMove[];
  term: 'mate' | 'draw' | null;
}
export function explorerView(): ExplorerView {
  const idx = viewIdx(),
    fen = S.positions[idx] as string,
    sans = S.plies.slice(0, idx).map((p) => p.san);
  const fromStart = posKey(S.positions[0] as string) === START_KEY,
    hide = blind();
  const play = S.mode === 'play' && !!botColor();
  const key = [fen, sans.join(' '), fromStart, hide, play, S.mode, isLive()].join('|');
  const moves = fromStart ? bookNext(sans, fen) : [];
  STUDY.expMoves = moves;
  return {
    key,
    idx,
    fen,
    fromStart,
    hide,
    play,
    name: fromStart ? openingAt(S.positions, Math.min(idx, S.bookLen || 0)) : null,
    moves,
    term: moves.length ? null : terminalOf(fen),
  };
}
/** pede as avaliações da posição (em sequência no botEngine; as da posição antiga são puladas quando ela muda) */
export function explorerEvals(v: ExplorerView): void {
  const tok = ++STUDY.expTok,
    stale = () => tok !== STUDY.expTok || S.botThinking;
  STUDY.expRes = new Map();
  const ask = (fen: string) =>
    studyEval(fen, stale).then((e) => {
      if (tok !== STUDY.expTok || !e) return;
      STUDY.expRes.set(fen, e); // também a resposta com erro, que não fica no cache
      publish('board');
    });
  if (v.hide) return;
  if (!v.moves.length) {
    if (!v.term) ask(v.fen);
    return;
  }
  for (const m of v.moves) if (!STUDY.evals.has(m.fen)) ask(m.fen);
}
/** avaliação de uma posição do explorador já recebida (null = ainda não) */
export const expEval = (fen: string): StudyEval | null => STUDY.evals.get(fen) || STUDY.expRes.get(fen) || null;
export function studyExpClick(i: number): void {
  const m = STUDY.expMoves && STUDY.expMoves[i];
  if (!m) return;
  const idx = viewIdx(),
    fen = S.positions[idx],
    next = S.plies[idx];
  if (S.mode === 'review' && next && next.san === m.san) {
    goTo(idx + 1);
    return;
  } // é o lance da partida: só avança
  const canPlay = (S.mode === 'review' || !botColor()) && isLive() && canUserMove() && S.game.fen() === fen;
  if (canPlay) {
    userMove(m.from, m.to, m.promotion);
    return;
  }
  // partida contra o bot (ou prática): só realça, sem jogar pelo usuário
  S.studyMark = { fen: fen as string, from: m.from, to: m.to };
  publish('board');
}
