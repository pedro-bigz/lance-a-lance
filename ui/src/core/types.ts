// Tipos do estado da partida e da análise do Stockfish
import type { Color, PieceType } from 'chess.js';
import type { ClsKey } from './constants';

/** Nota do motor do ponto de vista de quem joga: mate em N (com sinal) ou centipeões. */
export type Score = { mate: number; cp?: undefined } | { cp: number; mate?: undefined };
export interface EngineLine {
  multipv: number;
  depth: number;
  score: Score;
  /** variante principal em UCI */
  pv: string[];
  /** vitória/empate/derrota em milésimos, quando o motor manda (UCI_ShowWDL) */
  wdl?: [number, number, number];
}
/** Resultado de Engine.analyse. */
export interface EngineResult {
  lines: EngineLine[];
  best: string | null;
  bestmove: string | null;
}
/** Análise guardada no cache por FEN; terminal = fim de jogo na posição (sem busca). */
export interface Analysis {
  terminal: 'mate' | 'draw' | null;
  lines: EngineLine[];
  best: string | null;
  bestmove?: string | null;
}

/** Lance jogado (a parte do Move do chess.js que a página guarda). */
export interface Ply {
  san: string;
  uci: string;
  from: string;
  to: string;
  color: Color;
  piece: PieceType;
  captured?: PieceType;
  promotion?: PieceType;
  flags: string;
}

/** Classificação de um lance. bestWp/afterWp em % de chance de vitória de quem jogou. */
export interface ClsResult {
  key: ClsKey;
  loss: number;
  bestWp: number | null;
  afterWp: number | null;
  isBest: boolean;
  nLegal: number;
  acc: number;
  book?: boolean;
}

/** O que a classificação precisa saber da partida (S cumpre essa forma). */
export interface ClassifyInput {
  positions: string[];
  plies: Ply[];
  cls: (ClsResult | null | undefined)[];
  cache: Map<string, Analysis>;
  bookLen: number;
}
