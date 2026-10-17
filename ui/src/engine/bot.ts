// O bot: escolhe o lance (linha do treino, lance aleatório dos níveis baixos ou o Stockfish com o nível do bot)
import { Chess } from 'chess.js';
import { uciObj } from '../core/constants';
import { S, botColor } from '../core/state';
import { applyMove } from '../core/game';
import { afterChange } from '../store/session';
import { moveFx, reducedMotion, slideDuration } from '../board/animations';
import { renderAll, renderPlayers } from '../game/panel';
import { studyHold } from '../study/practice';
import { tutorNote } from '../tutor/tutor';
import { sleep } from '../ui/dom';
import { botEngine } from './engine';

// treino: o bot escolhe o próximo lance entre as linhas da abertura que ainda batem com a partida
function trainerMove(): string | null {
  const t = S.trainer;
  if (!t || t.done || S.mode !== 'play') return null;
  const hist = S.plies.map((p) => p.san);
  const cands = t.lines.filter((l) => l.length > hist.length && hist.every((m, i) => l[i] === m));
  if (!cands.length) {
    t.done = true;
    // o último lance (do usuário) tirou a partida das linhas, ou as linhas simplesmente acabaram?
    const prev = hist.slice(0, -1);
    const offBook = hist.length > 0 && t.lines.some((l) => l.length >= hist.length && prev.every((m, i) => l[i] === m));
    tutorNote(
      offBook
        ? `Você saiu das linhas de ${t.name} com ${hist[hist.length - 1]}. Daqui em diante o bot joga normalmente.`
        : `Fim das linhas de ${t.name} que eu preparei. Daqui em diante o bot joga normalmente.`,
    );
    return null;
  }
  // a linha sorteada no começo (estudo) tem preferência enquanto a partida seguir por ela
  const line = t.prefer && cands.includes(t.prefer) ? t.prefer : (cands[Math.floor(Math.random() * cands.length)] as string[]);
  const c = new Chess(S.game.fen()),
    m = c.move(line[hist.length] as string);
  return m ? m.from + m.to + (m.promotion || '') : null;
}
export async function maybeBot(): Promise<void> {
  const bc = botColor();
  if (!bc || S.over || S.game.turn() !== bc || studyHold()) return; // estudo: desvio ou fim das variantes esperam a escolha do usuário
  const token = ++S.botToken;
  S.botThinking = true;
  renderPlayers();
  const fen = S.game.fen(),
    t0 = Date.now(),
    bot = S.bot;
  let uci: string | null;
  const legal = S.game.moves({ verbose: true });
  const tr = trainerMove();
  if (tr) uci = tr;
  // (bot.random é undefined só em "Sem bot", que nunca chega aqui)
  else if (Math.random() < (bot.random ?? 0) || S.engineErr) {
    const caps = legal.filter((m) => m.captured);
    const pool = caps.length && Math.random() < 0.45 ? caps : legal;
    const m = pool[Math.floor(Math.random() * pool.length)]!;
    uci = m.from + m.to + (m.promotion || '');
  } else {
    try {
      const r = await botEngine.analyse(fen, { depth: bot.depth, movetime: bot.movetime, skill: bot.skill, multipv: 1 });
      uci = r && (r.bestmove || r.best);
    } catch (_) {
      const m = legal[0]!;
      uci = m.from + m.to + (m.promotion || '');
    }
  }
  const wait = 450 + Math.random() * 400 - (Date.now() - t0);
  if (wait > 0) await sleep(wait);
  if (token !== S.botToken || S.game.fen() !== fen) return;
  S.botThinking = false;
  const m = uci ? applyMove(uciObj(uci), { soundDelay: reducedMotion() ? 0 : slideDuration(uci.slice(0, 2), uci.slice(2, 4)) }) : null;
  afterChange();
  renderAll();
  if (m) moveFx(S.plies[S.plies.length - 1], { slide: true });
}
