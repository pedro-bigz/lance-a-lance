// Treino e demonstrações no tabuleiro: usados pelo tutor de IA e pelo estudo de aberturas
import { Chess, type Color } from 'chess.js';
import { uciObj, type Bot } from '../core/constants';
import { applyMove, resetBoard, startGame } from '../core/game';
import { recommendBot } from '../core/rating';
import { S, type Demo } from '../core/state';
import type { BookLine } from '../book/index';
import { closeStyle } from '../board/style-picker';
import { requestAnalysis } from '../engine/analysis';
import { botEngine } from '../engine/engine';
import { setDrawer } from '../game/menus';
import { RATING } from '../game/rating';
import { startReplay, stopReplay } from '../game/replay';
import { UI } from '../game/ui-state';
import { newId } from '../store/local';
import { save } from '../store/session';
import { publish } from '../store/view-store';
import { tutorNote } from './tutor';

// começa uma partida em que o bot segue as linhas da abertura escolhida
export function startTraining({
  lines,
  name,
  userColor,
  bot,
  prefer,
}: {
  lines: BookLine[];
  name: string;
  userColor: Color;
  bot: Bot | null;
  prefer?: string[] | null;
}): void {
  setDrawer(null);
  closeStyle(false);
  stopReplay();
  S.pickBot = bot || (S.bot.id === 'none' ? recommendBot(RATING.rating) : S.bot);
  UI.color = userColor; // "Suas peças" da nova partida
  startGame({ lines: lines.map((l) => l.sans), name, done: false, prefer: prefer || null });
}
// demonstração: dois bots jogam a linha da abertura e seguem mais alguns lances pelo motor
export async function buildDemo(line: BookLine, extra: number): Promise<Demo> {
  const c = new Chess(),
    sans: string[] = [];
  for (const m of line.sans) {
    if (!c.move(m)) break;
    sans.push(m);
  }
  for (let k = 0; k < extra && !c.game_over(); k++) {
    let uci: string | null = null;
    try {
      const r = await botEngine.analyse(c.fen(), { depth: 11, movetime: 350, skill: 18, multipv: 1 });
      uci = r && (r.bestmove || r.best);
    } catch (_) {}
    if (!uci) break;
    const m = c.move(uciObj(uci));
    if (!m) break;
    sans.push(m.san);
  }
  return { name: line.name, sans, bookPlies: line.sans.length };
}
export function playDemo(demo: Demo): void {
  stopReplay();
  setDrawer(null);
  S.mode = 'review';
  S.trainer = null;
  S.headers = { White: 'Bot (brancas)', Black: 'Bot (pretas)', Event: 'Demonstração: ' + demo.name };
  resetBoard();
  S.demo = true;
  S.gameId = newId();
  S.fromHistory = false;
  S.recResult = S.recText = null;
  requestAnalysis(S.positions[0] as string);
  for (const m of demo.sans) if (!applyMove(m, { silent: true })) break;
  S.orient = 'w';
  S.view = 0;
  save();
  publish();
  tutorNote(`Demonstração: ${demo.name}. A linha de livro tem ${demo.bookPlies} meios-lances; o resto é o motor jogando dos dois lados.`);
  setTimeout(startReplay, 600);
}
