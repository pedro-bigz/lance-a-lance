/* ---------- Painéis do Tabuleiro ----------
   Jogadores, barra de avaliação, treinador (explicação do lance), lista de lances, gráfico, relatório e botões.
   renderAll redesenha tudo a partir de S. */
import { Chess, type Color, type PieceType } from 'chess.js';
import { BAD, CLS, CLS_KEYS, PIECE, VAL, stm, uciObj, type ClsKey } from '../core/constants';
import { evalText, pvSan, uciToSan, whiteWp } from '../core/eval';
import { S, blind, botColor, isLive, sideName, viewIdx } from '../core/state';
import { openingAt } from '../book/index';
import { GLYPH } from '../board/pieces';
import { badgeHtml, renderBoard } from '../board/render';
import { engine } from '../engine/engine';
import { renderStudy } from '../study/panel';
import { $ } from '../ui/dom';
import { esc } from '../ui/escape';
import { fmtDelta } from '../ui/format';
import { ICON_BOOK } from '../ui/icons';
import { renderModeSeg } from './controls';
import { canResign, disarmResign } from './resign';
import { RATING_UI, ratingInfo, renderRating } from './rating';
import { canReplay, renderReplayBtn, stopReplay } from './replay';

export function renderPlayers(): void {
  const idx = viewIdx(),
    c = new Chess(S.positions[idx]);
  type Count = Record<Exclude<PieceType, 'k'>, number>;
  const count: Record<Color, Count> = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
  for (const row of c.board()) for (const p of row) if (p && p.type !== 'k') count[p.color][p.type]++;
  const init: Count = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  const mat = (col: Color) => (Object.keys(init) as (keyof Count)[]).reduce((s, t) => s + count[col][t] * VAL[t], 0);
  const one = (el: HTMLElement, col: Color) => {
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
    const thinking = isBot && S.botThinking ? '<span class="thinking">pensando</span>' : '';
    el.innerHTML = `<span class="avatar ${col}">${GLYPH.k}</span><span class="pname">${esc(sideName(col))}</span><span class="prating">${esc(rating)}</span>${thinking}<span class="caps"><span class="${opp === 'w' ? '' : ''}">${caps}</span>${diff > 0 ? `<b>+${diff}</b>` : ''}</span>`;
  };
  const top = S.orient === 'w' ? 'b' : 'w';
  one($('#pTop'), top);
  one($('#pBot'), S.orient);
}
function renderEval(): void {
  const idx = viewIdx(),
    fen = S.positions[idx] as string,
    r = S.cache.get(fen);
  const bar = $('#evalbar');
  bar.classList.toggle('flip', S.orient === 'b');
  $('#evalFill').style.height = (r ? whiteWp(r, fen) : 50) + '%';
  bar.title = 'Avaliação: ' + evalText(r, fen);
}
// explicação do lance i no cartão do treinador (a análise das duas posições já chegou)
function explain(i: number): string {
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
function renderCoach(): void {
  const el = $('#coach'),
    idx = viewIdx();
  const setColor = (key: ClsKey | null) => {
    el.style.borderLeftColor = key ? `var(--c-${key})` : 'var(--line)';
  };
  if (idx === 0) {
    setColor(null);
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
    el.innerHTML = `<div class="big" style="background:var(--accent)">${GLYPH.n}</div><div class="ttl">${t}</div><p class="txt">${txt}</p>`;
    (el.querySelector('.big') as HTMLElement).style.fontFamily = 'var(--f-piece)';
    return;
  }
  const i = idx - 1,
    ply = S.plies[i]!,
    k = S.cls[i];
  const moveNo = (S.positions[i] as string).split(' ')[5] + (ply.color === 'w' ? '.' : '…');
  if (!k) {
    setColor(null);
    el.innerHTML = `<div class="big">…</div><div class="ttl"><span class="san">${moveNo} ${esc(ply.san)}</span></div><p class="txt">${S.engineErr ? 'O Stockfish não carregou, então não há avaliação.' : 'Analisando o lance…'}</p>`;
    return;
  }
  setColor(k.key);
  const c = CLS[k.key],
    A = S.cache.get(S.positions[i] as string),
    B = S.cache.get(S.positions[i + 1] as string);
  const showBest = !k.isBest && A && A.lines[0] && !['brilhante', 'otima', 'melhor'].includes(k.key);
  let over = '';
  const endTxt = S.over || (S.mode === 'review' && S.fromHistory ? S.recText : null);
  if (endTxt && idx === S.positions.length - 1) {
    const ri = ratingInfo(S.gameId);
    const rt = ri
      ? ` · Rating ${ri.before} → ${ri.after} <span class="${ri.delta >= 0 ? 'delta-up' : 'delta-down'}">(${fmtDelta(ri.delta)})</span>`
      : S.mode === 'play' && botColor() && !S.rated
        ? ' · Não valeu rating (modo assistido)'
        : '';
    over = `<div class="line"><span>Fim de jogo:</span> ${esc(endTxt)}${rt}</div>`;
  }
  el.innerHTML = `
    <div class="big" style="background:var(--c-${k.key})">${c.sym}</div>
    <div class="ttl"><span class="san">${moveNo} ${esc(ply.san)}</span> · ${c.label}</div>
    <p class="txt">${esc(explain(i))}</p>
    <div class="meta"><span>${esc(sideName(ply.color))}</span><span>Avaliação <span class="mono">${evalText(B, S.positions[i + 1] as string)}</span></span>${k.book ? '' : `<span>Precisão <span class="mono">${Math.round(k.acc)}%</span></span>`}${k.loss >= 0.5 ? `<span>Perda <span class="mono">${k.loss.toFixed(1)}%</span></span>` : ''}</div>
    ${showBest ? `<div class="line"><span>Melhor linha:</span> ${esc(pvSan(S.positions[i] as string, A.lines[0]!.pv, 6))}</div>` : ''}
    ${over}`;
}
function renderOpening(): void {
  const el = $('#openingName');
  // a abertura vem do último lance de livro até a posição exibida
  const name = openingAt(S.positions, Math.min(viewIdx(), S.bookLen || 0));
  el.hidden = !name;
  if (name) el.innerHTML = `${ICON_BOOK}<span>${esc(name)}</span>`;
}
function renderMoves(): void {
  renderOpening();
  const list = $('#moveList'),
    idx = viewIdx();
  if (!S.plies.length) {
    list.innerHTML = '';
    list.insertAdjacentHTML('beforeend', '<li class="moves-empty" style="grid-column:1/-1">Nenhum lance ainda.</li>');
    return;
  }
  let html = '';
  const startBlack = stm(S.positions[0] as string) === 'b';
  const firstNo = +((S.positions[0] as string).split(' ')[5] as string);
  let i = 0,
    no = firstNo;
  const cell = (j: number | null) => {
    if (j == null || j >= S.plies.length) return '<span class="mv empty"></span>';
    const k = blind() ? null : S.cls[j];
    return `<button class="mv${idx === j + 1 ? ' cur' : ''}" data-i="${j + 1}">${k ? badgeHtml(k.key, 'mini') : blind() ? '' : '<span class="mini" style="background:var(--line)"></span>'}${esc(S.plies[j]!.san)}</button>`;
  };
  if (startBlack) {
    html += `<li class="n">${no}.</li><span class="mv empty">…</span>${cell(0)}`;
    i = 1;
    no++;
  }
  for (; i < S.plies.length; i += 2, no++) html += `<li class="n">${no}.</li>${cell(i)}${cell(i + 1)}`;
  list.innerHTML = html;
  const cur = list.querySelector('.cur');
  if (cur) {
    const lt = list.getBoundingClientRect(),
      ct = cur.getBoundingClientRect();
    if (ct.top < lt.top || ct.bottom > lt.bottom) list.scrollTop += ct.top - lt.top - lt.height / 2;
  }
}
function renderGraph(): void {
  const g = $('#graph'),
    n = S.positions.length - 1;
  if (n < 1) {
    g.innerHTML = '<line x1="0" y1="32" x2="320" y2="32" stroke="var(--muted)" stroke-width="1" vector-effect="non-scaling-stroke"/>';
    return;
  }
  const X = (i: number) => (i / n) * 320,
    Y = (wpv: number) => 64 - (wpv / 100) * 64;
  const pts: string[] = [];
  let lastY = 32;
  for (let i = 0; i <= n; i++) {
    const r = S.cache.get(S.positions[i] as string);
    if (r) lastY = Y(whiteWp(r, S.positions[i] as string));
    pts.push(`${X(i).toFixed(1)},${lastY.toFixed(1)}`);
  }
  let marks = '';
  S.cls.forEach((k, i) => {
    if (k && ((BAD.includes(k.key) && k.key !== 'imprecisao') || k.key === 'brilhante'))
      marks += `<line x1="${X(i + 1)}" y1="0" x2="${X(i + 1)}" y2="64" stroke="var(--c-${k.key})" stroke-width="2" vector-effect="non-scaling-stroke" opacity=".9"/>`;
  });
  const v = viewIdx();
  g.innerHTML = `<polygon points="0,64 ${pts.join(' ')} 320,64" fill="var(--eval-w)"/>
    <line x1="0" y1="32" x2="320" y2="32" stroke="var(--muted)" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" opacity=".6"/>
    ${marks}<line x1="${X(v)}" y1="0" x2="${X(v)}" y2="64" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
}
function renderReport(): void {
  const el = $('#report');
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
  let html = `<div class="card-h"><h2>Relatório</h2><span class="status">${total ? `${done}/${total} lances avaliados` : ''}</span></div>`;
  if (analysing) html += `<div class="progress"><i style="width:${((done / total) * 100).toFixed(0)}%"></i></div>`;
  html += `<div class="report-grid"><span></span><span class="hd">${esc(sideName('w'))}</span><span class="hd">${esc(sideName('b'))}</span>
    <span class="lbl" style="font-weight:600">Precisão</span><span class="acc">${acc(stats.w)}</span><span class="acc">${acc(stats.b)}</span>`;
  for (const key of CLS_KEYS) {
    const a = stats.w.c[key] || 0,
      b = stats.b.c[key] || 0;
    html += `<span class="lbl">${badgeHtml(key, 'mini')}${CLS[key].label}</span><span class="cnt${a ? '' : ' z'}">${a}</span><span class="cnt${b ? '' : ' z'}">${b}</span>`;
  }
  el.innerHTML = html + '</div>';
}
export function setStatus(): void {
  const el = $('#engineStatus');
  if (S.engineErr) {
    el.textContent = 'Stockfish indisponível';
    return;
  }
  engine.ready.then(
    () => {
      el.textContent = S.pending.size ? `Stockfish analisando (${S.pending.size})` : 'Stockfish pronto';
    },
    () => {},
  );
}
function renderNav(): void {
  const idx = viewIdx(),
    n = S.positions.length - 1;
  $<HTMLButtonElement>('#navFirst').disabled = $<HTMLButtonElement>('#navPrev').disabled = idx === 0;
  $<HTMLButtonElement>('#navNext').disabled = $<HTMLButtonElement>('#navLast').disabled = idx === n;
  $<HTMLButtonElement>('#btnUndo').disabled =
    !S.plies.length || S.resigned || (S.mode === 'review' && S.fromHistory) || (S.mode === 'play' && S.gameMode === 'normal' && !!S.over);
  const rb = $<HTMLButtonElement>('#btnResign');
  rb.disabled = !canResign();
  rb.title = botColor() ? '' : 'Só dá para desistir de partidas contra um bot';
  if (rb.disabled) disarmResign();
  $<HTMLButtonElement>('#btnFinish').disabled = !S.plies.length;
  if (!canReplay()) stopReplay();
  else renderReplayBtn();
  $<HTMLButtonElement>('#btnHint').disabled = !isLive() || !!S.over || S.engineErr;
}
function renderModePill(): void {
  const valid = S.mode === 'play' && S.rated;
  $('#modePill').textContent = valid ? 'Modo normal · vale rating' : 'Modo normal';
  $('#blindNote').textContent =
    'As avaliações ficam escondidas até o fim da partida. Para ver antes, use Encerrar e avaliar' +
    (valid ? ' (numa partida que vale rating, encerrar conta como derrota).' : '.');
}
export function renderAll(): void {
  document.body.classList.toggle('blind', blind());
  renderModePill();
  renderRating();
  renderModeSeg();
  renderBoard();
  renderPlayers();
  renderEval();
  renderCoach();
  renderMoves();
  renderGraph();
  renderReport();
  renderNav();
  renderStudy();
}
