// Topo da página: botão da gaveta (desktop estreito), marca, Aberturas, Tutor IA, rating, "Nova partida" (dropdown
// com nível do bot, cor e profundidade) e o menu ⋮ (modo de jogo e PGN). Controles só do jogo têm a classe game-only.
import { BOTS } from '../core/constants';
import { recommendBot } from '../core/rating';
import { S } from '../core/state';
import { SIDEBAR, toggleSide } from '../desktop/sidebar';
import { useGameView, useShellView } from '../react/hooks';
import { toggleStudy } from '../study/panel';
import { toggleTutor } from '../tutor/tutor';
import { pickBot, pickColor, setDepth, setGameMode, startClick } from './controls';
import { toggleMenu, toggleNewPop, togglePgn } from './menus';
import { RATING, RATING_UI } from './rating';
import { UI } from './ui-state';

const BOOK_PATH =
  'M2.5 5.2c0-.7.5-1.2 1.2-1.2 2.9 0 5.4.8 7.3 2.3v13.4c-1.9-1.3-4.4-2-7.3-2-.7 0-1.2-.5-1.2-1.2V5.2zm19 0v11.3c0 .7-.5 1.2-1.2 1.2-2.9 0-5.4.7-7.3 2V6.3c1.9-1.5 4.4-2.3 7.3-2.3.7 0 1.2.5 1.2 1.2z';
const CHAT_PATH = 'M12 3a8 8 0 0 0-6.9 12.1L4 20l4.9-1.1A8 8 0 1 0 12 3zm-4 7.5h8v1.6H8v-1.6zm0-3h8v1.6H8V7.5zm0 6h5v1.6H8v-1.6z';

function RecNote() {
  const rec = recommendBot(RATING.rating);
  return (
    <p className="rec-note" id="recNote">
      {'Seu rating: '}
      <b>{RATING.rating}</b>
      {'. Recomendado: '}
      <b>{rec.level}</b>
      {` (≈${rec.elo}). `}
      {S.gameMode === 'normal' ? (
        'A partida vale rating (modo normal).'
      ) : (
        <>
          <span className="warn">Modo assistido: esta partida não vale rating.</span>
          {' Para valer, troque para o modo normal no menu ⋮.'}
        </>
      )}
    </p>
  );
}
function NewGamePop() {
  const rec = recommendBot(RATING.rating);
  const open = UI.drawer === 'newGame';
  return (
    <div className="pop-anchor game-only">
      <button className="btn primary" id="openNew" aria-expanded={open} aria-controls="newGame" aria-haspopup="dialog" onClick={toggleNewPop}>
        Nova partida
      </button>
      <section className="card pop" id="newGame" hidden={!open} role="dialog" aria-labelledby="newGameTtl" tabIndex={-1}>
        <h2 id="newGameTtl">Nova partida</h2>
        <RecNote />
        <div className="field">
          <span className="lab">Nível do bot</span>
          <div className="bots" id="bots">
            {BOTS.map((b) => (
              <button
                key={b.id}
                className={'bot' + (b.id === 'none' ? ' bot-none' : '') + (b.id === rec.id ? ' recommended' : '')}
                data-id={b.id}
                aria-pressed={b.id === S.pickBot.id}
                onClick={() => pickBot(b.id)}
              >
                <b>{b.level}</b>
                <span>{(b.elo ? '≈' + b.elo + ' · ' : '') + b.desc}</span>
                {b.id === rec.id ? <em className="rec">Recomendado</em> : null}
              </button>
            ))}
          </div>
        </div>
        <div className="pop-grid">
          <div className="field">
            <span className="lab">Suas peças</span>
            <div className="seg" id="colorSeg">
              {(
                [
                  ['w', 'Brancas'],
                  ['b', 'Pretas'],
                  ['r', 'Sorteio'],
                ] as const
              ).map(([v, label]) => (
                <button key={v} data-v={v} aria-pressed={UI.color === v} onClick={() => pickColor(v)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="depthSel">Profundidade da análise</label>
            <select id="depthSel" className="btn" value={S.depth} onChange={(e) => setDepth(e.target.value)}>
              <option value="fast">Rápida (≈0,8 s por lance)</option>
              <option value="normal">Normal (≈1,5 s por lance)</option>
              <option value="deep">Profunda (≈3 s por lance)</option>
            </select>
          </div>
        </div>
        <div className="row">
          <button className="btn primary" id="btnStart" onClick={startClick}>
            Começar partida
          </button>
        </div>
      </section>
    </div>
  );
}
function MenuPop() {
  const review = S.mode === 'review';
  return (
    <div className="pop-anchor game-only">
      <button
        className="btn icon menu-btn"
        id="openMenu"
        aria-label="Mais opções"
        aria-haspopup="dialog"
        aria-expanded={UI.menu}
        aria-controls="menuPop"
        onClick={toggleMenu}
      >
        <svg viewBox="0 0 4 16" width="4" height="16" aria-hidden="true">
          <circle cx="2" cy="2" r="1.6" fill="currentColor" />
          <circle cx="2" cy="8" r="1.6" fill="currentColor" />
          <circle cx="2" cy="14" r="1.6" fill="currentColor" />
        </svg>
      </button>
      <section className="card pop menu-pop" id="menuPop" hidden={!UI.menu} role="dialog" aria-label="Mais opções" tabIndex={-1}>
        <label className="menu-field" htmlFor="modeSel">
          <span className="lab">Modo de jogo</span>
          <select
            id="modeSel"
            className="btn"
            value={S.gameMode}
            disabled={review}
            title={review ? 'Partidas importadas por PGN são sempre avaliadas' : ''}
            onChange={(e) => setGameMode(e.target.value)}
          >
            <option value="normal">Normal (avaliação no fim)</option>
            <option value="assistido">Assistido (avaliação a cada lance)</option>
          </select>
        </label>
        <hr className="menu-sep" />
        <button className="menu-item" id="openPgn" aria-expanded={UI.drawer === 'pgnBox'} aria-controls="pgnBox" onClick={togglePgn}>
          Analisar uma partida (PGN)
        </button>
      </section>
    </div>
  );
}
export function TopBar() {
  useGameView();
  useShellView();
  return (
    <header className="top">
      <button
        className="btn icon side-open-btn"
        id="openSide"
        aria-label="Abrir menu"
        aria-controls="sidebar"
        aria-expanded={SIDEBAR.open}
        onClick={toggleSide}
      >
        <svg className="side-ico" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 6.5h16M4 12h16M4 17.5h16" />
        </svg>
      </button>
      <div className="brand">
        <span className="logo" aria-hidden="true">
          ♞
        </span>
        <h1>Lance a Lance</h1>
      </div>
      <p>Jogue contra bots e veja cada lance avaliado pelo Stockfish, do brilhante à capivarada.</p>
      <nav className="actions" aria-label="Ações">
        <button className="btn study-btn game-only" id="openStudy" aria-expanded={UI.study} aria-controls="study" onClick={toggleStudy}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path fill="currentColor" d={BOOK_PATH} />
          </svg>
          Aberturas
        </button>
        <button className="btn tutor-btn game-only" id="openTutor" aria-expanded={UI.tutor} aria-controls="tutor" onClick={toggleTutor}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path fill="currentColor" d={CHAT_PATH} />
          </svg>
          Tutor IA
        </button>
        <span className="rating-pill game-only" id="ratingPill" title="Seu rating. Só partidas contra bot no modo normal alteram o rating.">
          Rating <b id="ratingVal">{RATING_UI.shown}</b>
        </span>
        <NewGamePop />
        <MenuPop />
      </nav>
    </header>
  );
}
