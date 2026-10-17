// Conteúdo da tela do jogo (section data-view="jogo"): gaveta do PGN, tabuleiro com jogadores e navegação, painel
// (estudo, treinador, lances, relatório, histórico, legenda) e o rodapé de estilo.
import { Board } from '../board/board';
import { StylePicker } from '../board/style-picker-view';
import { useGameView } from '../react/hooks';
import { StudyPanel } from '../study/study-panel';
import { analyzePgn, loadSample, pgnFileChosen } from './controls';
import { openHistory } from './history';
import { setDrawer } from './menus';
import { Coach, EvalBar, Legend, MovesCard, NavBar, PlayerBar, Report } from './panels';
import { REFS, UI } from './ui-state';

function PgnDrawer() {
  useGameView();
  return (
    <section className="card drawer" id="pgnBox" hidden={UI.drawer !== 'pgnBox'} aria-label="Analisar uma partida">
      <div className="drawer-h">
        <h2>Analisar uma partida (PGN)</h2>
        <button className="btn icon" data-close="" aria-label="Fechar" onClick={() => setDrawer(null)}>
          ✕
        </button>
      </div>
      <div className="field">
        <label htmlFor="pgnIn">Cole o PGN</label>
        <textarea
          id="pgnIn"
          spellCheck={false}
          placeholder="1. e4 e5 2. Nf3 Nc6 3. Bb5 …"
          ref={(el) => {
            REFS.pgnIn = el;
          }}
        ></textarea>
      </div>
      <div className="row">
        <button className="btn primary" id="btnPgn" onClick={analyzePgn}>
          Analisar partida
        </button>
        <button className="btn" id="btnSample" onClick={loadSample}>
          Exemplo: Morphy, 1858
        </button>
        <label className="btn" htmlFor="pgnFile">
          Abrir arquivo .pgn
        </label>
        <input
          type="file"
          id="pgnFile"
          accept=".pgn,.txt,application/x-chess-pgn,text/plain"
          hidden
          onChange={(e) => pgnFileChosen(e.currentTarget)}
        />
      </div>
      <p className="note">Também dá para arrastar um arquivo .pgn para cima do tabuleiro.</p>
      <div className="err" id="pgnErr" hidden={!UI.pgnErr}>
        {UI.pgnErr}
      </div>
    </section>
  );
}
function HistoryButton() {
  useGameView();
  return (
    <button className="btn history-btn game-only" id="openHistory" aria-haspopup="dialog" aria-controls="historyModal" onClick={openHistory}>
      Histórico de partidas{' '}
      <span className="count" id="histCount">
        {UI.histCount}
      </span>
    </button>
  );
}
export function GameView() {
  return (
    <>
      <PgnDrawer />
      <main className="layout">
        <section className="stage" aria-label="Tabuleiro">
          <PlayerBar top={true} />
          <div className="board-wrap">
            <EvalBar />
            <Board />
          </div>
          <PlayerBar top={false} />
          <NavBar />
        </section>
        <aside className="panel">
          <StudyPanel />
          <Coach />
          <MovesCard />
          <Report />
          <HistoryButton />
          <Legend />
        </aside>
      </main>
      <StylePicker />
    </>
  );
}
