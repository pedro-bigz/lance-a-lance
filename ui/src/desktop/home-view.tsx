/* ---------- Início (view inicio): componente ----------
   Recarrega ao abrir a tela e quando uma partida gravada muda o que ela mostra (tópico 'tela:inicio'). Enquanto
   recarrega, mostra os dados anteriores; "Carregando…" só aparece na primeira vez. */
import { useLayoutEffect, useState } from 'react';
import { recommendBot } from '../core/rating';
import { STYLE } from '../board/pieces';
import { openGameById } from '../game/history';
import { RATING } from '../game/rating';
import type { ListResult } from '../store/game-store';
import type { PlayerStats } from '../types/api';
import { fmtDate, fmtNum } from '../ui/format';
import { ACCOUNT } from './account';
import {
  applyHomeStats,
  continueMeta,
  findContinue,
  greeting,
  homeDate,
  homeSummary,
  loadHomeMain,
  miniBoardSquares,
  openContinue,
  type Continue,
} from './home';
import { HistItem } from '../react/hist-item';
import { useLatest, useViewRefresh } from '../react/hooks';
import { FormMsg, msgOf, type Msg } from '../react/modal';
import { newGameFlow } from './sidebar';

function MiniBoard({ fen, orient }: { fen: string; orient: 'w' | 'b' }) {
  return (
    <div className="mini-board" data-board={STYLE.board} data-pieces={STYLE.pieces} aria-hidden="true">
      {miniBoardSquares(fen, orient).map((sq, i) => (
        <i key={i} className={sq.cls} dangerouslySetInnerHTML={{ __html: sq.piece }} />
      ))}
    </div>
  );
}
function ContinueCard({ cont }: { cont: 'loading' | 'none' | Continue | null }) {
  const head = (link: boolean) => (
    <div className="home-card-h">
      <h2>Partida em andamento</h2>
      {link ? <a href="#/historico">Ver todas</a> : null}
    </div>
  );
  if (cont === 'loading')
    return (
      <>
        {head(false)}
        <div className="home-continue-body">
          <div className="mini-board skel"></div>
          <div>
            <small>Carregando…</small>
          </div>
        </div>
      </>
    );
  if (cont === 'none')
    return (
      <>
        {head(false)}
        <div className="home-continue-body">
          <div className="state-box">
            <span className="ico" aria-hidden="true">
              {'♘'}
            </span>
            <b>Nenhuma partida contra bot em andamento</b>
            <span>Comece uma agora: o nível recomendado já vem marcado.</span>
            <div className="row">
              <button className="btn primary" data-home-new="" onClick={newGameFlow}>
                Nova partida
              </button>
            </div>
          </div>
        </div>
      </>
    );
  if (!cont) return null;
  return (
    <>
      {head(!cont.current)}
      <div className="home-continue-body">
        {cont.fen ? <MiniBoard fen={cont.fen} orient={cont.orient === 'b' ? 'b' : 'w'} /> : <div className="mini-board skel"></div>}
        <div>
          <span className="live-tag">{cont.current ? 'No tabuleiro agora' : 'Em andamento'}</span>
          <h3>{cont.title}</h3>
          <small>{continueMeta(cont)}</small>
          {cont.opening ? <small>{cont.opening}</small> : null}
          {cont.updatedAt ? <small>Último lance: {fmtDate(cont.updatedAt)}</small> : null}
          <div className="row">
            <button className="btn primary" id="homeContinueBtn" data-cont={cont.current ? '' : cont.id} onClick={() => openContinue(cont)}>
              Continuar partida
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
function SummaryCard({ s, failed }: { s: PlayerStats | null; failed: boolean }) {
  const v = homeSummary(s, failed);
  return (
    <>
      <div className="home-card-h">
        <h2>Seu resumo</h2>
        <a href="#/estatisticas">Estatísticas →</a>
      </div>
      <div className="wdl">
        <div className="st-vitoria">
          <span>Vitórias</span>
          <b>{v.wins}</b>
        </div>
        <div className="st-derrota">
          <span>Derrotas</span>
          <b>{v.losses}</b>
        </div>
        <div className="st-empate">
          <span>Empates</span>
          <b>{v.draws}</b>
        </div>
      </div>
      {v.bar ? (
        <div className="wdl-bar" aria-hidden="true">
          <i className="st-vitoria" style={{ width: `${v.bar.w}%` }}></i>
          <i className="st-empate" style={{ width: `${v.bar.d}%` }}></i>
          <i className="st-derrota" style={{ width: `${v.bar.l}%` }}></i>
        </div>
      ) : (
        <div className="wdl-bar" aria-hidden="true"></div>
      )}
      <p className="home-sum-note">{v.note}</p>
    </>
  );
}

export function HomeView() {
  const refresh = useViewRefresh('inicio');
  const begin = useLatest();
  const [now, setNow] = useState<Date | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [summary, setSummary] = useState<{ s: PlayerStats | null; failed: boolean } | null>(null);
  const [recent, setRecent] = useState<'loading' | ListResult | null>(null);
  const [cont, setCont] = useState<'loading' | 'none' | Continue | null>(null);

  // useLayoutEffect: os "Carregando…" da primeira vez entram antes de pintar
  useLayoutEffect(() => {
    if (!refresh || !ACCOUNT.user) return;
    const isCurrent = begin();
    // valores na hora de abrir a tela (o que já existe fica até chegar o novo)
    /* eslint-disable react-hooks/set-state-in-effect */
    setNow(new Date());
    setRating(RATING.rating);
    setRecent((r) => r || 'loading');
    setCont((c) => c || 'loading');
    setSummary((s) => s || { s: null, failed: false });
    /* eslint-enable react-hooks/set-state-in-effect */
    (async () => {
      const main = await loadHomeMain();
      if (!isCurrent()) return;
      if (main.stats) applyHomeStats(main.stats);
      setRating(RATING.rating);
      setSummary({ s: main.stats, failed: main.statsFailed });
      setMsg(
        msgOf(
          main.recent.error ? 'Não foi possível conectar ao servidor: o resumo pode estar incompleto. Confira sua conexão e volte ao Início.' : '',
        ),
      );
      setRecent(main.recent);
      const c = await findContinue(main.ongoing, isCurrent);
      if (c === undefined || !isCurrent()) return;
      setCont(c || 'none');
    })();
  }, [refresh, begin]);

  const user = ACCOUNT.user;
  const rec = rating != null ? recommendBot(rating) : null;
  return (
    <>
      <div className="card home-hero">
        <div>
          <span className="eyebrow" id="homeDate">
            {now ? homeDate(now) : ''}
          </span>
          <h2 id="homeHello">{now && user ? `${greeting(now)}, ${user.first_name}` : 'Olá'}</h2>
          <p id="homeSub">Jogue contra um bot e veja cada lance avaliado pelo Stockfish, do brilhante à capivarada.</p>
          <div className="home-cta">
            <button className="btn primary" id="homeNew" onClick={newGameFlow}>
              Nova partida
            </button>
            <a className="btn" href="#/estatisticas">
              Ver estatísticas
            </a>
          </div>
        </div>
        <div className="home-rating" aria-live="polite">
          <span className="lab">Sua pontuação</span>
          <b id="homeRating">{rating != null ? fmtNum(rating) : '—'}</b>
          <small id="homeRec">{rec ? `Bot recomendado: ${rec.level} (≈${rec.elo})` : ''}</small>
        </div>
      </div>
      <FormMsg id="homeMsg" msg={msg} role="status" />
      <div className="home-grid">
        <div className={'card home-continue' + (cont === 'none' ? ' empty' : '')} id="homeContinue">
          <ContinueCard cont={cont} />
        </div>
        <div className="card home-sum" id="homeSummary">
          {summary ? <SummaryCard s={summary.s} failed={summary.failed} /> : null}
        </div>
      </div>
      <div className="card home-recent">
        <div className="home-card-h">
          <h2>Últimas partidas</h2>
          <a href="#/historico">Ver histórico completo →</a>
        </div>
        <ul className="hist-list" id="homeRecent">
          {recent === 'loading' ? (
            <li className="hist-empty">Carregando…</li>
          ) : recent ? (
            recent.games.length ? (
              recent.games.slice(0, 5).map((r) => <HistItem key={r.id} rec={r} onOpen={openGameById} />)
            ) : (
              <li className="hist-empty">
                {recent.error ? 'Não foi possível carregar as partidas agora.' : 'Nenhuma partida ainda. Comece uma e ela aparece aqui sozinha.'}
              </li>
            )
          ) : null}
        </ul>
      </div>
    </>
  );
}
