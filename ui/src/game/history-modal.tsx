// Modal "Histórico de partidas" do Tabuleiro: filtro, lista (abrir e excluir em dois cliques) e os exemplos do artifact.
// Esc fecha pelo atalho de board/style-picker.ts (na ordem de sempre); clique no fundo também fecha.
import { HistItem } from '../react/hist-item';
import { useGameView } from '../react/hooks';
import { HIST, closeHistory, histDelete, histEmptyText, openGameById, setHistFilter, type HistFilter } from './history';
import { clearMocks, loadMocks } from './mocks';
import { UI } from './ui-state';

const FILTERS: [HistFilter, string][] = [
  ['todas', 'Todas'],
  ['andamento', 'Em andamento'],
  ['concluida', 'Concluídas'],
];
function HistList() {
  if (!HIST.games)
    return (
      <ul className="hist-list" id="histList">
        {HIST.asked ? <li className="hist-empty">Carregando…</li> : null}
      </ul>
    );
  const list = HIST.games.filter((g) => HIST.filter === 'todas' || g.status === HIST.filter);
  const empty = histEmptyText(list);
  return (
    <ul className="hist-list" id="histList">
      {empty ? (
        <li className="hist-empty">{empty}</li>
      ) : (
        list.map((r) => (
          <HistItem key={r.id} rec={r} onOpen={(id) => openGameById(id)} onDelete={(rec) => histDelete(rec.id)} del={HIST.del[r.id] || null} />
        ))
      )}
    </ul>
  );
}
export function HistoryModal() {
  useGameView();
  return (
    <div
      className="modal"
      id="historyModal"
      hidden={!UI.history}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).id === 'historyModal') closeHistory();
      }}
    >
      <div className="card modal-card" role="dialog" aria-modal="true" aria-labelledby="histTtl" tabIndex={-1}>
        <div className="drawer-h">
          <h2 id="histTtl">Histórico de partidas</h2>
          <button className="btn icon" id="histClose" aria-label="Fechar" onClick={closeHistory}>
            ✕
          </button>
        </div>
        <div className="hist-tools">
          <div className="seg" id="histFilter" role="group" aria-label="Filtrar partidas">
            {FILTERS.map(([f, label]) => (
              <button key={f} data-f={f} aria-pressed={HIST.filter === f} onClick={() => setHistFilter(f)}>
                {label}
              </button>
            ))}
          </div>
          <div className="hist-legend" aria-hidden="true">
            <span className="st-andamento">
              <i></i>Em andamento
            </span>
            <span className="st-vitoria">
              <i></i>Vitória
            </span>
            <span className="st-derrota">
              <i></i>Derrota
            </span>
            <span className="st-empate">
              <i></i>Empate
            </span>
            <span className="st-neutra">
              <i></i>Outras
            </span>
          </div>
        </div>
        <HistList />
        <div className="row hist-foot">
          <span className="note" style={{ margin: 0 }} id="histNote">
            Toda partida é salva sozinha a cada lance. As em andamento continuam de onde pararam; as concluídas abrem só para revisão.
          </span>
          <span className="row" style={{ margin: 0 }} id="mockBtns" hidden={!UI.mockBtns}>
            <button className="btn" id="mockLoad" onClick={() => loadMocks()}>
              Carregar exemplos
            </button>
            <button className="btn" id="mockClear" onClick={clearMocks}>
              Remover exemplos
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
