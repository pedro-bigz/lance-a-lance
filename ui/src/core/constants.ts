// Constantes do jogo: valores das peças, classificações dos lances, bots e profundidades de análise
import { Chess, type PieceType, type ShortMove } from 'chess.js';
import { BOT_ELO } from '../../../shared/rating.mjs';

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
  /** símbolo do selo; no livro o selo é o ícone do livro (ClsBadge em board/badge.tsx) */
  sym: string;
  desc: string;
}
export const CLS: Record<ClsKey, ClsInfo> = {
  livro: { label: 'Livro', sym: '', desc: 'Teoria de abertura' },
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
  name: string;
}
/* O Elo nominal de cada nível vem de BOT_ELO (shared/rating.mjs), a mesma tabela que a API usa no cálculo dos pontos.
   Como cada nível pede o lance (skill, profundidade, tempo, aleatoriedade ou UCI_Elo) depende da versão do Stockfish:
   fica no adaptador (engine/adapters/, botLevels), não aqui. */
export const BOTS: Bot[] = (
  [
    { id: 'novato', level: 'Novato', elo: BOT_ELO.novato, desc: 'acabou de aprender' },
    { id: 'iniciante', level: 'Iniciante', elo: BOT_ELO.iniciante, desc: 'erra lances simples' },
    { id: 'intermediario', level: 'Intermediário', elo: BOT_ELO.intermediario, desc: 'joga de clube' },
    { id: 'avancado', level: 'Avançado', elo: BOT_ELO.avancado, desc: 'tático e sólido' },
    { id: 'mestre', level: 'Mestre', elo: BOT_ELO.mestre, desc: 'raramente erra' },
    { id: 'gm', level: 'Grão-mestre', elo: BOT_ELO.gm, desc: 'Stockfish no máximo' },
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
