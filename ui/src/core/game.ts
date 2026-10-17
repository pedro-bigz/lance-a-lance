/* ---------- Partida ----------
   Funções que mudam a partida aberta no tabuleiro (S): começar, jogar um lance, voltar, carregar PGN. */
import { Chess, type ShortMove } from 'chess.js';
import { API_GAMES } from '../desktop/bridge';
import { bookLength } from '../book/index';
import { moveFx } from '../board/animations';
import { moveSound } from '../board/sound';
import { requestAnalysis } from '../engine/analysis';
import { maybeBot } from '../engine/bot';
import { setDrawer } from '../game/menus';
import { renderAll } from '../game/panel';
import { stopReplay } from '../game/replay';
import { newId } from '../store/local';
import { afterChange, save, saveGame } from '../store/session';
import { studyOnUserMove } from '../study/practice';
import { $ } from '../ui/dom';
import { BOOK_CLS } from './classify';
import { resultOf } from './result';
import { S, botColor, type Trainer } from './state';

export function resetBoard(fen?: string): void {
  stopReplay();
  S.botToken++;
  S.botThinking = false;
  S.game = fen ? new Chess(fen) : new Chess();
  S.positions = [S.game.fen()];
  S.plies = [];
  S.cls = [];
  S.view = null;
  S.hintAt = -1;
  S.selected = null;
  S.targets = [];
  S.over = null;
  S.ended = false;
  S.resigned = false;
  S.demo = false;
}
export function startGame(trainer?: Trainer | null): void {
  S.mode = 'play';
  S.headers = {};
  S.trainer = trainer || null;
  S.demoQueue = [];
  const c = $('#colorSeg [aria-pressed="true"]').dataset.v;
  S.player = c === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : c === 'b' ? 'b' : 'w';
  S.bot = S.pickBot;
  S.orient = S.player;
  resetBoard();
  S.gameId = newId();
  S.createdAt = Date.now();
  S.fromHistory = false;
  S.recResult = S.recText = null;
  S.rated = !S.trainer && S.gameMode === 'normal' && S.bot.id !== 'none'; // treino com o tutor não vale rating
  requestAnalysis(S.positions[0] as string);
  save();
  renderAll();
  maybeBot();
}
export function applyMove(mv: string | ShortMove, { silent, soundDelay }: { silent?: boolean; soundDelay?: number } = {}) {
  const m = S.game.move(mv);
  if (!m) return null;
  S.plies.push({
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
  S.positions.push(S.game.fen());
  S.cls.length = S.plies.length;
  // lance de livro já sai classificado, sem esperar o Stockfish
  S.bookLen = bookLength(S.positions, S.plies.length);
  if (S.plies.length - 1 < S.bookLen) S.cls[S.plies.length - 1] = BOOK_CLS;
  if (!silent) {
    S.view = null;
    S.selected = null;
    S.targets = [];
    S.hintAt = -1;
    const kind = S.game.in_checkmate() ? 'mate' : m.san.includes('+') ? 'check' : 'move';
    setTimeout(() => moveSound(kind, !!m.captured), soundDelay || 0);
  }
  requestAnalysis(S.game.fen());
  checkOver();
  return m;
}
export function checkOver(): void {
  const o = resultOf(S.game, { player: S.player, hasBot: !!botColor(), resigned: S.resigned, ended: S.ended, botName: S.bot.name });
  S.over = o.status === 'concluida' ? o.text : null;
}
export function userMove(from: string, to: string, promotion?: string): void {
  if (!applyMove({ from, to, promotion })) return;
  studyOnUserMove(); // estudo de aberturas: confere o lance com as variantes antes de o bot responder
  afterChange();
  renderAll();
  maybeBot();
  moveFx(S.plies[S.plies.length - 1], { slide: false });
}
export function undo(): void {
  if (!S.plies.length) return;
  // no desktop a partida concluída já foi gravada na API como final: voltar lance continua numa partida nova
  if (API_GAMES && S.over && S.mode === 'play' && S.gameId) {
    S.gameId = newId();
    S.createdAt = Date.now();
    S.rated = false;
  }
  S.botToken++;
  S.botThinking = false;
  const pop = () => {
    S.game.undo();
    S.plies.pop();
    S.positions.pop();
    S.cls.length = S.plies.length;
  };
  pop();
  if (botColor() && S.game.turn() !== S.player && S.plies.length) pop();
  S.view = null;
  S.hintAt = -1;
  S.selected = null;
  S.targets = [];
  checkOver();
  afterChange();
  renderAll();
  maybeBot();
}
export function loadPgn(text: string): void {
  const err = $('#pgnErr');
  err.hidden = true;
  const c = new Chess();
  if (!text.trim() || !c.load_pgn(text, { sloppy: true })) {
    err.textContent = 'Não consegui ler esse PGN. Confira se os lances estão em notação padrão (ex.: 1. e4 e5 2. Nf3).';
    err.hidden = false;
    return;
  }
  const h = c.header();
  const hist = c.history({ verbose: true });
  S.mode = 'review';
  S.headers = h;
  S.gameId = newId();
  S.fromHistory = false;
  S.recResult = S.recText = null;
  resetBoard(h.SetUp === '1' && h.FEN ? h.FEN : undefined);
  requestAnalysis(S.positions[0] as string);
  for (const m of hist) applyMove({ from: m.from, to: m.to, promotion: m.promotion }, { silent: true });
  S.orient = 'w';
  S.view = 0;
  S.createdAt = Date.now();
  setDrawer(null);
  save();
  saveGame();
  renderAll();
}
