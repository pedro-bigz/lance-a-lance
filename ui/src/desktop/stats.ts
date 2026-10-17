/* ---------- Estatísticas (view estatisticas, só no app desktop) ----------
   Cartões com os totais, a tabela de lances por classificação (só os lances do próprio jogador) e o gráfico da
   pontuação em SVG próprio (sem bibliotecas: o app funciona offline). Os dados vêm de /v1/stats/me e
   /v1/stats/me/rating-history; recarrega ao entrar na tela e quando uma partida termina. */
import { CLS, CLS_KEYS, type ClsKey } from '../core/constants';
import { badgeHtml } from '../board/render';
import type { PlayerStats, RatingHistoryData } from '../types/api';
import { $, $opt, target } from '../ui/dom';
import { esc } from '../ui/escape';
import { fmtDelta, fmtNum, pct } from '../ui/format';
import { formMsg } from '../ui/forms';
import { authError } from './account';
import { DESKTOP_STATS } from './bridge';
import { currentView } from './views';

interface ChartPoint {
  t: number;
  r: number;
  d: number;
  g: number;
  reason: string | null;
  x: number;
  y: number;
}
type ChartHist = RatingHistoryData & { fromMs: number | null; group: string; days: number | null };
const STATS = {
  range: '30',
  data: null as PlayerStats | null,
  hist: null as ChartHist | null,
  token: 0,
  chartToken: 0,
  sel: null as number | null,
  pts: null as ChartPoint[] | null,
};
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
export function statsShow(): void {
  loadStats();
}
export async function loadStats(): Promise<void> {
  if (!DESKTOP_STATS) return;
  const t = ++STATS.token,
    msg = $('#statsMsg');
  if (!STATS.data) renderStatCards(null);
  loadRatingChart();
  const r = await DESKTOP_STATS.me().catch(() => null);
  if (t !== STATS.token) return;
  if (!r || !r.ok) {
    formMsg(msg, `Não foi possível carregar as estatísticas. ${authError(r)}`);
    return;
  }
  formMsg(msg, '');
  STATS.data = r.stats;
  renderStatCards(r.stats);
  renderClsTable(r.stats);
}
function renderStatCards(s: PlayerStats | null): void {
  const card = (lab: string, val: string, sub: string, cls = '', st = '') =>
    `<div class="card stat-card ${cls}"><span class="lab${st ? ' ' + st : ''}">${st ? '<i></i>' : ''}${lab}</span><b>${val}</b><small>${sub}</small></div>`;
  if (!s) {
    $('#statCards').innerHTML = ['Pontuação', 'Partidas', 'Vitórias', 'Derrotas', 'Empates']
      .map((l) => card(l, '000', 'carregando…', 'skel'))
      .join('');
    return;
  }
  const n = s.games_played;
  $('#statCards').innerHTML = [
    card('Pontuação', fmtNum(s.rating), 'atual · começa em 400', 'hero'),
    card('Partidas', fmtNum(n), n === 1 ? 'concluída com resultado' : 'concluídas com resultado'),
    card('Vitórias', fmtNum(s.wins), `${pct(s.wins, n)}% das partidas`, '', 'st-vitoria'),
    card('Derrotas', fmtNum(s.losses), `${pct(s.losses, n)}% das partidas`, '', 'st-derrota'),
    card('Empates', fmtNum(s.draws), `${pct(s.draws, n)}% das partidas`, '', 'st-empate'),
  ].join('');
}
function renderClsTable(s: PlayerStats): void {
  const rows = CLS_KEYS.map((k) => ({ k, v: (s.moves || {})[CLS_STAT_KEY[k]] || { total: 0, avg: 0 } }));
  const max = Math.max(1, ...rows.map((r) => r.v.total));
  $('#clsRows').innerHTML = rows
    .map(
      ({ k, v }) => `<tr>
      <td><span class="cls-name">${badgeHtml(k, 'mini')}${esc(CLS[k].label)} <small>${esc(CLS[k].desc)}</small></span></td>
      <td class="num${v.total ? '' : ' z'}">${fmtNum(v.total)}</td>
      <td class="num${v.avg ? '' : ' z'}">${fmtNum(v.avg, 1)}</td>
      <td class="cls-bar" aria-hidden="true"><i style="width:${((v.total / max) * 100).toFixed(1)}%;background:var(--c-${k})${v.total ? '' : ';opacity:.25'}"></i></td>
    </tr>`,
    )
    .join('');
  const g = s.games_classified;
  $('#clsNote').textContent = g
    ? `${fmtNum(s.total_moves)} lances seus em ${g} partida${g === 1 ? '' : 's'} avaliada${g === 1 ? '' : 's'} · média = lances ÷ partidas`
    : 'Nenhum lance avaliado ainda';
}

// período do gráfico: 7 e 30 dias mostram cada partida; 90 dias e tudo, um ponto por dia; 1 ano, um por semana
async function loadRatingChart(): Promise<void> {
  if (!DESKTOP_STATS) return;
  for (const b of $('#statsRange').children) b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.r === STATS.range));
  const t = ++STATS.chartToken,
    days = STATS.range === 'all' ? null : Number(STATS.range);
  const from = days ? new Date(Date.now() - days * 86400e3) : null;
  const group = days == null ? 'day' : days >= 365 ? 'week' : days >= 90 ? 'day' : null;
  const params: { tz: number; from?: string; group?: string } = { tz: -new Date().getTimezoneOffset() };
  if (from) params.from = from.toISOString();
  if (group) params.group = group;
  const r = await DESKTOP_STATS.ratingHistory(params).catch(() => null);
  if (t !== STATS.chartToken) return;
  if (!r || !r.ok) {
    STATS.hist = null;
    $('#rchartSub').textContent = '';
    $('#ratingChart').innerHTML = `<div class="rchart-empty"><div><b>Não foi possível carregar o gráfico</b>${esc(authError(r))}</div></div>`;
    return;
  }
  STATS.hist = { ...r, fromMs: from ? from.getTime() : null, group: group || 'none', days };
  STATS.sel = null;
  drawRatingChart();
}
function niceStep(span: number): number {
  for (const s of [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]) if (span / s <= 5) return s;
  return 2000;
}
function chartDate(t: number, group: string, withTime: boolean): string {
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
function drawRatingChart(): void {
  const h = STATS.hist,
    el = $('#ratingChart');
  if (!h) return;
  const games = h.points.filter((p) => p.games > 0);
  const change = games.length ? h.current_rating - h.start_rating : 0;
  $('#rchartSub').innerHTML =
    `Agora: <b>${fmtNum(h.current_rating)}</b>${games.length ? ` · <span class="${change > 0 ? 'delta-up' : change < 0 ? 'delta-down' : ''}">${fmtDelta(change)}</span> no período` : ''}`;
  if (!games.length) {
    const what = h.days ? `nos últimos ${h.days === 365 ? '12 meses' : h.days + ' dias'}` : 'até agora';
    el.innerHTML = `<div class="rchart-empty"><div><b>Nenhuma partida valendo pontuação ${what}</b>Jogue no modo normal contra um bot: vitória vale +10, derrota −10 e empate mantém a pontuação.<div class="row" style="justify-content:center"><a class="btn primary" href="#/jogo">Jogar uma partida</a></div></div></div>`;
    return;
  }
  const W = Math.max(280, el.clientWidth || 600),
    H = 260,
    M = { l: 46, r: 18, t: 16, b: 30 };
  const now = Date.now();
  type P = { t: number; r: number; d?: number; g?: number; reason?: string | null; synthetic?: boolean };
  let pts: P[] = h.points.map((p) => ({ t: Date.parse(p.at), r: p.rating, d: p.delta, g: p.games, reason: p.reason || null }));
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
  let grid = '',
    axis = '';
  for (let v = lo; v <= hi + 1e-9; v += step) {
    grid += `<line x1="${M.l}" x2="${W - M.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/>`;
    axis += `<text x="${M.l - 8}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${fmtNum(v)}</text>`;
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
    axis += `<text x="${X(t).toFixed(1)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === nt ? 'end' : 'middle'}">${esc(lab)}</text>`;
  }
  const line = series.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.r).toFixed(1)}`).join('');
  const last = series[series.length - 1] as P;
  const area = `${line}L${X(last.t).toFixed(1)},${Y(lo).toFixed(1)}L${X((series[0] as P).t).toFixed(1)},${Y(lo).toFixed(1)}Z`;
  const tail = now - last.t > 60e3 ? `<path class="tail" d="M${X(last.t).toFixed(1)},${Y(last.r).toFixed(1)}H${X(now).toFixed(1)}"/>` : '';
  // (a versão em página única somava p.g dos pontos da API, que só têm "games": o rótulo saía "em NaN partida(s)")
  const many = pts.length > 40;
  const cpts: ChartPoint[] = pts.map((p) => ({ t: p.t, r: p.r, d: p.d as number, g: p.g as number, reason: p.reason ?? null, x: X(p.t), y: Y(p.r) }));
  STATS.pts = cpts;
  const dots = cpts
    .map((p, i) => `<circle class="dot" data-i="${i}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4.5"${many ? ' opacity="0"' : ''}/>`)
    .join('');
  const label = `Pontuação de ${fmtNum(h.start_rating)} para ${fmtNum(h.current_rating)} no período, em ${games.reduce((s, p) => s + p.games, 0)} partida(s). Use as setas para percorrer os pontos.`;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" tabindex="0" aria-label="${esc(label)}">
      <g class="grid">${grid}</g><g class="axis">${axis}</g>
      <path class="area" d="${area}"/><path class="line" d="${line}"/>${tail}
      <line class="guide" id="rcGuide" x1="0" x2="0" y1="${M.t}" y2="${H - M.b}" visibility="hidden"/>
      <g id="rcDots">${dots}</g>
      <rect id="rcHit" x="${M.l}" y="0" width="${W - M.l - M.r}" height="${H}" fill="transparent"/>
    </svg><div class="rchart-tip" id="rcTip" hidden></div>`;
  const svg = el.querySelector('svg') as SVGSVGElement;
  const near = (x: number) => {
    let best = 0;
    cpts.forEach((p, i) => {
      if (Math.abs(p.x - x) < Math.abs((cpts[best] as ChartPoint).x - x)) best = i;
    });
    return best;
  };
  const toLocal = (e: PointerEvent) => {
    const b = svg.getBoundingClientRect();
    return ((e.clientX - b.left) / b.width) * W;
  };
  svg.addEventListener('pointermove', (e) => selectPoint(near(toLocal(e))));
  svg.addEventListener('pointerleave', () => selectPoint(null));
  svg.addEventListener('blur', () => selectPoint(null));
  svg.addEventListener('keydown', (e) => {
    const n = cpts.length,
      cur = STATS.sel == null ? n : STATS.sel;
    const to =
      e.key === 'ArrowLeft'
        ? Math.max(0, cur - 1)
        : e.key === 'ArrowRight'
          ? Math.min(n - 1, STATS.sel == null ? n - 1 : cur + 1)
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? n - 1
              : e.key === 'Escape'
                ? null
                : undefined;
    if (to === undefined) return;
    e.preventDefault();
    selectPoint(to);
  });
  if (STATS.sel != null && STATS.sel < cpts.length) selectPoint(STATS.sel);
}
function selectPoint(i: number | null): void {
  const el = $('#ratingChart'),
    tip = $opt('#rcTip'),
    guide = $opt('#rcGuide');
  if (!tip || !guide) return;
  STATS.sel = i;
  const pts = STATS.pts as ChartPoint[];
  const many = pts.length > 40;
  for (const d of el.querySelectorAll<SVGElement>('.dot')) {
    const on = +(d.dataset.i as string) === i;
    d.classList.toggle('on', on);
    if (many) d.setAttribute('opacity', on ? '1' : '0');
  }
  if (i == null) {
    tip.hidden = true;
    guide.setAttribute('visibility', 'hidden');
    return;
  }
  const p = pts[i] as ChartPoint,
    h = STATS.hist as ChartHist,
    svg = el.querySelector('svg') as SVGSVGElement;
  guide.setAttribute('x1', String(p.x));
  guide.setAttribute('x2', String(p.x));
  guide.setAttribute('visibility', 'visible');
  const dcls = p.d > 0 ? 'delta-up' : p.d < 0 ? 'delta-down' : '';
  const what =
    h.group === 'none'
      ? p.reason === 'inicial'
        ? 'Pontuação inicial'
        : `${REASON_UI[p.reason as string] || 'Partida'} · <span class="${dcls}">${fmtDelta(p.d)}</span>`
      : p.g
        ? `<span class="${dcls}">${fmtDelta(p.d)}</span> em ${p.g} partida${p.g === 1 ? '' : 's'}`
        : 'Pontuação inicial';
  tip.innerHTML = `<small>${esc(chartDate(p.t, h.group, true))}</small><b>${fmtNum(p.r)}</b><small>${what}</small>`;
  tip.hidden = false;
  const scale = svg.getBoundingClientRect().width / Number(svg.getAttribute('width'));
  const px = p.x * scale,
    py = p.y * scale,
    tw = tip.offsetWidth,
    th = tip.offsetHeight,
    cw = el.clientWidth;
  tip.style.left = Math.max(0, Math.min(cw - tw, px - tw / 2)) + 'px';
  tip.style.top = (py - th - 14 < 0 ? py + 14 : py - th - 14) + 'px';
}
export function initStats(): void {
  $('#statsRange').onclick = (e) => {
    const b = target(e).closest<HTMLElement>('button[data-r]');
    if (!b || b.dataset.r === STATS.range) return;
    STATS.range = b.dataset.r as string;
    loadRatingChart();
  };
  $('#statsReload').onclick = () => loadStats();
  let statsResize = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(statsResize);
    statsResize = requestAnimationFrame(() => {
      if (currentView() === 'estatisticas') drawRatingChart();
    });
  });
}
