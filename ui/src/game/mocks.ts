/* Partidas de exemplo para testar histórico, vitória, derrota, empate, desistência e continuação (só no artifact) */
import { Chess, type Color } from 'chess.js';
import { BOTS, SAMPLE_PGN, uciObj, type BotId } from '../core/constants';
import { resultOf } from '../core/result';
import { freshRating } from '../core/rating';
import { API_GAMES } from '../desktop/bridge';
import { GameStore } from '../store/game-store';
import { readGames, writeGames } from '../store/local';
import { saveGame } from '../store/session';
import type { GameMode, GameRecord } from '../store/types';
import { publish } from '../store/view-store';
import { openRecord, renderHistCount, renderHistory } from './history';
import { RATING, RATING_UI, writeRating } from './rating';
import { UI } from './ui-state';

interface MockDef {
  id: string;
  ago: number;
  bot?: BotId;
  player?: Color;
  gameMode?: GameMode;
  moves?: string;
  resigned?: boolean;
  ended?: boolean;
  pgn?: string;
}
const MOCKS: MockDef[] = [
  { id: 'mock-vitoria', bot: 'novato', player: 'w', gameMode: 'assistido', ago: 3 * 3600e3, moves: 'e2e4 e7e5 f1c4 b8c6 d1h5 g8f6 h5f7' },
  { id: 'mock-derrota', bot: 'gm', player: 'w', gameMode: 'normal', ago: 26 * 3600e3, moves: 'f2f3 e7e5 g2g4 d8h4' },
  {
    id: 'mock-desistencia',
    bot: 'mestre',
    player: 'b',
    gameMode: 'normal',
    ago: 2 * 86400e3,
    resigned: true,
    moves: 'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6 c1g5 e7e6 f2f4 b8d7 d1f3 h7h6 g5h4 d8c7 e1c1 b7b5 e4e5 c8b7 f3g3',
  },
  {
    id: 'mock-empate',
    bot: 'intermediario',
    player: 'w',
    gameMode: 'assistido',
    ago: 3 * 86400e3,
    moves: 'e2e3 a7a5 d1h5 a8a6 h5a5 h7h5 h2h4 a6h6 a5c7 f7f6 c7d7 e8f7 d7b7 d8d3 b7b8 d3h7 b8c8 f7g6 c8e6',
  },
  { id: 'mock-encerrada', bot: 'iniciante', player: 'b', gameMode: 'normal', ago: 5 * 86400e3, ended: true, moves: 'd2d4 g8f6 c2c4 e7e6 g1f3 b7b6' },
  {
    id: 'mock-andamento-assistido',
    bot: 'intermediario',
    player: 'w',
    gameMode: 'assistido',
    ago: 20 * 60e3,
    moves: 'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6',
  },
  { id: 'mock-andamento-normal', bot: 'avancado', player: 'b', gameMode: 'normal', ago: 5 * 3600e3, moves: 'd2d4 d7d5 c2c4 e7e6 b1c3' },
  { id: 'mock-importada', pgn: SAMPLE_PGN, ago: 4 * 86400e3 },
];
function buildMock(m: MockDef, now: number): GameRecord {
  if (m.pgn) {
    const c = new Chess();
    c.load_pgn(m.pgn, { sloppy: true });
    const h = c.header();
    return {
      id: m.id,
      mock: true,
      createdAt: now - m.ago,
      updatedAt: now - m.ago,
      mode: 'review',
      gameMode: 'assistido',
      bot: 'none',
      player: 'w',
      orient: 'w',
      start: new Chess().fen(),
      moves: c.history({ verbose: true }).map((x) => x.from + x.to + (x.promotion || '')),
      headers: h,
      ended: false,
      resigned: false,
      status: 'concluida',
      result: 'importada',
      resultText: `Resultado ${h.Result || '?'}`,
    };
  }
  const c = new Chess(),
    moves = (m.moves as string).split(' ');
  for (const u of moves) if (!c.move(uciObj(u))) throw new Error(`Mock ${m.id}: lance ilegal ${u}`);
  const bot = BOTS.find((b) => b.id === m.bot)!;
  const player = m.player as Color;
  const o = resultOf(c, { player, hasBot: true, resigned: !!m.resigned, ended: !!m.ended, botName: bot.name });
  return {
    id: m.id,
    mock: true,
    createdAt: now - m.ago - 1800e3,
    updatedAt: now - m.ago,
    mode: 'play',
    gameMode: m.gameMode as GameMode,
    bot: m.bot as BotId,
    player,
    orient: player,
    start: new Chess().fen(),
    moves,
    headers: {},
    ended: !!m.ended,
    resigned: !!m.resigned,
    status: o.status,
    result: o.result,
    resultText: o.text,
  };
}
export function loadMocks(): GameRecord[] {
  if (GameStore && GameStore.kind === 'api') return []; // no desktop o histórico vem só da API
  if (GameStore) GameStore.flush();
  const now = Date.now(),
    mocks = MOCKS.map((m) => buildMock(m, now)),
    ids = new Set(mocks.map((m) => m.id));
  writeGames([...mocks, ...readGames().filter((g) => !ids.has(g.id))]);
  renderHistCount();
  if (UI.history) renderHistory();
  return mocks;
}
export function clearMocks(): void {
  if (GameStore && GameStore.kind === 'api') return;
  if (GameStore) GameStore.flush();
  writeGames(readGames().filter((g) => !g.mock));
  renderHistCount();
  if (UI.history) renderHistory();
}
export function initMocks(): void {
  // atalho para testes no console: LanceALance.mocks.load(), await LanceALance.games(), LanceALance.store()
  window.LanceALance = {
    rating: {
      get: () => ({ ...RATING }),
      reset: () => {
        if (API_GAMES) return;
        Object.assign(RATING, freshRating());
        RATING_UI.shown = RATING.rating;
        writeRating(RATING);
        publish();
      },
    },
    mocks: { load: loadMocks, clear: clearMocks, list: MOCKS },
    games: () => GameStore!.list(),
    store: () => GameStore,
    save: saveGame,
    open: async (id: string) => {
      const r = await GameStore!.get(id);
      if (r) openRecord(r);
    },
  };
}
