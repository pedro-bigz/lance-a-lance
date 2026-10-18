// Análise de uma partida para a pontuação: refaz os lances gravados (games.start_fen + games.moves[].uci) com o
// chess.js, confere a legalidade e o resultado no tabuleiro, e mede com o Stockfish a precisão dos lances DO JOGADOR.
// Nada do que o app mandou sobre avaliação (classificações, notas) é usado: só os lances e a posição inicial.
//
// Para cada lance do jogador (fora do livro): nota da posição antes (A) e depois (B), do ponto de vista de quem joga;
// antes = chance de vitória em A; depois = 100 − chance em B; perda = max(0, antes − depois), 0 se o lance é o melhor
// do motor ou dá mate (a mesma régua da classificação da interface, ui/src/core/classify.ts). Precisão do lance e da
// partida (média harmônica ponderada pelo quanto a partida ainda estava em jogo): shared/rating.mjs.
import chess from 'chess.js';
import { gameAccuracy, moveAccuracy, scoreWinPct, WP_K } from '../../../shared/rating.mjs';
import { bookLength, START_FEN } from './book.mjs';

const { Chess } = chess;

/** cor de quem joga o lance i a partir da posição inicial */
export function plyColor(startFen, i) {
  const first = startFen && startFen.split(' ')[1] === 'b' ? 'b' : 'w';
  return i % 2 === 0 ? first : first === 'w' ? 'b' : 'w';
}
const terminalOf = (c) => (c.in_checkmate() ? 'mate' : c.in_stalemate() || c.insufficient_material() || c.in_draw() ? 'draw' : null);

/**
 * Refaz a partida. {ok: false} se a posição inicial ou algum lance for inválido.
 * @returns {{ok: boolean, positions: string[], terminals: (string|null)[], final: {mate: boolean, draw: boolean, toMove: string}}}
 */
export function replay(startFen, ucis) {
  const fen = startFen || START_FEN;
  const c = new Chess();
  if (startFen && (!c.validate_fen(startFen).valid || !c.load(startFen))) return { ok: false, positions: [], terminals: [] };
  const positions = [c.fen()], terminals = [terminalOf(c)];
  for (const u of ucis) {
    if (terminals[terminals.length - 1]) return { ok: false, positions, terminals };   // lance depois do fim
    const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || undefined });
    if (!m) return { ok: false, positions, terminals };
    positions.push(c.fen());
    terminals.push(terminalOf(c));
  }
  const last = terminals[terminals.length - 1];
  return {
    ok: true, fen, positions, terminals,
    final: { mate: last === 'mate', draw: last === 'draw' || c.in_threefold_repetition(), toMove: c.turn() },
  };
}

/** o resultado gravado bate com o tabuleiro? (vitória só por mate do bot; empate só com a partida empatada no tabuleiro) */
export function confirmOutcome(outcome, color, final) {
  if (outcome === 'vitoria') return final.mate && final.toMove !== color;
  if (outcome === 'empate') return final.draw;
  return true;   // derrota (mate, desistência, encerrar) nunca favorece o jogador
}

const povWp = (terminal, r, k) => (terminal === 'mate' ? 0 : terminal === 'draw' ? 50 : scoreWinPct(r && r.score, k));

/**
 * Mede a precisão do jogador. engine: UciEngine já iniciado (ou um falso nos testes, com analyse()).
 * @param {{startFen: string|null, moves: string[], color: 'w'|'b'}} g
 * @param {{depth?: number, nodes?: number, onPosition?: Function}} search
 */
export async function playerAccuracy(engine, g, search = {}) {
  const r = replay(g.startFen, g.moves);
  if (!r.ok) return { ok: false, playerMoves: g.moves.filter((_, i) => plyColor(g.startFen, i) === g.color).length };
  const k = (engine.calibration && engine.calibration.wpK) || WP_K;
  const book = bookLength(r.positions, g.moves.length);
  if (engine.newGame) await engine.newGame();
  const accs = [];
  let analysed = 0;
  for (let i = 0; i < g.moves.length; i++) {
    if (plyColor(g.startFen, i) !== g.color) continue;
    if (i < book) { accs.push({ acc: 100 }); continue; }
    const A = await engine.analyse(g.startFen, g.moves.slice(0, i), search);
    const tB = r.terminals[i + 1];
    const B = tB ? null : await engine.analyse(g.startFen, g.moves.slice(0, i + 1), search);
    analysed += tB ? 1 : 2;
    const bestWp = povWp(null, A, k);
    const afterWp = 100 - povWp(tB, B, k);
    const isBest = g.moves[i] === A.best || tB === 'mate';
    const loss = isBest ? 0 : Math.max(0, bestWp - afterWp);
    accs.push({ acc: moveAccuracy(loss), before: bestWp, after: afterWp });
    if (search.onPosition) search.onPosition(i);
  }
  return { ok: true, accuracy: gameAccuracy(accs), accuracies: accs.map((m) => m.acc), moves: accs, playerMoves: accs.length, book, analysed, final: r.final };
}
