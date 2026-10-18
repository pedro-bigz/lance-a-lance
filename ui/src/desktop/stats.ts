/* ---------- Estatísticas (view estatisticas, só no app desktop): dados e gráfico ----------
   Cartões com os totais, a tabela de lances por classificação (só os lances do próprio jogador) e o gráfico da
   pontuação em SVG próprio (sem bibliotecas: o app funciona offline). Os dados vêm de /v1/stats/me e
   /v1/stats/me/rating-history. Aqui ficam as contas (puras); o desenho é o componente de stats-view.tsx. */
import { CLS, CLS_KEYS, type ClsKey } from '../core/constants';
import type { PlayerStats, RatingHistoryData } from '../types/api';
import { fmtDelta, fmtNum, pct } from '../ui/format';

export type StatsRange = '7' | '30' | '90' | '365' | 'all';
export const STATS_RANGES: [StatsRange, string][] = [
  ['7', '7 dias'],
  ['30', '30 dias'],
  ['90', '90 dias'],
  ['365', '1 ano'],
  ['all', 'Tudo'],
];
// classificação do app → chave em stats.moves de /v1/stats/me (as colunas de player_stats, em inglês)
const CLS_STAT_KEY: Record<ClsKey, string> = {
  livro: 'book_moves',
  brilhante: 'brilliant_moves',
  otima: 'great_moves',
  melhor: 'best_moves',
  excelente: 'excellent_moves',
  boa: 'good_moves',
  imprecisao: 'inaccuracies',
  erro: 'mistakes',
  chance: 'missed_wins',
  capivarada: 'blunders',
};

export interface StatCard {
  lab: string;
  val: string;
  sub: string;
  cls: string;
  st: string;
}
/** cartões do topo; sem dados, os cinco em esqueleto ("carregando…") */
export function statCards(s: PlayerStats | null): StatCard[] {
  const card = (lab: string, val: string, sub: string, cls = '', st = ''): StatCard => ({ lab, val, sub, cls, st });
  if (!s) return ['Pontuação', 'Partidas', 'Vitórias', 'Derrotas', 'Empates', 'Precisão'].map((l) => card(l, '000', 'carregando…', 'skel'));
  const n = s.games_played;
  const acc = s.accuracy;
  return [
    card('Pontuação', fmtNum(s.rating), 'atual · começa em 400', 'hero'),
    card('Partidas', fmtNum(n), n === 1 ? 'concluída com resultado' : 'concluídas com resultado'),
    card('Vitórias', fmtNum(s.wins), `${pct(s.wins, n)}% das partidas`, '', 'st-vitoria'),
    card('Derrotas', fmtNum(s.losses), `${pct(s.losses, n)}% das partidas`, '', 'st-derrota'),
    card('Empates', fmtNum(s.draws), `${pct(s.draws, n)}% das partidas`, '', 'st-empate'),
    // precisão média pelo Stockfish nas partidas que valeram pontos (a partir da pontuação pelo Stockfish)
    acc && acc.games && acc.avg != null
      ? card('Precisão', `${Math.round(acc.avg)}%`, `média em ${fmtNum(acc.games)} partida${acc.games === 1 ? '' : 's'} valendo pontos`)
      : card('Precisão', '—', 'nas partidas valendo pontos'),
  ];
}
export interface ClsRow {
  k: ClsKey;
  label: string;
  desc: string;
  total: number;
  avg: number;
  /** largura da barra em % (texto com 1 casa, como no CSS de antes) */
  width: string;
}
export function clsRows(s: PlayerStats): ClsRow[] {
  const rows = CLS_KEYS.map((k) => ({ k, v: (s.moves || {})[CLS_STAT_KEY[k]] || { total: 0, avg: 0 } }));
  const max = Math.max(1, ...rows.map((r) => r.v.total));
  return rows.map(({ k, v }) => ({
    k,
    label: CLS[k].label,
    desc: CLS[k].desc,
    total: v.total,
    avg: v.avg,
    width: ((v.total / max) * 100).toFixed(1),
  }));
}
export function clsNote(s: PlayerStats): string {
  const g = s.games_classified;
  return g
    ? `${fmtNum(s.total_moves)} lances seus em ${g} partida${g === 1 ? '' : 's'} avaliada${g === 1 ? '' : 's'} · média = lances ÷ partidas`
    : 'Nenhum lance avaliado ainda';
}

export type ChartHist = RatingHistoryData & { fromMs: number | null; group: string; days: number | null };
// período do gráfico: 7 e 30 dias mostram cada partida; 90 dias e tudo, um ponto por dia; 1 ano, um por semana
export function rangeQuery(range: StatsRange, now = Date.now(), tzOffsetMin = new Date().getTimezoneOffset()) {
  const days = range === 'all' ? null : Number(range);
  const from = days ? new Date(now - days * 86400e3) : null;
  const group = days == null ? 'day' : days >= 365 ? 'week' : days >= 90 ? 'day' : null;
  const params: { tz: number; from?: string; group?: string } = { tz: -tzOffsetMin };
  if (from) params.from = from.toISOString();
  if (group) params.group = group;
  return { params, fromMs: from ? from.getTime() : null, group: group || 'none', days };
}
function niceStep(span: number): number {
  for (const s of [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]) if (span / s <= 5) return s;
  return 2000;
}
export function chartDate(t: number, group: string, withTime: boolean): string {
  const d = new Date(t);
  try {
    if (group === 'week') return 'Semana de ' + new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(d);
    if (group === 'day') return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).format(d);
    return new Intl.DateTimeFormat(
      'pt-BR',
      withTime ? { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: 'short' },
    ).format(d);
  } catch (_) {
    return d.toLocaleString();
  }
}
const REASON_UI: Record<string, string> = { vitoria: 'Vitória', derrota: 'Derrota', empate: 'Empate', inicial: 'Pontuação inicial' };
export const deltaCls = (d: number): string => (d > 0 ? 'delta-up' : d < 0 ? 'delta-down' : '');

export interface ChartPoint {
  t: number;
  r: number;
  d: number;
  g: number;
  reason: string | null;
  /** precisão do jogador na partida (pontuação pelo Stockfish) */
  acc?: number | null;
  x: number;
  y: number;
}
export interface ChartGeom {
  W: number;
  H: number;
  M: { l: number; r: number; t: number; b: number };
  grid: { y: string }[];
  axis: { x: string; y: string; anchor: 'start' | 'middle' | 'end'; text: string }[];
  line: string;
  area: string;
  /** trecho tracejado do último ponto até agora (null se o último ponto é de agora) */
  tail: string | null;
  pts: ChartPoint[];
  many: boolean;
  label: string;
}
/** subtítulo do gráfico: pontuação agora e variação no período */
export function chartSub(h: ChartHist): { current: string; change: number | null } {
  const games = h.points.filter((p) => p.games > 0);
  return { current: fmtNum(h.current_rating), change: games.length ? h.current_rating - h.start_rating : null };
}
/** texto do estado vazio (sem partida valendo pontuação no período) ou null se há o que desenhar */
export function chartEmptyText(h: ChartHist): string | null {
  if (h.points.some((p) => p.games > 0)) return null;
  const what = h.days ? `nos últimos ${h.days === 365 ? '12 meses' : h.days + ' dias'}` : 'até agora';
  return `Nenhuma partida valendo pontuação ${what}`;
}
/** geometria do gráfico (mesmas contas da versão em página única) para a largura W */
export function chartGeom(h: ChartHist, width: number, now = Date.now()): ChartGeom {
  const games = h.points.filter((p) => p.games > 0);
  const W = Math.max(280, width || 600),
    H = 260,
    M = { l: 46, r: 18, t: 16, b: 30 };
  type P = { t: number; r: number; d?: number; g?: number; reason?: string | null; acc?: number | null; synthetic?: boolean };
  let pts: P[] = h.points.map((p) => ({
    t: Date.parse(p.at),
    r: p.rating,
    d: p.delta,
    g: p.games,
    reason: p.reason || null,
    acc: p.accuracy ?? null,
  }));
  const x0 = h.fromMs != null ? h.fromMs : Math.min((pts[0] as P).t, now - 86400e3);
  pts = pts.map((p) => ({ ...p, t: Math.max(p.t, x0) }));
  const series: P[] = h.fromMs != null && (pts[0] as P).t > x0 ? [{ t: x0, r: h.start_rating, synthetic: true }, ...pts] : pts;
  const vals = series.map((p) => p.r);
  let lo = Math.min(...vals),
    hi = Math.max(...vals);
  if (hi - lo < 20) {
    const c = (hi + lo) / 2;
    lo = c - 10;
    hi = c + 10;
  }
  const step = niceStep(hi - lo);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  if (lo === hi) {
    lo -= step;
    hi += step;
  }
  const X = (t: number) => M.l + ((t - x0) / Math.max(1, now - x0)) * (W - M.l - M.r);
  const Y = (r: number) => M.t + ((hi - r) / (hi - lo)) * (H - M.t - M.b);
  const grid: ChartGeom['grid'] = [],
    axis: ChartGeom['axis'] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) {
    grid.push({ y: Y(v).toFixed(1) });
    axis.push({ x: String(M.l - 8), y: (Y(v) + 4).toFixed(1), anchor: 'end', text: fmtNum(v) });
  }
  const nt = Math.max(2, Math.min(6, Math.floor((W - M.l - M.r) / 110)));
  const shortSpan = now - x0 <= 1.5 * 86400e3;
  for (let i = 0; i <= nt; i++) {
    const t = x0 + ((now - x0) * i) / nt;
    let lab;
    try {
      lab = new Intl.DateTimeFormat(
        'pt-BR',
        shortSpan
          ? { hour: '2-digit', minute: '2-digit' }
          : now - x0 > 400 * 86400e3
            ? { month: 'short', year: '2-digit' }
            : { day: '2-digit', month: 'short' },
      ).format(t);
    } catch (_) {
      lab = '';
    }
    axis.push({ x: X(t).toFixed(1), y: String(H - 8), anchor: i === 0 ? 'start' : i === nt ? 'end' : 'middle', text: lab });
  }
  const line = series.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.r).toFixed(1)}`).join('');
  const last = series[series.length - 1] as P;
  const area = `${line}L${X(last.t).toFixed(1)},${Y(lo).toFixed(1)}L${X((series[0] as P).t).toFixed(1)},${Y(lo).toFixed(1)}Z`;
  const tail = now - last.t > 60e3 ? `M${X(last.t).toFixed(1)},${Y(last.r).toFixed(1)}H${X(now).toFixed(1)}` : null;
  // (a versão em página única somava p.g dos pontos da API, que só têm "games": o rótulo saía "em NaN partida(s)")
  const cpts: ChartPoint[] = pts.map((p) => ({
    t: p.t,
    r: p.r,
    d: p.d as number,
    g: p.g as number,
    reason: p.reason ?? null,
    acc: p.acc ?? null,
    x: X(p.t),
    y: Y(p.r),
  }));
  const label = `Pontuação de ${fmtNum(h.start_rating)} para ${fmtNum(h.current_rating)} no período, em ${games.reduce((s, p) => s + p.games, 0)} partida(s). Use as setas para percorrer os pontos.`;
  return { W, H, M, grid, axis, line, area, tail, pts: cpts, many: pts.length > 40, label };
}
/** ponto mais perto da coordenada x (em unidades do viewBox) */
export function nearestPoint(pts: ChartPoint[], x: number): number {
  let best = 0;
  pts.forEach((p, i) => {
    if (Math.abs(p.x - x) < Math.abs((pts[best] as ChartPoint).x - x)) best = i;
  });
  return best;
}
/** teclado no gráfico: setas, Home e End andam entre os pontos, Esc tira a seleção; undefined = tecla sem efeito */
export function keySel(key: string, sel: number | null, n: number): number | null | undefined {
  const cur = sel == null ? n : sel;
  return key === 'ArrowLeft'
    ? Math.max(0, cur - 1)
    : key === 'ArrowRight'
      ? Math.min(n - 1, sel == null ? n - 1 : cur + 1)
      : key === 'Home'
        ? 0
        : key === 'End'
          ? n - 1
          : key === 'Escape'
            ? null
            : undefined;
}
/** conteúdo da dica de um ponto: data, pontuação e o que aconteceu */
export function tipInfo(p: ChartPoint, group: string) {
  const what:
    | { kind: 'text'; text: string }
    | { kind: 'partida'; reason: string; delta: string; cls: string; acc: string | null }
    | { kind: 'grupo'; delta: string; cls: string; games: number } =
    group === 'none'
      ? p.reason === 'inicial'
        ? { kind: 'text', text: 'Pontuação inicial' }
        : {
            kind: 'partida',
            reason: REASON_UI[p.reason as string] || 'Partida',
            delta: fmtDelta(p.d),
            cls: deltaCls(p.d),
            acc: p.acc != null ? `precisão ${Math.round(p.acc)}%` : null,
          }
      : p.g
        ? { kind: 'grupo', delta: fmtDelta(p.d), cls: deltaCls(p.d), games: p.g }
        : { kind: 'text', text: 'Pontuação inicial' };
  return { date: chartDate(p.t, group, true), rating: fmtNum(p.r), what };
}
