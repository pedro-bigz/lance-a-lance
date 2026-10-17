// Resultado de uma partida (puro): status (andamento/concluida), result e o texto mostrado
import type { Chess, Color } from 'chess.js';

export type LocalResult = 'vitoria' | 'derrota' | 'empate' | 'encerrada' | 'importada' | 'livre';
export type GameStatus = 'andamento' | 'concluida';
export interface Outcome {
  status: GameStatus;
  result: LocalResult | null;
  text: string;
}
export interface ResultOpts {
  player: Color;
  hasBot: boolean;
  resigned: boolean;
  ended: boolean;
  botName: string;
}
// resultado de uma partida: status (andamento/concluida), result (vitoria/derrota/empate/encerrada/livre) e texto
export function resultOf(g: Chess, { player, hasBot, resigned, ended, botName }: ResultOpts): Outcome {
  if (resigned) return { status: 'concluida', result: hasBot ? 'derrota' : 'livre', text: `Você desistiu. ${botName} vence` };
  if (g.in_checkmate()) {
    const winner = g.turn() === 'w' ? 'b' : 'w';
    const text = (winner === 'w' ? 'Brancas vencem' : 'Pretas vencem') + ' por xeque-mate';
    return { status: 'concluida', result: !hasBot ? 'livre' : winner === player ? 'vitoria' : 'derrota', text };
  }
  if (g.game_over()) {
    const text = g.in_stalemate()
      ? 'Empate por afogamento'
      : g.in_threefold_repetition()
        ? 'Empate por repetição'
        : g.insufficient_material()
          ? 'Empate por material insuficiente'
          : 'Empate pela regra dos 50 lances';
    return { status: 'concluida', result: 'empate', text };
  }
  if (ended) return { status: 'concluida', result: 'encerrada', text: 'Partida encerrada pelo jogador' };
  return { status: 'andamento', result: null, text: 'Em andamento' };
}
