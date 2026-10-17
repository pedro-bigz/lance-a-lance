/* ---------- Início (view inicio): dados ----------
   Saudação, pontuação e bot recomendado, "Continuar partida" (com miniatura da posição), resumo e últimas partidas.
   Aqui ficam a busca e as regras; o desenho é a ilha React de home-view.tsx. */
import { Chess, type Color, type PieceType } from 'chess.js';
import { START_FEN, uciObj } from '../core/constants';
import { S, botColor } from '../core/state';
import { openingAt } from '../book/index';
import { pieceSpan } from '../board/pieces';
import { openGameById, recTitle } from '../game/history';
import { RATING, RATING_UI, renderRating } from '../game/rating';
import { GameStore, type ListResult } from '../store/game-store';
import type { GameRecord } from '../store/types';
import type { PlayerStats } from '../types/api';
import { fmtNum, pct } from '../ui/format';
import { DESKTOP_STATS } from './bridge';
import { goView } from './views';

export function greeting(d = new Date()): string {
  const h = d.getHours();
  return h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}
export function homeDate(d = new Date()): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  } catch (_) {
    return '';
  }
}
/** casas do tabuleiro pequeno (64, de cima para baixo na orientação pedida), com o HTML da peça (pieceSpan) */
export function miniBoardSquares(fen: string, orient: Color = 'w'): { cls: 'l' | 'd'; piece: string }[] {
  const rows = (fen.split(' ')[0] as string).split('/').map((r) => r.replace(/\d/g, (n) => '.'.repeat(+n)).split(''));
  const out: { cls: 'l' | 'd'; piece: string }[] = [];
  for (let i = 0; i < 8; i++)
    for (let j = 0; j < 8; j++) {
      const r = orient === 'w' ? i : 7 - i,
        c = orient === 'w' ? j : 7 - j,
        ch = (rows[r] as string[])[c] as string;
      out.push({
        cls: (r + c) % 2 ? 'd' : 'l',
        piece: ch === '.' ? '' : pieceSpan(ch.toLowerCase() as PieceType, ch === ch.toUpperCase() ? 'w' : 'b'),
      });
    }
  return out;
}
function recFen(r: GameRecord): string {
  const c = new Chess(r.start || START_FEN);
  for (const u of r.moves || []) if (!c.move(uciObj(u))) break;
  return c.fen();
}
const liveGame = () => S.mode === 'play' && !S.over && !S.demo && !!botColor() && S.plies.length > 0;
export interface Continue {
  current?: boolean;
  id?: string;
  title: string;
  fen: string | null;
  orient: Color;
  plies: number;
  player: Color;
  gameMode: string;
  rated?: boolean;
  opening?: string | null;
  updatedAt: number | null;
}
export interface HomeMain {
  stats: PlayerStats | null;
  statsFailed: boolean;
  recent: ListResult;
  ongoing: ListResult | null;
}
/** pontuação, últimas 5 partidas e (se o tabuleiro não tem partida valendo) as em andamento; atualiza o rating do topo */
export async function loadHomeMain(): Promise<HomeMain> {
  const store = GameStore!;
  const fail: ListResult = { games: [], total: 0, error: 'erro' };
  const [st, recent, ongoing] = await Promise.all([
    DESKTOP_STATS ? DESKTOP_STATS.me().catch(() => null) : null,
    store.list({ limit: 5 }).catch(() => fail),
    liveGame() ? null : store.list({ status: 'andamento', limit: 20 }).catch(() => null),
  ]);
  return { stats: st && st.ok ? st.stats : null, statsFailed: !!st && !st.ok, recent, ongoing };
}
export function applyHomeStats(s: PlayerStats): void {
  RATING.rating = RATING_UI.shown = s.rating;
  RATING.games = s.games_played;
  RATING.wins = s.wins;
  RATING.losses = s.losses;
  RATING.draws = s.draws;
  renderRating();
}
/** "Continuar partida": a do tabuleiro, se estiver valendo; senão a última contra bot em andamento na conta */
export async function findContinue(ongoing: ListResult | null, isCurrent: () => boolean = () => true): Promise<Continue | null | undefined> {
  if (liveGame())
    return {
      current: true,
      title: `Você × ${S.bot.name}`,
      fen: S.game.fen(),
      orient: S.orient,
      plies: S.plies.length,
      player: S.player,
      gameMode: S.gameMode,
      rated: S.rated,
      opening: openingAt(S.positions, S.bookLen || 0),
      updatedAt: null,
    };
  const g = ongoing && ongoing.games.find((x) => x.mode === 'play' && x.bot !== 'none');
  const r = g ? await GameStore!.get(g.id).catch(() => null) : null;
  if (!isCurrent()) return undefined;
  if (!g) return null;
  return {
    id: g.id,
    title: recTitle(g),
    fen: r && r.moves ? recFen(r) : null,
    orient: g.orient || g.player,
    plies: g.plyCount != null ? g.plyCount : ((r && r.moves) || []).length,
    player: g.player,
    gameMode: g.gameMode,
    rated: g.rated,
    opening: g.opening,
    updatedAt: g.updatedAt,
  };
}
export function continueMeta(cont: Continue): string {
  const full = Math.ceil(cont.plies / 2);
  return [
    cont.player === 'b' ? 'Pretas' : 'Brancas',
    `${full} lance${full === 1 ? '' : 's'}`,
    cont.gameMode === 'normal' ? 'Modo normal' : 'Modo assistido',
    cont.rated ? 'vale pontuação' : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
export function openContinue(cont: Continue): void {
  if (cont.current || !cont.id) goView('jogo');
  else openGameById(cont.id);
}
/** cartão "Seu resumo": totais, barra de vitórias/empates/derrotas e a nota de baixo */
export function homeSummary(s: PlayerStats | null, failed?: boolean) {
  const n = s ? s.games_played : 0,
    w = s ? s.wins : 0,
    l = s ? s.losses : 0,
    d = s ? s.draws : 0;
  const note = failed
    ? 'Não foi possível carregar o resumo agora.'
    : !s
      ? 'Carregando…'
      : n
        ? `${fmtNum(n)} partida${n === 1 ? '' : 's'} com resultado · ${pct(w, n)}% de vitórias`
        : 'Nenhuma partida com resultado ainda. Vitória, derrota e empate contra bot entram aqui.';
  return {
    wins: s ? fmtNum(w) : '—',
    losses: s ? fmtNum(l) : '—',
    draws: s ? fmtNum(d) : '—',
    bar: n ? { w: pct(w, n), d: pct(d, n), l: pct(l, n) } : null,
    note,
  };
}
