// Painel "Estudo de aberturas": prática guiada (placar, retorno do lance e ações), escolha da abertura (busca,
// populares, famílias e variantes) e o explorador de livro com a avaliação de cada lance.
import { useEffect, type ReactNode } from 'react';
import { CLS, stm } from '../core/constants';
import { uciToSan } from '../core/eval';
import { S, gameReady, isLive } from '../core/state';
import { pgnOf } from '../book/index';
import { ClsBadge } from '../board/badge';
import { REFS, UI } from '../game/ui-state';
import { useGameView } from '../react/hooks';
import { publish } from '../store/view-store';
import { IconBook } from '../ui/icons';
import { MATE_CP, STUDY_EVAL, fmtEv, moveNo } from './eval';
import { expEval, explorerEvals, explorerView, studyExpClick } from './explorer';
import { setStudy, studyQInput } from './panel';
import { STUDY_POPULAR, groupsFor, mainLine, shortPgn, studySearch, studySelectGroup, studyUnselect, studyWatch } from './pick';
import { studyAgain, studyContinue, studyEnd, studyHint, studyMatch, studyPractice, studyRetry, studyStart, userPlies } from './practice';
import { STUDY, type Practice } from './state';

const San = ({ children }: { children: string }) => <span className="san">{children}</span>;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// bloco do desvio: lances de livro, julgamento do Stockfish e a classificação do app
function DevFeedback({ p }: { p: Practice }) {
  const d = p.dev!,
    me = p.color,
    pov = (e: { w: number }) => (me === 'w' ? e.w : -e.w);
  const played = STUDY.evals.get(d.after),
    num = moveNo(d.before);
  const ready = d.book.map((b) => ({ b, e: STUDY.evals.get(b.fen) })).filter((x) => x.e && !x.e.err);
  let judge;
  if (played && !played.err && ready.length === d.book.length && ready.length) {
    const best = ready.sort((x, y) => pov(y.e!) - pov(x.e!))[0]!,
      diff = pov(best.e!) - pov(played);
    const big = Math.abs(best.e!.w) > MATE_CP / 2 || Math.abs(played.w) > MATE_CP / 2;
    const dtxt = big
      ? 'decisiva (há mate na linha)'
      : diff <= 0
        ? `nenhuma: ${d.san} vale tanto quanto o livro pelo Stockfish`
        : `−${(diff / 100).toFixed(2)} peão`;
    judge = (
      <p>
        {`Stockfish (profundidade ${STUDY_EVAL.depth}), do seu ponto de vista: depois de `}
        <San>{d.san}</San>
        {' fica '}
        <b>{fmtEv(played, me)}</b>
        {'; com '}
        <San>{best.b.san}</San>
        {', o melhor de livro, ficaria '}
        <b>{fmtEv(best.e, me)}</b>
        {`. Diferença: ${dtxt}.`}
      </p>
    );
  } else if (played && played.err) judge = <p>O Stockfish não respondeu, então não há avaliação.</p>;
  else judge = <p>Stockfish avaliando o seu lance e os de livro…</p>;
  const k = S.cls[d.i];
  return (
    <>
      <b>
        {`Fora da teoria: ${num} `}
        <San>{d.san}</San>
      </b>
      {d.other ? <p>{`Esse lance é de livro, mas leva a outra abertura (${d.other}), fora das variantes que você está praticando.`}</p> : null}
      <p>Lances de livro aqui:</p>
      <ul className="st-book">
        {d.book.map((b) => (
          <li key={b.san}>
            <San>{b.san}</San>
            <small title={b.name}>{b.name || ''}</small>
            <span className="ev">{fmtEv(STUDY.evals.get(b.fen), me)}</span>
          </li>
        ))}
      </ul>
      {judge}
      {k ? (
        <p className="st-cls">
          {'Classificação do app: '}
          <ClsBadge k={k.key} cls="mini" /> <b>{CLS[k.key].label}</b>
          {k.book ? ' (ainda é teoria geral)' : k.loss >= 0.5 ? ` · perda de ${k.loss.toFixed(1)}%` : ''}
        </p>
      ) : !S.engineErr ? (
        <p className="st-cls">Classificação do app: analisando…</p>
      ) : null}
    </>
  );
}
function PracticeBody({ p }: { p: Practice }) {
  const { k, cur } = studyMatch(p);
  const total = Math.max(1, ...cur.map((l) => userPlies(l.length, p.color))),
    done = userPlies(k, p.color);
  const myTurn = S.game.turn() === S.player,
    live = isLive();
  const resumo = `${plural(p.hits, 'acerto', 'acertos')}, ${plural(p.devs, 'desvio', 'desvios')}`;
  let fb: ReactNode,
    cls = '',
    acts: [string, string, boolean?, boolean?][];
  if (p.state === 'dev') {
    cls = 'dev';
    fb = <DevFeedback p={p} />;
    acts = [
      ['retry', 'Tentar de novo', true],
      ['cont', 'Continuar daqui'],
      ['end', 'Encerrar estudo'],
    ];
  } else if (p.state === 'done') {
    cls = 'done';
    fb = (
      <>
        <b>{`Fim das variantes de ${p.name}.`}</b>
        <p>{`Resumo: ${resumo} e ${plural(p.hints, 'dica', 'dicas')}.${myTurn ? ' Se jogar mais um lance, a partida segue contra o bot.' : ''}`}</p>
      </>
    );
    acts = [
      ['again', 'Praticar de novo', true],
      ['cont', 'Continuar contra o bot'],
    ];
  } else if (p.state === 'free') {
    fb = (
      <>
        <b>Prática encerrada.</b>
        <p>{`A partida segue contra o bot pelo motor, sem rating. Placar: ${resumo}, ${plural(p.hints, 'dica', 'dicas')}.`}</p>
      </>
    );
    acts = [['again', 'Praticar de novo', true]];
  } else {
    const last = p.last;
    let head = null;
    if (last && last.kind === 'hit' && last.i >= S.plies.length - 2) {
      cls = 'hit';
      head = (
        <>
          <b>
            {`Lance de livro ✓ ${moveNo(S.positions[last.i] as string)} `}
            <San>{last.san}</San>
          </b>
          {last.name ? <p>{last.name}</p> : null}
        </>
      );
    } else if (last && last.kind === 'hint' && last.i === S.plies.length)
      head = (
        <>
          <b>Dica:</b>
          {` a peça destacada em ${last.sq} tem um lance de livro.`}
        </>
      );
    const st = !live
      ? 'Você está vendo um lance anterior: volte à posição atual para continuar.'
      : myTurn
        ? 'Sua vez: jogue o lance da teoria.'
        : 'O bot responde pela teoria…';
    fb = head ? (
      <>
        {head}
        <p>{st}</p>
      </>
    ) : (
      st
    );
    acts = [
      ['hint', 'Dica', false, !(myTurn && live && !S.botThinking)],
      ['end', 'Encerrar estudo'],
    ];
  }
  const run: Record<string, () => void> = { retry: studyRetry, cont: studyContinue, end: studyEnd, again: studyAgain, hint: studyHint };
  return (
    <>
      <div id="studyPracHead">
        <div className="st-ph">
          <b>{p.name}</b>
          <small>{`Você joga de ${p.color === 'w' ? 'brancas' : 'pretas'} contra o ${S.bot.name} · não vale rating`}</small>
        </div>
        <div className="st-prog">
          <span>{`Lance ${Math.min(done, total)} de ${total} da teoria`}</span>
          <span>{p.state === 'free' ? 'Partida livre' : p.state === 'done' ? 'Variantes concluídas' : ''}</span>
        </div>
        <div className="progress">
          <i style={{ width: `${(Math.min(1, done / total) * 100).toFixed(0)}%` }}></i>
        </div>
        <div className="st-score">
          <span className="ok">
            <b>{p.hits}</b>acertos
          </span>
          <span className="bad">
            <b>{p.devs}</b>desvios
          </span>
          <span>
            <b>{p.hints}</b>dicas
          </span>
        </div>
      </div>
      <div className={'st-fb' + (cls ? ' ' + cls : '')} id="studyFb" role="status" aria-live="polite">
        {fb}
      </div>
      <div className="row st-acts" id="studyActs">
        {acts.map(([act, label, primary, disabled]) => (
          <button key={act} className={primary ? 'btn primary' : 'btn'} data-act={act} disabled={disabled} onClick={run[act]}>
            {label}
          </button>
        ))}
      </div>
    </>
  );
}
function PickBody() {
  const q = STUDY.q.trim(),
    sel = STUDY.sel;
  const groups = groupsFor(STUDY.q);
  return (
    <div id="studyPick">
      {sel ? (
        <div className="st-sel">
          <div className="st-sel-h">
            <b>{sel.title}</b>
            <button className="link-btn" data-act="unsel" onClick={studyUnselect}>
              Trocar
            </button>
          </div>
          <p className="st-pgn">{pgnOf(sel.main.sans)}</p>
          <small>{`Linha principal: ${sel.main.name} · ${sel.names} variante${sel.names === 1 ? '' : 's'} (${sel.lines.length} linha${sel.lines.length === 1 ? '' : 's'} do livro)`}</small>
          <div className="row">
            <button className="btn" data-act="watch" disabled={STUDY.watchBusy} aria-busy={STUDY.watchBusy || undefined} onClick={studyWatch}>
              {STUDY.watchBusy ? 'Preparando…' : 'Ver a linha'}
            </button>
            <button className="btn primary" data-act="prac-w" onClick={() => studyStart('w')}>
              Praticar de brancas
            </button>
            <button className="btn primary" data-act="prac-b" onClick={() => studyStart('b')}>
              Praticar de pretas
            </button>
          </div>
        </div>
      ) : null}
      {!q ? (
        <>
          <p className="st-lab">Populares</p>
          <div className="tutor-chips">
            {STUDY_POPULAR.map((n) => (
              <button key={n} data-q={n} onClick={() => studySearch(n)}>
                {n}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          {!groups.length ? <p className="st-empty">{`Nada no livro para “${q}”. Tente outro nome, como “siciliana” ou “gambito evans”.`}</p> : null}
          {groups.map((g, gi) => {
            const shown = g.vars.slice(0, 6);
            return (
              <div key={g.fam} className="st-fam">
                <button className="st-fam-h" data-g={gi} onClick={() => studySelectGroup(gi)}>
                  {g.fam}
                  <small>{`${g.lines.length} linha${g.lines.length === 1 ? '' : 's'} · ver tudo`}</small>
                </button>
                {shown.map((vg, vi) => (
                  <button key={vi} className="st-var" data-g={gi} data-v={vi} onClick={() => studySelectGroup(gi, vi)}>
                    <b>{vg.v || 'Linha principal'}</b>
                    <span>{shortPgn(mainLine(vg.lines).sans)}</span>
                  </button>
                ))}
                {g.vars.length > shown.length ? (
                  <div className="st-more">{`+${g.vars.length - shown.length} variantes: refine a busca ou escolha a família inteira`}</div>
                ) : null}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
function ExplorerBody() {
  const v = explorerView();
  const active = UI.study && STUDY.expOpen;
  // pede as avaliações quando a posição muda, o explorador abre ou o painel abre
  useEffect(() => {
    if (active) explorerEvals(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.key, active]);
  const head = (
    <p className="xp-pos">
      <IconBook />
      <span>{`${v.idx === 0 ? 'Posição inicial' : v.name || 'Sem nome no livro'} · ${moveNo(v.fen)} ${stm(v.fen) === 'w' ? 'brancas' : 'pretas'} jogam`}</span>
    </p>
  );
  if (!v.moves.length) {
    const e = expEval(v.fen);
    let ref;
    if (v.term) ref = 'Fim de jogo nesta posição.';
    else if (v.hide) ref = 'Melhor lance do Stockfish escondido no modo normal até o fim da partida.';
    else if (!e) ref = 'Melhor lance do Stockfish: …';
    else if (e.err || !e.best) ref = 'O Stockfish não respondeu nesta posição.';
    else
      ref = (
        <>
          {'Melhor lance do Stockfish (referência): '}
          <b className="san">{uciToSan(v.fen, e.best)}</b>
          {` · ${fmtEv(e)} (+ = brancas melhor)`}
        </>
      );
    return (
      <div id="studyExp">
        {head}
        <p className="xp-off">
          <b>Posição fora do livro</b>
          {v.fromStart ? null : <small>A partida não começou da posição inicial.</small>}
        </p>
        <p className="note" id="xpRef">
          {ref}
        </p>
      </div>
    );
  }
  const max = v.moves[0]!.n;
  return (
    <div id="studyExp">
      {head}
      <div className="xp-head" aria-hidden="true">
        <span>Lance</span>
        <span>Leva a</span>
        <span className="xp-pop-h">Linhas</span>
        <span></span>
        <span title="Avaliação do Stockfish depois do lance (+ = vantagem das brancas)">Aval.</span>
      </div>
      <ol className="xp-list">
        {v.moves.map((m, i) => (
          <li key={m.san}>
            <button className="xp-row" data-i={i} title={m.name || ''} onClick={() => studyExpClick(i)}>
              <span className="san">{`${moveNo(v.fen)} ${m.san}`}</span>
              <span className="xp-name">{m.name || '—'}</span>
              <span className="xp-pop" aria-hidden="true">
                <i style={{ width: `${Math.max(4, (m.n / max) * 100).toFixed(0)}%` }}></i>
              </span>
              <span className="xp-n" aria-label={`${m.n} linhas do livro`}>
                {m.n}
              </span>
              <span className="xp-ev">{v.hide ? '—' : fmtEv(expEval(m.fen))}</span>
            </button>
          </li>
        ))}
      </ol>
      <p className="note">
        {(v.hide ? 'Avaliações escondidas no modo normal até o fim da partida. ' : '') +
          (v.play
            ? 'Clique num lance para destacá-lo no tabuleiro (ele não é jogado por você).'
            : 'Clique num lance para jogá-lo no tabuleiro (ou avançar, se for o lance da partida).')}
      </p>
    </div>
  );
}
export function StudyPanel() {
  useGameView();
  const p = studyPractice();
  return (
    <section className="card study" id="study" hidden={!UI.study} aria-labelledby="studyTtl" tabIndex={-1}>
      <div className="tutor-h">
        <div>
          <h2 id="studyTtl">Estudo de aberturas</h2>
          <small>livro de aberturas e Stockfish, sem IA</small>
        </div>
        <button className="btn icon" id="studyClose" aria-label="Fechar o estudo de aberturas" onClick={() => setStudy(false, true)}>
          ✕
        </button>
      </div>
      <div className="study-body">
        <section className="study-sec" id="studyPractice" hidden={!p} aria-labelledby="stPracTtl">
          <h3 className="study-h3" id="stPracTtl">
            Prática guiada
          </h3>
          {p ? (
            <PracticeBody p={p} />
          ) : (
            <>
              <div id="studyPracHead"></div>
              <div className="st-fb" id="studyFb" role="status" aria-live="polite"></div>
              <div className="row st-acts" id="studyActs"></div>
            </>
          )}
          <p className="note">No estudo as classificações aparecem na hora, mesmo no modo normal. A partida de prática não vale rating.</p>
        </section>
        <details
          className="study-sec"
          id="studyPickBox"
          open={STUDY.pickOpen}
          onToggle={(e) => {
            STUDY.pickOpen = e.currentTarget.open;
          }}
        >
          <summary>Escolher a abertura</summary>
          <input
            className="admin-search study-q"
            id="studyQ"
            type="search"
            placeholder="Ex.: italiana, najdorf, gambito evans"
            aria-label="Buscar abertura ou variante"
            maxLength={80}
            autoComplete="off"
            ref={(el) => {
              REFS.studyQ = el;
            }}
            onInput={(e) => studyQInput(e.currentTarget.value)}
          />
          <PickBody />
        </details>
        <details
          className="study-sec"
          id="studyExpBox"
          open={STUDY.expOpen}
          onToggle={(e) => {
            const open = e.currentTarget.open;
            if (open === STUDY.expOpen) return;
            STUDY.expOpen = open;
            publish('board');
          }}
        >
          <summary>Explorador de livro</summary>
          {gameReady() ? <ExplorerBody /> : <div id="studyExp"></div>}
        </details>
      </div>
    </section>
  );
}
