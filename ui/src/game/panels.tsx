/* ---------- Painéis do Tabuleiro ----------
   Jogadores, barra de avaliação, treinador (explicação do lance), lista de lances, gráfico, relatório, navegação e a
   legenda. Tudo é desenhado a partir de S a cada publish() (store/view-store.ts). */
import { Chess, type Color, type PieceType } from 'chess.js';
import { useLayoutEffect, useRef, useSyncExternalStore, type MouseEvent, type ReactNode } from 'react';
import { BAD, CLS, CLS_KEYS, PIECE, VAL, stm, uciObj, type ClsKey } from '../core/constants';
import { evalText, pvSan, uciToSan, whiteWp } from '../core/eval';
import { S, blind, botColor, gameReady, isLive, sideName, viewIdx } from '../core/state';
import { openingAt } from '../book/index';
import { engine } from '../engine/engine';
import { ClsBadge, ClsSym } from '../board/badge';
import { GLYPH } from '../board/pieces';
import { useGameView } from '../react/hooks';
import { gameView, statusView } from '../store/view-store';
import { fmtDelta } from '../ui/format';
import { IconBook } from '../ui/icons';
import { copyPgn, finishGame, flipBoard, hintClick, undoClick } from './controls';
import { canResign, resignClick } from './resign';
import { RATING_UI, ratingInfo } from './rating';
import { canReplay, goTo, replaying, toggleReplay } from './replay';
import { UI } from './ui-state';

function Player({ col }: { col: Color }) {
  const idx = viewIdx(),
    c = new Chess(S.positions[idx]);
  type Count = Record<Exclude<PieceType, 'k'>, number>;
  const count: Record<Color, Count> = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
  for (const row of c.board()) for (const p of row) if (p && p.type !== 'k') count[p.color][p.type]++;
  const init: Count = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  const mat = (cl: Color) => (Object.keys(init) as (keyof Count)[]).reduce((s, t) => s + count[cl][t] * VAL[t], 0);
  const opp = col === 'w' ? 'b' : 'w';
  const caps = (['q', 'r', 'b', 'n', 'p'] as const).map((t) => GLYPH[t].repeat(Math.max(0, init[t] - count[opp][t]))).join('');
  const diff = mat(col) - mat(opp);
  const isBot = botColor() === col;
  const isUser = S.mode === 'play' && botColor() && !isBot;
  const rating =
    isBot && S.bot.elo
      ? `≈${S.bot.elo}`
      : isUser
        ? String(RATING_UI.shown)
        : (S.mode === 'review' && S.headers[col === 'w' ? 'WhiteElo' : 'BlackElo']) || '';
  return (
    <>
      <span className={'avatar ' + col}>{GLYPH.k}</span>
      <span className="pname">{sideName(col)}</span>
      <span className="prating">{rating}</span>
      {isBot && S.botThinking ? <span className="thinking">pensando</span> : null}
      <span className="caps">
        <span className="">{caps}</span>
        {diff > 0 ? <b>{`+${diff}`}</b> : null}
      </span>
    </>
  );
}
/** jogador de cima (top) ou de baixo, conforme a orientação */
export function PlayerBar({ top }: { top: boolean }) {
  useGameView();
  const col: Color = top ? (S.orient === 'w' ? 'b' : 'w') : S.orient;
  return (
    <div className="player" id={top ? 'pTop' : 'pBot'}>
      {gameReady() ? <Player col={col} /> : null}
    </div>
  );
}

export function EvalBar() {
  useGameView();
  if (!gameReady())
    return (
      <div className="evalbar assist" id="evalbar" title="Avaliação">
        <div className="fill" id="evalFill"></div>
      </div>
    );
  const idx = viewIdx(),
    fen = S.positions[idx] as string,
    r = S.cache.get(fen);
  return (
    <div className={'evalbar assist' + (S.orient === 'b' ? ' flip' : '')} id="evalbar" title={'Avaliação: ' + evalText(r, fen)}>
      <div className="fill" id="evalFill" style={{ height: (r ? whiteWp(r, fen) : 50) + '%' }}></div>
    </div>
  );
}

// explicação do lance i no cartão do treinador (a análise das duas posições já chegou)
export function explain(i: number): string {
  const k = S.cls[i]!,
    ply = S.plies[i]!,
    fa = S.positions[i] as string,
    fb = S.positions[i + 1] as string;
  const A = S.cache.get(fa)!,
    B = S.cache.get(fb)!;
  if (k.key === 'livro') {
    const name = openingAt(S.positions, i + 1);
    return `Lance de livro: faz parte da teoria de abertura${name ? ` (${name})` : ''}.`;
  }
  const who = sideName(ply.color),
    you = who === 'Você';
  const bestSan = uciToSan(fa, A.best);
  const second = A.lines[1] ? uciToSan(fa, A.lines[1].pv[0]) : null;
  let reason = '';
  if (B.lines[0]) {
    const s = B.lines[0].score;
    if (s.mate != null && s.mate > 0) reason = `Permite mate em ${s.mate}`;
    else {
      const c = new Chess(fb),
        m = c.move(uciObj(B.lines[0].pv[0] || ''));
      if (m && m.captured && VAL[m.captured] >= 3) reason = `Deixa ${PIECE[m.captured][0]} ${PIECE[m.captured][1]} de ${m.to} cair (${m.san})`;
    }
  }
  if (!reason) reason = `A avaliação vai de ${evalText(A, fa)} para ${evalText(B, fb)}`;
  switch (k.key) {
    case 'brilhante':
      return `Sacrifício que funciona: ${you ? 'você entrega' : 'entrega'} material e a posição fica ${(k.afterWp as number) >= 75 ? 'ganha' : 'melhor'}.`;
    case 'otima':
      return second
        ? `Era o único lance que segurava a posição. A segunda opção, ${second}, já perdia bastante.`
        : 'Era o lance certo no momento crítico.';
    case 'melhor':
      return k.nLegal === 1 ? 'Era o único lance legal.' : `É exatamente o lance que o Stockfish escolheria.`;
    case 'excelente':
      return `Quase perfeito. O motor preferia ${bestSan}, mas a diferença é mínima.`;
    case 'boa':
      return `Lance razoável. ${bestSan} era mais preciso.`;
    case 'chance': {
      const s = A.lines[0]!.score;
      // (undefined > 0 é false, como na versão em página única)
      return (s.mate ?? 0) > 0
        ? `Havia mate em ${s.mate} começando com ${bestSan}. A chance passou.`
        : `O adversário vacilou e ${bestSan} aproveitaria (${evalText(A, fa)}). Com ${ply.san}, a vantagem escapou.`;
    }
    default:
      return `${reason}. O melhor era ${bestSan}.`;
  }
}
// corpo do cartão do treinador e a classificação que dá a cor da borda (null = sem classificação)
function coachBody(): [ClsKey | null, ReactNode] {
  const idx = viewIdx();
  if (idx === 0) {
    let t, txt;
    if (S.mode === 'review' && S.fromHistory) {
      t = 'Revisão da partida';
      txt = `${S.recText || 'Partida concluída'}. ${S.plies.length} lances. Use as setas ou clique num lance para ver a avaliação de cada um.`;
    } else if (S.mode === 'review') {
      t = 'Partida carregada';
      txt = `${S.plies.length} lances. Use as setas ou clique num lance para ver a avaliação de cada um.`;
    } else if (botColor()) {
      t = S.player === 'w' ? 'Sua vez de começar' : `${S.bot.name} começa`;
      txt = `Você joga de ${S.player === 'w' ? 'brancas' : 'pretas'} contra o bot ${S.bot.level} (≈${S.bot.elo}). Modo assistido: cada lance recebe uma classificação assim que o Stockfish termina de pensar. Para ver a avaliação só no fim, troque para o modo normal no menu ⋮ do topo.`;
    } else {
      t = 'Tabuleiro livre';
      txt = 'Mova as duas cores. Cada lance é avaliado.';
    }
    return [
      null,
      <>
        <div className="big" style={{ background: 'var(--accent)', fontFamily: 'var(--f-piece)' }}>
          {GLYPH.n}
        </div>
        <div className="ttl">{t}</div>
        <p className="txt">{txt}</p>
      </>,
    ];
  }
  const i = idx - 1,
    ply = S.plies[i]!,
    k = S.cls[i];
  const moveNo = (S.positions[i] as string).split(' ')[5] + (ply.color === 'w' ? '.' : '…');
  if (!k)
    return [
      null,
      <>
        <div className="big">…</div>
        <div className="ttl">
          <span className="san">{`${moveNo} ${ply.san}`}</span>
        </div>
        <p className="txt">{S.engineErr ? 'O Stockfish não carregou, então não há avaliação.' : 'Analisando o lance…'}</p>
      </>,
    ];
  const c = CLS[k.key],
    A = S.cache.get(S.positions[i] as string),
    B = S.cache.get(S.positions[i + 1] as string);
  const showBest = !k.isBest && A && A.lines[0] && !['brilhante', 'otima', 'melhor'].includes(k.key);
  let over = null;
  const endTxt = S.over || (S.mode === 'review' && S.fromHistory ? S.recText : null);
  if (endTxt && idx === S.positions.length - 1) {
    const ri = ratingInfo(S.gameId);
    over = (
      <div className="line">
        <span>Fim de jogo:</span>
        {` ${endTxt}`}
        {ri ? (
          <>
            {` · Rating ${ri.before} → ${ri.after} `}
            <span className={ri.delta >= 0 ? 'delta-up' : 'delta-down'}>{`(${fmtDelta(ri.delta)})`}</span>
          </>
        ) : S.mode === 'play' && botColor() && !S.rated ? (
          ' · Não valeu rating (modo assistido)'
        ) : null}
      </div>
    );
  }
  return [
    k.key,
    <>
      <div className="big" style={{ background: `var(--c-${k.key})` }}>
        <ClsSym k={k.key} />
      </div>
      <div className="ttl">
        <span className="san">{`${moveNo} ${ply.san}`}</span>
        {` · ${c.label}`}
      </div>
      <p className="txt">{explain(i)}</p>
      <div className="meta">
        <span>{sideName(ply.color)}</span>
        <span>
          {'Avaliação '}
          <span className="mono">{evalText(B, S.positions[i + 1] as string)}</span>
        </span>
        {k.book ? null : (
          <span>
            {'Precisão '}
            <span className="mono">{`${Math.round(k.acc)}%`}</span>
          </span>
        )}
        {k.loss >= 0.5 ? (
          <span>
            {'Perda '}
            <span className="mono">{`${k.loss.toFixed(1)}%`}</span>
          </span>
        ) : null}
      </div>
      {showBest ? (
        <div className="line">
          <span>Melhor linha:</span>
          {` ${pvSan(S.positions[i] as string, A.lines[0]!.pv, 6)}`}
        </div>
      ) : null}
      {over}
    </>,
  ];
}
export function Coach() {
  useGameView();
  if (!gameReady()) return <div className="card coach assist" id="coach"></div>;
  const [key, body] = coachBody();
  return (
    <div className="card coach assist" id="coach" style={{ borderLeftColor: key ? `var(--c-${key})` : 'var(--line)' }}>
      {body}
    </div>
  );
}

function OpeningName() {
  // a abertura vem do último lance de livro até a posição exibida
  const name = gameReady() ? openingAt(S.positions, Math.min(viewIdx(), S.bookLen || 0)) : null;
  return (
    <p className="opening-name assist" id="openingName" hidden={!name}>
      {name ? (
        <>
          <IconBook />
          <span>{name}</span>
        </>
      ) : null}
    </p>
  );
}
function MoveList() {
  const listRef = useRef<HTMLOListElement>(null);
  const full = useSyncExternalStore(gameView.subscribe, gameView.full);
  const idx = viewIdx();
  // o lance atual fica visível (só nos redesenhos completos, como o renderAll de antes)
  useLayoutEffect(() => {
    const list = listRef.current,
      cur = list && list.querySelector('.cur');
    if (!list || !cur) return;
    const lt = list.getBoundingClientRect(),
      ct = cur.getBoundingClientRect();
    if (ct.top < lt.top || ct.bottom > lt.bottom) list.scrollTop += ct.top - lt.top - lt.height / 2;
  }, [full]);
  let items: ReactNode[] = [];
  if (!gameReady()) items = [];
  else if (!S.plies.length)
    items = [
      <li key="e" className="moves-empty" style={{ gridColumn: '1/-1' }}>
        Nenhum lance ainda.
      </li>,
    ];
  else {
    const hide = blind();
    const startBlack = stm(S.positions[0] as string) === 'b';
    const firstNo = +((S.positions[0] as string).split(' ')[5] as string);
    let i = 0,
      no = firstNo;
    const cell = (j: number | null, key: string) => {
      if (j == null || j >= S.plies.length) return <span key={key} className="mv empty"></span>;
      const k = hide ? null : S.cls[j];
      return (
        <button key={key} className={'mv' + (idx === j + 1 ? ' cur' : '')} data-i={j + 1} onClick={() => goTo(j + 1)}>
          {k ? <ClsBadge k={k.key} cls="mini" /> : hide ? null : <span className="mini" style={{ background: 'var(--line)' }}></span>}
          {S.plies[j]!.san}
        </button>
      );
    };
    if (startBlack) {
      items.push(
        <li key={'n' + no} className="n">{`${no}.`}</li>,
        <span key="dots" className="mv empty">
          …
        </span>,
        cell(0, 'm0'),
      );
      i = 1;
      no++;
    }
    for (; i < S.plies.length; i += 2, no++)
      items.push(<li key={'n' + no} className="n">{`${no}.`}</li>, cell(i, 'm' + i), cell(i + 1, 'm' + (i + 1)));
  }
  return (
    <ol className="moves-list" id="moveList" ref={listRef}>
      {items}
    </ol>
  );
}
function Graph() {
  const n = S.positions.length - 1;
  const onClick = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    goTo(Math.round(((e.clientX - r.left) / r.width) * (S.positions.length - 1)));
  };
  let body;
  if (!gameReady()) body = null;
  else if (n < 1) body = <line x1="0" y1="32" x2="320" y2="32" stroke="var(--muted)" strokeWidth="1" vectorEffect="non-scaling-stroke" />;
  else {
    const X = (i: number) => (i / n) * 320,
      Y = (wpv: number) => 64 - (wpv / 100) * 64;
    const pts: string[] = [];
    let lastY = 32;
    for (let i = 0; i <= n; i++) {
      const r = S.cache.get(S.positions[i] as string);
      if (r) lastY = Y(whiteWp(r, S.positions[i] as string));
      pts.push(`${X(i).toFixed(1)},${lastY.toFixed(1)}`);
    }
    const marks: ReactNode[] = [];
    S.cls.forEach((k, i) => {
      if (k && ((BAD.includes(k.key) && k.key !== 'imprecisao') || k.key === 'brilhante'))
        marks.push(
          <line
            key={i}
            x1={X(i + 1)}
            y1="0"
            x2={X(i + 1)}
            y2="64"
            stroke={`var(--c-${k.key})`}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            opacity=".9"
          />,
        );
    });
    const v = viewIdx();
    body = (
      <>
        <polygon points={`0,64 ${pts.join(' ')} 320,64`} fill="var(--eval-w)" />
        <line
          x1="0"
          y1="32"
          x2="320"
          y2="32"
          stroke="var(--muted)"
          strokeWidth="1"
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
          opacity=".6"
        />
        {marks}
        <line x1={X(v)} y1="0" x2={X(v)} y2="64" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </>
    );
  }
  return (
    <svg className="graph assist" id="graph" viewBox="0 0 320 64" preserveAspectRatio="none" aria-label="Gráfico de avaliação" onClick={onClick}>
      {body}
    </svg>
  );
}
/** texto do estado do Stockfish (assina só o store de status: muda a cada pedido de análise) */
export function engineStatusText(): string {
  if (S.engineErr) return 'Stockfish indisponível';
  if (!UI.engineReady) return 'Carregando Stockfish…';
  return S.pending.size ? `Stockfish analisando (${S.pending.size})` : 'Stockfish pronto';
}
/** dica do estado: a versão do motor e de onde ele subiu (ex.: "Stockfish 19 Lite WASM · wasm (local)") */
export function engineStatusTitle(): string | undefined {
  if (!UI.engineReady || S.engineErr) return undefined;
  return `${engine.name || engine.label} · ${engine.source || '?'}`;
}
function EngineStatus() {
  useSyncExternalStore(statusView.subscribe, statusView.get);
  return (
    <span className="status assist" id="engineStatus" title={engineStatusTitle()}>
      {engineStatusText()}
    </span>
  );
}
function ReplayButton() {
  const on = replaying();
  return (
    <button
      className="btn replay-btn"
      id="btnReplay"
      hidden={!canReplay()}
      aria-pressed={on}
      title={on ? 'Pausar a reprodução' : 'Reproduzir a partida lance a lance (1,5 s por lance)'}
      onClick={toggleReplay}
    >
      <span className="ic" aria-hidden="true">
        {on ? '❚❚' : '▶'}
      </span>
      <span className="tx">{on ? 'Pausar' : 'Reproduzir'}</span>
    </button>
  );
}
export function MovesCard() {
  useGameView();
  const valid = S.mode === 'play' && S.rated;
  return (
    <div className="card">
      <div className="card-h">
        <h2>Lances</h2>
        <EngineStatus />
        <span className="mode-pill blind-only" id="modePill">
          {valid ? 'Modo normal · vale rating' : 'Modo normal'}
        </span>
      </div>
      <Graph />
      <OpeningName />
      <MoveList />
      <div className="row">
        <button className="btn" id="btnCopy" onClick={copyPgn}>
          {UI.copyLabel}
        </button>
        <ReplayButton />
        <button className="btn primary blind-only" id="btnFinish" disabled={!S.plies.length} onClick={finishGame}>
          Encerrar e avaliar
        </button>
      </div>
      <p className="note blind-only" id="blindNote">
        {'As avaliações ficam escondidas até o fim da partida. Para ver antes, use Encerrar e avaliar' +
          (valid ? ' (numa partida que vale rating, encerrar conta como derrota).' : '.')}
      </p>
    </div>
  );
}

export function Report() {
  useGameView();
  if (!gameReady()) return <div className="card assist" id="report"></div>;
  const done = S.cls.filter(Boolean).length,
    total = S.plies.length;
  interface SideStats {
    n: number;
    acc: number;
    c: Partial<Record<ClsKey, number>>;
  }
  const stats: Record<Color, SideStats> = { w: { n: 0, acc: 0, c: {} }, b: { n: 0, acc: 0, c: {} } };
  S.cls.forEach((k, i) => {
    if (!k) return;
    const s = stats[S.plies[i]!.color];
    if (!k.book) {
      s.n++;
      s.acc += k.acc;
    }
    s.c[k.key] = (s.c[k.key] || 0) + 1;
  });
  const acc = (s: SideStats) => (s.n ? (s.acc / s.n).toFixed(1) : '—');
  const analysing = total > 0 && done < total && !S.engineErr;
  return (
    <div className="card assist" id="report">
      <div className="card-h">
        <h2>Relatório</h2>
        <span className="status">{total ? `${done}/${total} lances avaliados` : ''}</span>
      </div>
      {analysing ? (
        <div className="progress">
          <i style={{ width: `${((done / total) * 100).toFixed(0)}%` }}></i>
        </div>
      ) : null}
      <div className="report-grid">
        <span></span>
        <span className="hd">{sideName('w')}</span>
        <span className="hd">{sideName('b')}</span>
        <span className="lbl" style={{ fontWeight: 600 }}>
          Precisão
        </span>
        <span className="acc">{acc(stats.w)}</span>
        <span className="acc">{acc(stats.b)}</span>
        {CLS_KEYS.map((key) => {
          const a = stats.w.c[key] || 0,
            b = stats.b.c[key] || 0;
          return [
            <span key={key + 'l'} className="lbl">
              <ClsBadge k={key} cls="mini" />
              {CLS[key].label}
            </span>,
            <span key={key + 'w'} className={'cnt' + (a ? '' : ' z')}>
              {a}
            </span>,
            <span key={key + 'b'} className={'cnt' + (b ? '' : ' z')}>
              {b}
            </span>,
          ];
        })}
      </div>
    </div>
  );
}

export function NavBar() {
  useGameView();
  const idx = viewIdx(),
    n = S.positions.length - 1;
  const resignOk = canResign();
  return (
    <div className="navbar">
      <button className="btn icon" id="navFirst" aria-label="Início" disabled={idx === 0} onClick={() => goTo(0)}>
        ⏮
      </button>
      <button className="btn icon" id="navPrev" aria-label="Lance anterior" disabled={idx === 0} onClick={() => goTo(viewIdx() - 1)}>
        ◀
      </button>
      <button className="btn icon" id="navNext" aria-label="Próximo lance" disabled={idx === n} onClick={() => goTo(viewIdx() + 1)}>
        ▶
      </button>
      <button className="btn icon" id="navLast" aria-label="Posição atual" disabled={idx === n} onClick={() => goTo(S.positions.length - 1)}>
        ⏭
      </button>
      <span className="sep"></span>
      <button
        className={'btn danger' + (UI.resignArmed ? ' armed' : '')}
        id="btnResign"
        disabled={!resignOk}
        title={botColor() ? '' : 'Só dá para desistir de partidas contra um bot'}
        onClick={resignClick}
      >
        {UI.resignArmed ? 'Confirmar desistência' : 'Desistir'}
      </button>
      <button className="btn assist" id="btnHint" disabled={!isLive() || !!S.over || S.engineErr} onClick={hintClick}>
        Dica
      </button>
      <button
        className="btn"
        id="btnUndo"
        disabled={
          !S.plies.length || S.resigned || (S.mode === 'review' && S.fromHistory) || (S.mode === 'play' && S.gameMode === 'normal' && !!S.over)
        }
        onClick={undoClick}
      >
        Voltar lance
      </button>
      <button className="btn" id="btnFlip" onClick={flipBoard}>
        Virar
      </button>
    </div>
  );
}

export function Legend() {
  return (
    <details className="card assist">
      <summary>Como os lances são classificados</summary>
      <div className="legend" id="legend">
        {CLS_KEYS.map((k) => (
          <div key={k}>
            <ClsBadge k={k} cls="mini" />
            <span>
              <b>{CLS[k].label}</b>
              <small>{CLS[k].desc}</small>
            </span>
          </div>
        ))}
      </div>
      <p className="note">
        A régua é a perda de chance de vitória (0 a 100%) em relação ao melhor lance do Stockfish. Brilhante exige sacrifício de material com a
        posição continuando boa; Ótima é o único lance que segura a posição; Chance perdida é não aproveitar um erro do adversário.
      </p>
    </details>
  );
}
