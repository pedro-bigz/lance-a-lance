// Constantes do jogo: valores das peças, classificações dos lances, bots e profundidades de análise
import { Chess, type PieceType, type ShortMove } from 'chess.js';
import { ICON_BOOK } from '../ui/icons';

export const VAL: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
export const PIECE: Record<PieceType, [string, string]> = {
  p: ['o', 'peão'],
  n: ['o', 'cavalo'],
  b: ['o', 'bispo'],
  r: ['a', 'torre'],
  q: ['a', 'dama'],
  k: ['o', 'rei'],
};

export type ClsKey = 'livro' | 'brilhante' | 'otima' | 'melhor' | 'excelente' | 'boa' | 'imprecisao' | 'erro' | 'chance' | 'capivarada';
export interface ClsInfo {
  label: string;
  sym: string;
  desc: string;
}
export const CLS: Record<ClsKey, ClsInfo> = {
  livro: { label: 'Livro', sym: ICON_BOOK, desc: 'Teoria de abertura' },
  brilhante: { label: 'Brilhante', sym: '!!', desc: 'Sacrifício correto' },
  otima: { label: 'Ótima', sym: '!', desc: 'Único lance bom' },
  melhor: { label: 'Melhor', sym: '★', desc: 'Lance do motor' },
  excelente: { label: 'Excelente', sym: '✓✓', desc: 'Perda < 2%' },
  boa: { label: 'Boa', sym: '✓', desc: 'Perda de 2 a 5%' },
  imprecisao: { label: 'Imprecisão', sym: '?!', desc: 'Perda de 5 a 10%' },
  erro: { label: 'Erro', sym: '?', desc: 'Perda de 10 a 20%' },
  chance: { label: 'Chance perdida', sym: '✕', desc: 'Não puniu o erro rival' },
  capivarada: { label: 'Capivarada', sym: '??', desc: 'Perda ≥ 20%' },
};
export const CLS_KEYS = Object.keys(CLS) as ClsKey[];
export const BAD: ClsKey[] = ['imprecisao', 'erro', 'chance', 'capivarada'];

export type BotId = 'novato' | 'iniciante' | 'intermediario' | 'avancado' | 'mestre' | 'gm' | 'none';
export interface Bot {
  id: BotId;
  level: string;
  /** Elo aproximado; null em "Sem bot". */
  elo: number | null;
  desc: string;
  skill?: number;
  depth?: number;
  movetime?: number;
  /** chance de um lance aleatório (os níveis baixos erram de propósito) */
  random?: number;
  name: string;
}
export const BOTS: Bot[] = (
  [
    { id: 'novato', level: 'Novato', elo: 400, desc: 'acabou de aprender', skill: 0, depth: 1, movetime: 150, random: 0.55 },
    { id: 'iniciante', level: 'Iniciante', elo: 800, desc: 'erra lances simples', skill: 0, depth: 2, movetime: 250, random: 0.22 },
    { id: 'intermediario', level: 'Intermediário', elo: 1200, desc: 'joga de clube', skill: 4, depth: 5, movetime: 500, random: 0.06 },
    { id: 'avancado', level: 'Avançado', elo: 1600, desc: 'tático e sólido', skill: 9, depth: 8, movetime: 800, random: 0 },
    { id: 'mestre', level: 'Mestre', elo: 2200, desc: 'raramente erra', skill: 16, depth: 13, movetime: 1400, random: 0 },
    { id: 'gm', level: 'Grão-mestre', elo: 2700, desc: 'Stockfish no máximo', skill: 20, depth: 18, movetime: 2000, random: 0 },
    { id: 'none', level: 'Sem bot', elo: null, desc: 'você joga dos dois lados' },
  ] as Omit<Bot, 'name'>[]
).map((b) => Object.assign(b, { name: b.id === 'none' ? 'Sem bot' : 'Bot ' + b.level }));
/** bot que nunca falta (o Intermediário); usado como padrão */
export const DEFAULT_BOT = BOTS[2] as Bot;

export type DepthKey = 'fast' | 'normal' | 'deep';
export const DEPTH: Record<DepthKey, { depth: number; movetime: number }> = {
  fast: { depth: 12, movetime: 800 },
  normal: { depth: 15, movetime: 1500 },
  deep: { depth: 18, movetime: 3000 },
};
export const SAMPLE_PGN = `[Event "Paris"]
[Site "Ópera de Paris"]
[Date "1858.??.??"]
[White "Paul Morphy"]
[Black "Duque de Brunswick e Conde Isouard"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7
8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7
14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`;

export const START_FEN = new Chess().fen();
export const uciObj = (u: string): ShortMove => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || undefined });
/** lado que joga numa FEN ('w' ou 'b') */
export const stm = (fen: string): string => fen.split(' ')[1] as string;
