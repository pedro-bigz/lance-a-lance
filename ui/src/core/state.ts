/* ---------- Estado da partida no tabuleiro ----------
   S é o estado único do tabuleiro (a partida aberta, a análise e a interação). Quem muda a partida são as funções
   de core/game.ts; os componentes leem daqui e redesenham a cada publish() (store/view-store.ts). */
import { Chess, type Color } from 'chess.js';
import { BOTS, DEFAULT_BOT, type Bot, type DepthKey } from './constants';
import type { LocalResult } from './result';
import type { Analysis, ClsResult, Ply } from './types';
import type { BoardMode, GameMode } from '../store/types';
import { studyPractice } from '../study/practice';

/** Treino com o bot seguindo linhas de abertura (tutor e estudo). */
export interface Trainer {
  lines: string[][];
  name: string;
  done: boolean;
  /** linha sorteada no começo (estudo): o bot prefere seguir por ela */
  prefer: string[] | null;
}
/** Demonstração bot × bot preparada pelo tutor ou pelo "Ver a linha" do estudo. */
export interface Demo {
  name: string;
  sans: string[];
  bookPlies: number;
}
/** Casa (e lance) destacados pelo estudo numa posição. */
export interface StudyMark {
  fen: string;
  from: string;
  to?: string;
}

export interface GameState {
  game: Chess;
  /** FEN de cada posição: positions[0] é a inicial, positions[i+1] vem depois de plies[i] */
  positions: string[];
  plies: Ply[];
  cls: (ClsResult | null | undefined)[];
  cache: Map<string, Analysis>;
  pending: Set<string>;
  /** índice da posição exibida; null = a atual */
  view: number | null;
  orient: Color;
  mode: BoardMode;
  gameMode: GameMode;
  ended: boolean;
  bot: Bot;
  pickBot: Bot;
  player: Color;
  depth: DepthKey;
  headers: Record<string, string>;
  botThinking: boolean;
  botToken: number;
  hintAt: number;
  selected: string | null;
  targets: string[];
  engineErr: boolean;
  /** texto do fim de jogo, ou null em andamento */
  over: string | null;
  // histórico: id da partida salva, desistência, revisão aberta do histórico e o resultado gravado nela
  gameId: string | null;
  resigned: boolean;
  fromHistory: boolean;
  recResult: LocalResult | null;
  recText: string | null;
  createdAt: number | null; // quando a partida começou (vai para o histórico)
  demo: boolean; // demonstração do tutor (não é salva no histórico)
  bookLen: number; // lances de livro desde o início da partida
  rated: boolean; // a partida vale rating (começou e continuou no modo normal, contra bot)
  studyMark: StudyMark | null; // estudo: casa (e lance) destacados no tabuleiro numa posição {fen, from, to?}
  trainer?: Trainer | null;
  demoQueue?: Demo[];
  /** até quando há animação de lance rodando (performance.now) */
  animUntil?: number;
  animRerender?: ReturnType<typeof setTimeout>;
}

export const S: GameState = {
  game: new Chess(),
  positions: [],
  plies: [],
  cls: [],
  cache: new Map(),
  pending: new Set(),
  view: null,
  orient: 'w',
  mode: 'play',
  gameMode: 'assistido',
  ended: false,
  bot: DEFAULT_BOT,
  pickBot: DEFAULT_BOT,
  player: 'w',
  depth: 'normal',
  headers: {},
  botThinking: false,
  botToken: 0,
  hintAt: -1,
  selected: null,
  targets: [],
  engineErr: false,
  over: null,
  gameId: null,
  resigned: false,
  fromHistory: false,
  recResult: null,
  recText: null,
  createdAt: null,
  demo: false,
  bookLen: 0,
  rated: false,
  studyMark: null,
};

// modo normal: avaliações escondidas até o fim da partida (na prática do estudo aparecem na hora: o objetivo é aprender)
export const blind = (): boolean => S.mode === 'play' && S.gameMode === 'normal' && !S.over && !studyPractice();
/** a partida já foi montada (bootApp); antes disso a tela do jogo fica vazia, como a marcação de antes do login */
export const gameReady = (): boolean => S.positions.length > 0;
export const viewIdx = (): number => (S.view == null ? S.positions.length - 1 : S.view);
export const isLive = (): boolean => viewIdx() === S.positions.length - 1;
export const botColor = (): Color | null => (S.mode === 'play' && S.bot.id !== 'none' ? (S.player === 'w' ? 'b' : 'w') : null);
export function sideName(color: Color): string {
  if (S.mode === 'review') return S.headers[color === 'w' ? 'White' : 'Black'] || (color === 'w' ? 'Brancas' : 'Pretas');
  if (botColor() === color) return S.bot.name;
  if (botColor()) return 'Você';
  return color === 'w' ? 'Brancas' : 'Pretas';
}
/** bot pelo id gravado (partida salva, histórico); cai no Intermediário */
export const findBot = (id: string | null | undefined): Bot | undefined => BOTS.find((b) => b.id === id);
