// Tipos de shared/rating.mjs (a interface em TypeScript importa o mesmo arquivo que a API).
export declare const WP_K: number;
export declare const RATING_START: number;
export declare const RATING_MIN: number;
export declare const K_FACTOR: number;
export declare const MIN_PLAYER_MOVES: number;
export declare const LIMITS: Readonly<{ win: [number, number]; loss: [number, number]; draw: [number, number] }>;
export type BotLevel = 'novato' | 'iniciante' | 'intermediario' | 'avancado' | 'mestre' | 'gm';
export declare const BOT_ELO: Readonly<Record<BotLevel, number>>;
export declare function winPct(cp: number, k?: number): number;
export declare function scoreWinPct(s: { cp?: number; mate?: number | null } | null | undefined, k?: number): number;
export declare function moveAccuracy(loss: number): number;
export declare const ACC_FLOOR: number;
export declare const MIN_WEIGHT: number;
export interface MoveAccuracy {
  acc: number;
  /** chance de vitória do jogador antes e depois do lance (0–100); sem elas o peso é 1 */
  before?: number | null;
  after?: number | null;
}
export declare function moveWeight(before: number | null | undefined, after: number | null | undefined): number;
export declare function gameAccuracy(moves: readonly (number | MoveAccuracy)[] | null | undefined): number | null;
export declare function expectedScore(playerRating: number, botElo: number): number;
export interface RatingInput {
  score: 1 | 0.5 | 0;
  rating: number;
  botElo: number;
  accuracy: number | null;
  playerMoves?: number;
  early?: boolean;
}
export interface RatingOutcome {
  delta: number;
  before: number;
  after: number;
  expected: number;
  accuracy: number;
  score: number;
  raw: number;
  penalty: boolean;
}
export declare function ratingDelta(p: RatingInput): RatingOutcome;
