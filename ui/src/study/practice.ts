/* Prática guiada (estudo de aberturas sem IA): "Praticar" usa o treino do tutor (startTraining: o bot segue as
   variantes) com a camada de estudo por cima. Cada lance do usuário é conferido com as variantes (studyOnUserMove).
   Desvio ou fim das variantes seguram o bot (studyHold, checado em maybeBot) até o usuário escolher o que fazer. */
import { CLS } from '../core/constants';
import { undo } from '../core/game';
import { S, isLive, type Trainer } from '../core/state';
import { BOOK_LINES, openingName, type BookLine } from '../book/index';
import { bookTree, linesNext, sanStep } from '../book/tree';
import { badgeHtml, renderBoard } from '../board/render';
import { maybeBot } from '../engine/bot';
import { ACCOUNT } from '../desktop/account';
import { DESKTOP_AUTH } from '../desktop/bridge';
import { goView } from '../desktop/views';
import { renderAll } from '../game/panel';
import { boardCtx, freshStudyBoard } from '../store/contexts';
import { save, saveGame } from '../store/session';
import { startTraining } from '../tutor/training';
import { $, $opt } from '../ui/dom';
import { esc } from '../ui/escape';
import { MATE_CP, STUDY_EVAL, fmtEv, moveNo, studyEval } from './eval';
import { setStudy } from './panel';
import { mainLine } from './pick';
import { STUDY, type Deviation, type Practice, type PracticeLast, type PracticeState, type StudySel } from './state';

export { STUDY };
export type { Practice };

// prática em andamento no tabuleiro (outra partida, demonstração ou treino do tutor desligam a camada de estudo)
export function studyPractice(): Practice | null {
  const p = STUDY.practice;
  return p && S.trainer && S.trainer === p.trainer && S.mode === 'play' ? p : null;
}
export const studyHold = (): boolean => {
  const p = studyPractice();
  return !!p && (p.state === 'dev' || p.state === 'done');
};
// no desktop a prática e a demonstração ficam na partida do estudo (Aberturas), nunca na do Tabuleiro
export const studyNeedsCtx = (): boolean => !!DESKTOP_AUTH && !!ACCOUNT.user && boardCtx() !== 'estudo';
let LINE_INDEX: Map<BookLine, number> | null = null; // linha do livro -> posição em BOOK_LINES (para guardar a escolha no localStorage)
const lineIndex = () => LINE_INDEX || (LINE_INDEX = new Map(BOOK_LINES.map((l, i) => [l, i])));
export function studyStart(color: 'w' | 'b', avoid?: string | null): void {
  const sel = STUDY.sel;
  if (!sel) return;
  if (studyNeedsCtx()) goView('aberturas');
  // sorteia a variante que o bot vai preferir (no "praticar de novo", diferente da anterior quando der)
  const pool = sel.lines.filter((l) => l.sans.join(' ') !== avoid);
  const pick = (pool.length ? pool : sel.lines)[Math.floor(Math.random() * (pool.length || sel.lines.length))] as BookLine;
  S.studyMark = null;
  STUDY.practice = null;
  startTraining({ lines: sel.lines, name: sel.title, userColor: color, bot: null, prefer: pick.sans });
  STUDY.practice = {
    trainer: S.trainer as Trainer,
    sel,
    name: sel.title,
    color,
    hits: 0,
    devs: 0,
    hints: 0,
    state: 'on',
    last: null,
    dev: null,
    lineIdx: sel.lines.map((l) => lineIndex().get(l)),
  };
  save();
  $<HTMLDetailsElement>('#studyPickBox').open = false;
  $<HTMLDetailsElement>('#studyExpBox').open = false; // não entrega a resposta: o explorador fica recolhido
  STUDY.autoClosed = true;
  STUDY.pracKey = null;
  renderAll();
  $('#studyPractice').scrollIntoView({ block: 'nearest' });
}
// parte da partida que segue as variantes: k lances batem; cur = linhas que ainda batem com esses k
function studyMatch(p: Practice): { k: number; cur: string[][] } {
  const hist = S.plies.map((x) => x.san);
  let cur = p.trainer.lines,
    k = 0;
  for (; k < hist.length; k++) {
    const nx = cur.filter((l) => l[k] === hist[k]);
    if (!nx.length) break;
    cur = nx;
  }
  return { k, cur };
}
// estado derivado da partida: voltar lance desfaz o desvio; as variantes acabaram = fim
export function studySync(): void {
  const p = studyPractice();
  if (!p || p.state === 'free') return;
  const { k, cur } = studyMatch(p),
    off = k < S.plies.length,
    more = cur.some((l) => l.length > k);
  if (p.state === 'dev' && !off) {
    p.state = 'on';
    p.dev = null;
  } else if (p.state === 'done' && !off && more) p.state = 'on';
  if (p.state === 'on' && !off && !more) p.state = 'done';
}
// chamado logo depois de cada lance do usuário (antes de o bot responder)
export function studyOnUserMove(): void {
  S.studyMark = null;
  const p = studyPractice();
  if (!p) return;
  if (p.state === 'done') {
    p.state = 'free';
    p.trainer.done = true;
    return;
  } // jogou depois do fim: segue contra o bot
  if (p.state !== 'on') return;
  const i = S.plies.length - 1,
    hist = S.plies.map((x) => x.san);
  if (p.trainer.lines.some((l) => l.length > i && hist.every((m, j) => l[j] === m))) {
    p.hits++;
    p.last = { kind: 'hit', i, san: hist[i] as string, name: openingName(S.positions[i + 1] as string) };
    studySync();
    return;
  }
  p.devs++;
  p.state = 'dev';
  p.last = null;
  p.dev = devOf(p);
  studyDevEvals(p.dev);
}
// desvio no último lance: lances de livro das variantes e se o lance jogado é teoria de outra abertura
export function devOf(p: Practice): Deviation {
  const i = S.plies.length - 1,
    hist = S.plies.map((x) => x.san),
    prev = hist.slice(0, -1);
  const other = (bookTree().get(prev.join(' ')) || new Map()).get(hist[i] as string);
  return {
    i,
    san: hist[i] as string,
    before: S.positions[i] as string,
    after: S.positions[i + 1] as string,
    book: linesNext(p.trainer.lines, prev, S.positions[i] as string),
    other: other ? openingName(S.positions[i + 1] as string) || other.name : null,
  };
}
// avalia o lance jogado e os lances de livro do desvio (em sequência no botEngine)
export function studyDevEvals(dev: Deviation): void {
  const stale = () => !STUDY.practice || STUDY.practice.dev !== dev;
  for (const f of [dev.after, ...dev.book.map((b) => b.fen)])
    studyEval(f, stale).then(() => {
      if (!stale()) renderStudyPractice();
    });
}
export function studyHint(): void {
  const p = studyPractice();
  if (!p || p.state !== 'on' || !isLive() || S.botThinking || S.game.turn() !== S.player) return;
  const hist = S.plies.map((x) => x.san),
    pref = p.trainer.prefer;
  let san = pref && pref.length > hist.length && hist.every((m, i) => pref[i] === m) ? (pref[hist.length] as string) : null;
  if (!san) {
    const nx = linesNext(p.trainer.lines, hist, S.game.fen());
    if (nx.length) san = (nx[Math.floor(Math.random() * nx.length)] as (typeof nx)[number]).san;
  }
  const m = san && sanStep(S.game.fen(), san);
  if (!m) return;
  p.hints++;
  p.last = { kind: 'hint', i: S.plies.length, sq: m.from };
  S.studyMark = { fen: S.game.fen(), from: m.from };
  save();
  renderBoard();
  renderStudyPractice();
}
export function studyRetry(): void {
  const p = studyPractice();
  if (!p || p.state !== 'dev') return;
  undo(); // desfaz só o lance do usuário; studySync volta a prática para "on"
  const b = $opt('#studyActs [data-act="hint"]');
  if (b) b.focus();
}
export function studyContinue(): void {
  const p = studyPractice();
  if (!p) return;
  p.state = 'free';
  p.dev = null;
  p.trainer.done = true; // daqui em diante o bot joga pelo motor
  save();
  renderAll();
  maybeBot();
}
// "Encerrar estudo": abandona a prática (conta como concluída). No Aberturas do desktop volta a um tabuleiro novo
export function studyEnd(): void {
  const p = studyPractice();
  if (!p) return;
  p.state = 'free';
  p.dev = null;
  p.trainer.done = true;
  if (boardCtx() === 'estudo') {
    saveGame();
    freshStudyBoard();
    renderAll();
    setStudy(true);
    $('#studyQ').focus();
    return;
  }
  save();
  renderAll();
  maybeBot();
}
export function studyAgain(): void {
  const p = STUDY.practice;
  if (!p) return;
  STUDY.sel = p.sel;
  studyStart(p.color, p.trainer.prefer ? p.trainer.prefer.join(' ') : null);
}
const userPlies = (n: number, color: 'w' | 'b') => (color === 'w' ? Math.ceil(n / 2) : Math.floor(n / 2));
function scoreHtml(p: Practice): string {
  return `<div class="st-score"><span class="ok"><b>${p.hits}</b>acertos</span><span class="bad"><b>${p.devs}</b>desvios</span><span><b>${p.hints}</b>dicas</span></div>`;
}
// bloco do desvio: lances de livro, julgamento do Stockfish e a classificação do app
function devHtml(p: Practice): string {
  const d = p.dev as Deviation,
    me = p.color,
    pov = (e: { w: number }) => (me === 'w' ? e.w : -e.w);
  const played = STUDY.evals.get(d.after),
    num = moveNo(d.before);
  let h = `<b>Fora da teoria: ${esc(num)} <span class="san">${esc(d.san)}</span></b>`;
  if (d.other) h += `<p>Esse lance é de livro, mas leva a outra abertura (${esc(d.other)}), fora das variantes que você está praticando.</p>`;
  h += `<p>Lances de livro aqui:</p><ul class="st-book">${d.book.map((b) => `<li><span class="san">${esc(b.san)}</span><small title="${esc(b.name)}">${esc(b.name || '')}</small><span class="ev">${fmtEv(STUDY.evals.get(b.fen), me)}</span></li>`).join('')}</ul>`;
  const ready = d.book.map((b) => ({ b, e: STUDY.evals.get(b.fen) })).filter((x) => x.e && !x.e.err);
  if (played && !played.err && ready.length === d.book.length && ready.length) {
    const best = ready.sort((x, y) => pov(y.e!) - pov(x.e!))[0]!,
      diff = pov(best.e!) - pov(played);
    const big = Math.abs(best.e!.w) > MATE_CP / 2 || Math.abs(played.w) > MATE_CP / 2;
    const dtxt = big
      ? 'decisiva (há mate na linha)'
      : diff <= 0
        ? `nenhuma: ${esc(d.san)} vale tanto quanto o livro pelo Stockfish`
        : `−${(diff / 100).toFixed(2)} peão`;
    h += `<p>Stockfish (profundidade ${STUDY_EVAL.depth}), do seu ponto de vista: depois de <span class="san">${esc(d.san)}</span> fica <b>${fmtEv(played, me)}</b>; com <span class="san">${esc(best.b.san)}</span>, o melhor de livro, ficaria <b>${fmtEv(best.e, me)}</b>. Diferença: ${dtxt}.</p>`;
  } else if (played && played.err) h += '<p>O Stockfish não respondeu, então não há avaliação.</p>';
  else h += '<p>Stockfish avaliando o seu lance e os de livro…</p>';
  const k = S.cls[d.i];
  if (k)
    h += `<p class="st-cls">Classificação do app: ${badgeHtml(k.key, 'mini')} <b>${esc(CLS[k.key].label)}</b>${k.book ? ' (ainda é teoria geral)' : k.loss >= 0.5 ? ` · perda de ${k.loss.toFixed(1)}%` : ''}</p>`;
  else if (!S.engineErr) h += '<p class="st-cls">Classificação do app: analisando…</p>';
  return h;
}
export function renderStudyPractice(): void {
  const sec = $('#studyPractice'),
    p = studyPractice();
  sec.hidden = !p;
  // a prática acabou (outra partida, revisão ou demonstração): reabre a escolha e o explorador recolhidos por ela
  if (!p && STUDY.autoClosed) {
    STUDY.autoClosed = false;
    $<HTMLDetailsElement>('#studyPickBox').open = true;
    $<HTMLDetailsElement>('#studyExpBox').open = true;
  }
  if (!p || $('#study').hidden) return;
  const { k, cur } = studyMatch(p),
    dev = p.state === 'dev' ? p.dev : null;
  const total = Math.max(1, ...cur.map((l) => userPlies(l.length, p.color))),
    done = userPlies(k, p.color);
  const myTurn = S.game.turn() === S.player,
    live = isLive();
  const key = [
    p.state,
    p.hits,
    p.devs,
    p.hints,
    S.plies.length,
    myTurn,
    S.botThinking,
    live,
    S.bot.id,
    dev && (S.cls[dev.i] || ({} as { key?: string })).key,
    dev && [dev.after, ...dev.book.map((b) => b.fen)].filter((f) => STUDY.evals.has(f)).length,
  ].join('|');
  if (key === STUDY.pracKey) return;
  STUDY.pracKey = key;
  $('#studyPracHead').innerHTML =
    `<div class="st-ph"><b>${esc(p.name)}</b><small>Você joga de ${p.color === 'w' ? 'brancas' : 'pretas'} contra o ${esc(S.bot.name)} · não vale rating</small></div>
    <div class="st-prog"><span>Lance ${Math.min(done, total)} de ${total} da teoria</span><span>${p.state === 'free' ? 'Partida livre' : p.state === 'done' ? 'Variantes concluídas' : ''}</span></div>
    <div class="progress"><i style="width:${(Math.min(1, done / total) * 100).toFixed(0)}%"></i></div>${scoreHtml(p)}`;
  let fb = '',
    cls = '',
    acts: string;
  if (p.state === 'dev') {
    cls = 'dev';
    fb = devHtml(p);
    acts =
      '<button class="btn primary" data-act="retry">Tentar de novo</button><button class="btn" data-act="cont">Continuar daqui</button><button class="btn" data-act="end">Encerrar estudo</button>';
  } else if (p.state === 'done') {
    cls = 'done';
    fb = `<b>Fim das variantes de ${esc(p.name)}.</b><p>Resumo: ${p.hits} acerto${p.hits === 1 ? '' : 's'}, ${p.devs} desvio${p.devs === 1 ? '' : 's'} e ${p.hints} dica${p.hints === 1 ? '' : 's'}.${myTurn ? ' Se jogar mais um lance, a partida segue contra o bot.' : ''}</p>`;
    acts =
      '<button class="btn primary" data-act="again">Praticar de novo</button><button class="btn" data-act="cont">Continuar contra o bot</button>';
  } else if (p.state === 'free') {
    fb = `<b>Prática encerrada.</b><p>A partida segue contra o bot pelo motor, sem rating. Placar: ${p.hits} acerto${p.hits === 1 ? '' : 's'}, ${p.devs} desvio${p.devs === 1 ? '' : 's'}, ${p.hints} dica${p.hints === 1 ? '' : 's'}.</p>`;
    acts = '<button class="btn primary" data-act="again">Praticar de novo</button>';
  } else {
    const last = p.last;
    if (last && last.kind === 'hit' && last.i >= S.plies.length - 2) {
      cls = 'hit';
      fb = `<b>Lance de livro ✓ ${esc(moveNo(S.positions[last.i] as string))} <span class="san">${esc(last.san)}</span></b>${last.name ? `<p>${esc(last.name)}</p>` : ''}`;
    } else if (last && last.kind === 'hint' && last.i === S.plies.length)
      fb = `<b>Dica:</b> a peça destacada em ${esc(last.sq)} tem um lance de livro.`;
    const st = !live
      ? 'Você está vendo um lance anterior: volte à posição atual para continuar.'
      : myTurn
        ? 'Sua vez: jogue o lance da teoria.'
        : 'O bot responde pela teoria…';
    fb += fb ? `<p>${st}</p>` : st;
    acts = `<button class="btn" data-act="hint"${myTurn && live && !S.botThinking ? '' : ' disabled'}>Dica</button><button class="btn" data-act="end">Encerrar estudo</button>`;
  }
  const fbEl = $('#studyFb');
  fbEl.className = 'st-fb' + (cls ? ' ' + cls : '');
  if (fbEl.innerHTML !== fb) fbEl.innerHTML = fb;
  // mantém o foco no mesmo botão quando a barra de ações é redesenhada
  const active = document.activeElement as HTMLElement | null;
  const focused = active && active.closest('#studyActs') ? active.dataset.act : null;
  $('#studyActs').innerHTML = acts;
  if (focused) {
    const b = $opt<HTMLButtonElement>(`#studyActs [data-act="${focused}"]`);
    if (b && !b.disabled) b.focus();
  }
}

/** Prática guardada no slot do estudo (lance-a-lance:v1…:estudo). */
export interface StudySnapshot {
  lines: (number | undefined)[];
  prefer: number;
  name: string;
  color: 'w' | 'b';
  hits: number;
  devs: number;
  hints: number;
  state: PracticeState;
  last: PracticeLast | null;
}
export function studySnapshot(): StudySnapshot | null {
  studySync();
  const p = studyPractice();
  if (!p || p.state === 'done' || p.state === 'free' || !p.lineIdx || p.lineIdx.some((i) => i == null)) return null;
  return {
    lines: p.lineIdx,
    prefer: p.trainer.prefer ? p.trainer.lines.indexOf(p.trainer.prefer) : -1,
    name: p.name,
    color: p.color,
    hits: p.hits,
    devs: p.devs,
    hints: p.hints,
    state: p.state,
    last: p.last,
  };
}
// refaz a prática guardada (lances já estão no tabuleiro); null se o slot não tem estudo em andamento
export function studyFromSnapshot(st: Partial<StudySnapshot> | null | undefined): { trainer: Trainer; practice: Practice } | null {
  const lines = (st && Array.isArray(st.lines) ? st.lines : []).map((i) => BOOK_LINES[i as number]).filter(Boolean) as BookLine[];
  if (!st || !lines.length || !['on', 'dev'].includes(st.state as string)) return null;
  const tl = lines.map((l) => l.sans);
  const trainer: Trainer = { lines: tl, name: st.name as string, done: false, prefer: tl[st.prefer as number] || null };
  const sel: StudySel = { title: st.name as string, lines, main: mainLine(lines), names: new Set(lines.map((l) => l.name)).size };
  return {
    trainer,
    practice: {
      trainer,
      sel,
      name: st.name as string,
      color: st.color === 'b' ? 'b' : 'w',
      hits: (st.hits as number) | 0,
      devs: (st.devs as number) | 0,
      hints: (st.hints as number) | 0,
      state: st.state as PracticeState,
      last: st.last || null,
      dev: null,
      lineIdx: st.lines as number[],
    },
  };
}
