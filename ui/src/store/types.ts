// Registro de partida do histórico (formato comum ao localStorage e à API; veja store/game-store.ts)
import type { Color } from 'chess.js';
import type { BotId, ClsKey } from '../core/constants';
import type { GameStatus, LocalResult } from '../core/result';

export type GameMode = 'normal' | 'assistido';
export type BoardMode = 'play' | 'review';

export interface GameRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
  mode: BoardMode;
  gameMode: GameMode;
  /** id do bot (BotId) ou 'none'; vindo da API pode ser qualquer bot_level */
  bot: BotId | string;
  player: Color;
  orient: Color;
  /** FEN inicial */
  start: string;
  /** lances em UCI; null nos itens resumidos da listagem da API */
  moves: string[] | null;
  cls?: (ClsKey | null)[] | null;
  headers: Record<string, string>;
  ended: boolean;
  resigned: boolean;
  status: GameStatus;
  result: LocalResult | null;
  resultText: string;
  /** vale pontuação (os exemplos do histórico não têm o campo) */
  rated?: boolean;
  ratingDelta?: number | null;
  plyCount?: number;
  opening?: string | null;
  mock?: boolean;
  /** ainda não chegou à API (fila deste computador) */
  pending?: boolean;
  serverId?: string;
  // só na gravação (saveGame → API)
  sans?: string[];
  apiResult?: string | null;
  apiReason?: string | null;
  pgn?: string | null;
}
/** Gravação só das classificações de uma partida já concluída (revisão aberta do histórico). */
export interface ClsOnlyRecord {
  id: string;
  clsOnly: true;
  moves: string[];
  cls: (ClsKey | null)[];
}
export type SaveRecord = (GameRecord & { clsOnly?: undefined }) | ClsOnlyRecord;
