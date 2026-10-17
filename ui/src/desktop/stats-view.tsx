/* ---------- Estatísticas (view estatisticas): ilha React ----------
   Recarrega ao abrir a tela e quando uma partida que vale pontuação termina (tópico 'tela:estatisticas'). O gráfico é
   um componente que gera o mesmo SVG da versão anterior (geometria em stats.ts). */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CLS } from '../core/constants';
import type { PlayerStats } from '../types/api';
import { fmtDelta, fmtNum } from '../ui/format';
import { authError } from './account';
import { DESKTOP_STATS } from './bridge';
import { useLatest, useViewRefresh } from './react/hooks';
import { FormMsg, msgOf, type Msg } from './react/modal';
import {
  STATS_RANGES,
  chartEmptyText,
  chartGeom,
  chartSub,
  clsNote,
  clsRows,
  keySel,
  nearestPoint,
  rangeQuery,
  statCards,
  tipInfo,
  type ChartHist,
  type StatsRange,
} from './stats';
import { currentView } from './views';

type ChartState = { kind: 'error'; text: string } | { kind: 'data'; hist: ChartHist } | null;

// selo da classificação (o mesmo de badgeHtml em board/render.ts); sym é texto fixo de CLS e, no livro, um SVG
function Badge({ k }: { k: keyof typeof CLS }) {
  const c = CLS[k];
  return <span className="mini" style={{ background: `var(--c-${k})` }} title={c.label} dangerouslySetInnerHTML={{ __html: c.sym }} />;
}

/** gráfico da pontuação: SVG com grade, eixos, área, linha, pontos e a dica do ponto selecionado */
export function RatingChart({ hist, width, now }: { hist: ChartHist; width: number; now: number }) {
  const g = useMemo(() => chartGeom(hist, width, now), [hist, width, now]);
  const [sel, setSel] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const cur = sel != null && sel < g.pts.length ? sel : null;
  const p = cur != null ? g.pts[cur] : null;
  // posição da dica: depende do tamanho dela, então é medida depois de desenhar
  useLayoutEffect(() => {
    const tip = tipRef.current,
      svg = svgRef.current;
    if (!tip || !svg || !p) return;
    const el = svg.parentElement as HTMLElement;
    const scale = svg.getBoundingClientRect().width / g.W;
    const px = p.x * scale,
      py = p.y * scale,
      tw = tip.offsetWidth,
      th = tip.offsetHeight,
      cw = el.clientWidth;
    tip.style.left = Math.max(0, Math.min(cw - tw, px - tw / 2)) + 'px';
    tip.style.top = (py - th - 14 < 0 ? py + 14 : py - th - 14) + 'px';
  });
  const toLocal = (e: React.PointerEvent) => {
    const b = (svgRef.current as SVGSVGElement).getBoundingClientRect();
    return ((e.clientX - b.left) / b.width) * g.W;
  };
  const tip = p ? tipInfo(p, hist.group) : null;
  return (
    <>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${g.W} ${g.H}`}
        width={g.W}
        height={g.H}
        role="img"
        tabIndex={0}
        aria-label={g.label}
        onPointerMove={(e) => setSel(nearestPoint(g.pts, toLocal(e)))}
        onPointerLeave={() => setSel(null)}
        onBlur={() => setSel(null)}
        onKeyDown={(e) => {
          const to = keySel(e.key, cur, g.pts.length);
          if (to === undefined) return;
          e.preventDefault();
          setSel(to);
        }}
      >
        <g className="grid">
          {g.grid.map((l, i) => (
            <line key={i} x1={g.M.l} x2={g.W - g.M.r} y1={l.y} y2={l.y} />
          ))}
        </g>
        <g className="axis">
          {g.axis.map((a, i) => (
            <text key={i} x={a.x} y={a.y} textAnchor={a.anchor}>
              {a.text}
            </text>
          ))}
        </g>
        <path className="area" d={g.area} />
        <path className="line" d={g.line} />
        {g.tail ? <path className="tail" d={g.tail} /> : null}
        <line
          className="guide"
          id="rcGuide"
          x1={p ? String(p.x) : '0'}
          x2={p ? String(p.x) : '0'}
          y1={g.M.t}
          y2={g.H - g.M.b}
          visibility={p ? 'visible' : 'hidden'}
        />
        <g id="rcDots">
          {g.pts.map((pt, i) => (
            <circle
              key={i}
              className={i === cur ? 'dot on' : 'dot'}
              data-i={i}
              cx={pt.x.toFixed(1)}
              cy={pt.y.toFixed(1)}
              r="4.5"
              opacity={g.many ? (i === cur ? '1' : '0') : undefined}
            />
          ))}
        </g>
        <rect id="rcHit" x={g.M.l} y="0" width={g.W - g.M.l - g.M.r} height={g.H} fill="transparent" />
      </svg>
      <div className="rchart-tip" id="rcTip" ref={tipRef} hidden={!tip}>
        {tip ? (
          <>
            <small>{tip.date}</small>
            <b>{tip.rating}</b>
            <small>
              {tip.what.kind === 'text' ? (
                tip.what.text
              ) : tip.what.kind === 'partida' ? (
                <>
                  {tip.what.reason} · <span className={tip.what.cls}>{tip.what.delta}</span>
                </>
              ) : (
                <>
                  <span className={tip.what.cls}>{tip.what.delta}</span> em {tip.what.games} partida{tip.what.games === 1 ? '' : 's'}
                </>
              )}
            </small>
          </>
        ) : null}
      </div>
    </>
  );
}

export function StatsView() {
  const refresh = useViewRefresh('estatisticas');
  const beginStats = useLatest();
  const beginChart = useLatest();
  const [data, setData] = useState<PlayerStats | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [range, setRange] = useState<StatsRange>('30');
  const [chart, setChart] = useState<ChartState>(null);
  const [chartAt, setChartAt] = useState(0);
  const [width, setWidth] = useState(0);
  const chartRef = useRef<HTMLDivElement>(null);

  const loadChart = useCallback(
    async (r: StatsRange) => {
      if (!DESKTOP_STATS) return;
      const isCurrent = beginChart();
      const q = rangeQuery(r);
      const res = await DESKTOP_STATS.ratingHistory(q.params).catch(() => null);
      if (!isCurrent()) return;
      setChartAt(Date.now());
      if (!res || !res.ok) setChart({ kind: 'error', text: authError(res) });
      else setChart({ kind: 'data', hist: { ...res, fromMs: q.fromMs, group: q.group, days: q.days } });
    },
    [beginChart],
  );
  // período atual para o "Atualizar" e para abrir a tela (o clique no período só recarrega o gráfico)
  const rangeRef = useRef(range);
  useEffect(() => {
    rangeRef.current = range;
  }, [range]);
  const loadStats = useCallback(() => {
    if (!DESKTOP_STATS) return;
    const isCurrent = beginStats();
    loadChart(rangeRef.current);
    DESKTOP_STATS.me()
      .catch(() => null)
      .then((r) => {
        if (!isCurrent()) return;
        if (!r || !r.ok) {
          setMsg(msgOf(`Não foi possível carregar as estatísticas. ${authError(r)}`));
          return;
        }
        setMsg(msgOf(''));
        setData(r.stats);
      });
  }, [beginStats, loadChart]);
  useEffect(() => {
    if (refresh) loadStats();
  }, [refresh, loadStats]);

  // largura do gráfico: medida depois de desenhar e de novo ao redimensionar a janela (na tela de estatísticas)
  useLayoutEffect(() => {
    if (chartRef.current) setWidth(chartRef.current.clientWidth);
  }, [chart]);
  useEffect(() => {
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (currentView() === 'estatisticas' && chartRef.current) setWidth(chartRef.current.clientWidth);
      });
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const shown = refresh > 0;
  const cards = shown ? statCards(data) : [];
  const hist = chart && chart.kind === 'data' ? chart.hist : null;
  const sub = hist ? chartSub(hist) : null;
  const empty = hist ? chartEmptyText(hist) : null;
  return (
    <>
      <div className="admin-h">
        <div>
          <h2 id="statsTtl">Estatísticas</h2>
          <p>Seus resultados, a qualidade dos seus lances e a evolução da pontuação.</p>
        </div>
        <button className="btn" id="statsReload" onClick={loadStats}>
          Atualizar
        </button>
      </div>
      <FormMsg id="statsMsg" msg={msg} role="status" />
      <div className="stat-cards" id="statCards" aria-live="polite">
        {cards.map((c) => (
          <div key={c.lab} className={`card stat-card ${c.cls}`}>
            <span className={'lab' + (c.st ? ' ' + c.st : '')}>
              {c.st ? <i></i> : null}
              {c.lab}
            </span>
            <b>{c.val}</b>
            <small>{c.sub}</small>
          </div>
        ))}
      </div>
      <div className="card rchart-card">
        <div className="card-h rchart-h">
          <div>
            <h2>Evolução da pontuação</h2>
            <small className="rchart-sub" id="rchartSub">
              {sub ? (
                <>
                  Agora: <b>{sub.current}</b>
                  {sub.change != null ? (
                    <>
                      {' · '}
                      <span className={sub.change > 0 ? 'delta-up' : sub.change < 0 ? 'delta-down' : ''}>{fmtDelta(sub.change)}</span> no período
                    </>
                  ) : null}
                </>
              ) : null}
            </small>
          </div>
          <div className="seg rchart-range" id="statsRange" role="group" aria-label="Período do gráfico">
            {STATS_RANGES.map(([r, label]) => (
              <button
                key={r}
                data-r={r}
                aria-pressed={r === range ? 'true' : 'false'}
                onClick={() => {
                  if (r === range) return;
                  setRange(r);
                  loadChart(r);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="rchart" id="ratingChart" ref={chartRef}>
          {chart && chart.kind === 'error' ? (
            <div className="rchart-empty">
              <div>
                <b>Não foi possível carregar o gráfico</b>
                {chart.text}
              </div>
            </div>
          ) : hist && empty ? (
            <div className="rchart-empty">
              <div>
                <b>{empty}</b>Jogue no modo normal contra um bot: vitória vale +10, derrota −10 e empate mantém a pontuação.
                <div className="row" style={{ justifyContent: 'center' }}>
                  <a className="btn primary" href="#/jogo">
                    Jogar uma partida
                  </a>
                </div>
              </div>
            </div>
          ) : hist ? (
            <RatingChart key={chartAt} hist={hist} width={width} now={chartAt} />
          ) : null}
        </div>
      </div>
      <div className="card cls-card">
        <div className="card-h">
          <h2>Seus lances por classificação</h2>
          <span className="status" id="clsNote">
            {data ? clsNote(data) : ''}
          </span>
        </div>
        <div className="admin-scroll">
          <table className="admin-table cls-table">
            <thead>
              <tr>
                <th>Classificação</th>
                <th className="num">Total</th>
                <th className="num">Média por partida</th>
                <th className="cls-bar-h" aria-hidden="true"></th>
              </tr>
            </thead>
            <tbody id="clsRows">
              {data
                ? clsRows(data).map((row) => (
                    <tr key={row.k}>
                      <td>
                        <span className="cls-name">
                          <Badge k={row.k} />
                          {row.label} <small>{row.desc}</small>
                        </span>
                      </td>
                      <td className={'num' + (row.total ? '' : ' z')}>{fmtNum(row.total)}</td>
                      <td className={'num' + (row.avg ? '' : ' z')}>{fmtNum(row.avg, 1)}</td>
                      <td className="cls-bar" aria-hidden="true">
                        <i style={{ width: `${row.width}%`, background: `var(--c-${row.k})`, opacity: row.total ? undefined : 0.25 }}></i>
                      </td>
                    </tr>
                  ))
                : null}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
