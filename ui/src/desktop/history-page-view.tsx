/* ---------- Histórico (view historico): ilha React ----------
   Filtros, lista paginada, "Carregar mais", estados vazio/erro e o diálogo de exclusão. Recarrega do início ao abrir a
   tela e quando uma partida gravada muda a lista (tópico 'tela:historico'). */
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { S } from '../core/state';
import { RESULT_UI, openGameById, recTitle, renderHistCount } from '../game/history';
import { GameStore } from '../store/game-store';
import type { GameRecord } from '../store/types';
import { fmtDate } from '../ui/format';
import { viewToast } from '../ui/toast';
import { createHistPager, hpCountText, hpFiltered, hpHasMore, type HistPager, type ResultFilter, type StatusFilter } from './history-page';
import { HistItem } from './react/hist-item';
import { useViewRefresh } from './react/hooks';
import { FormMsg, Modal, msgOf, type Msg } from './react/modal';
import { newGameFlow } from './sidebar';

/** o pager da tela (um por app); os testes passam o seu */
export const HIST_PAGER = createHistPager(() => GameStore);

const STATUS: [StatusFilter, string][] = [
  ['todas', 'Todas'],
  ['andamento', 'Em andamento'],
  ['concluida', 'Concluídas'],
];
const RESULTS: [ResultFilter, string][] = [
  ['todos', 'Qualquer resultado'],
  ['vitoria', 'Vitórias'],
  ['derrota', 'Derrotas'],
  ['empate', 'Empates'],
  ['outras', 'Outras'],
];
export function confirmText(r: GameRecord): string {
  const when = fmtDate(r.updatedAt),
    state = r.status === 'andamento' ? 'em andamento' : (RESULT_UI[r.result || 'livre'] || RESULT_UI.livre)[0].toLowerCase();
  return `Excluir a partida ${recTitle(r)} (${state}, ${when})? Ela some do histórico e não pode ser recuperada. A pontuação que ela já deu ou tirou continua valendo.`;
}

export function HistoryPageView({ pager = HIST_PAGER }: { pager?: HistPager }) {
  const H = useSyncExternalStore(pager.subscribe, pager.getSnapshot);
  const refresh = useViewRefresh('historico');
  // useLayoutEffect: o "Carregando…" entra antes de pintar (sem piscar o estado vazio)
  useLayoutEffect(() => {
    if (refresh) pager.load(true);
  }, [refresh, pager]);

  // excluir: confirmação num diálogo da página (confirm() não funciona no artifact e trava a janela no desktop)
  const [deleting, setDeleting] = useState<GameRecord | null>(null); // fica depois de fechar (o texto continua no diálogo)
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [delMsg, setDelMsg] = useState<Msg>(null);
  const [delBusy, setDelBusy] = useState(false);
  const noRef = useRef<HTMLButtonElement>(null);
  const reloadRef = useRef<HTMLButtonElement>(null);
  const returnRef = useRef<HTMLElement | null>(null);
  const openConfirm = (r: GameRecord, btn: HTMLElement | null) => {
    returnRef.current = btn || (document.activeElement as HTMLElement | null);
    setDelMsg(msgOf(''));
    setDeleting(r);
    setConfirmOpen(true);
  };
  const closeConfirm = () => setConfirmOpen(false);
  const confirmDelete = async () => {
    const r = deleting;
    if (!r || !confirmOpen || !GameStore) return;
    setDelBusy(true);
    const ok = await GameStore.remove(r.id).catch(() => false);
    setDelBusy(false);
    if (!ok) {
      setDelMsg(msgOf('Não foi possível excluir a partida agora. Confira sua conexão e tente de novo.'));
      return;
    }
    if (S.gameId === r.id) S.gameId = null;
    pager.removed(r.id);
    returnRef.current = reloadRef.current;
    closeConfirm();
    renderHistCount();
    viewToast(`Partida ${recTitle(r)} excluída.`);
  };

  const list = hpFiltered(H);
  const more = hpHasMore(H);
  const filtered = H.status !== 'todas' || H.result !== 'todos';
  let body;
  if (list.length) body = list.map((r) => <HistItem key={r.id} rec={r} onOpen={openGameById} onDelete={openConfirm} />);
  else if (H.loading) body = <li className="hist-empty">Carregando…</li>;
  else if (H.error && !H.games.length)
    body = (
      <li className="state-box err">
        <span className="ico" aria-hidden="true">
          {'⚠'}
        </span>
        <b>Não foi possível carregar as partidas</b>
        <span>Confira sua conexão e tente de novo.</span>
        <div className="row">
          <button className="btn primary" data-hp-retry="" onClick={() => pager.load(true)}>
            Tentar de novo
          </button>
        </div>
      </li>
    );
  else if (filtered)
    body = (
      <li className="state-box">
        <span className="ico" aria-hidden="true">
          {'♙'}
        </span>
        <b>Nenhuma partida neste filtro</b>
        <span>{more ? 'Pode haver mais partidas antigas.' : 'Troque o filtro para ver as outras.'}</span>
        <div className="row">
          {more ? (
            <button className="btn" data-hp-more="" onClick={() => pager.load(false)}>
              Procurar nas mais antigas
            </button>
          ) : null}
          <button className="btn" data-hp-clear="" onClick={() => pager.clearFilters()}>
            Limpar filtros
          </button>
        </div>
      </li>
    );
  else if (refresh)
    body = (
      <li className="state-box">
        <span className="ico" aria-hidden="true">
          {'♞'}
        </span>
        <b>Nenhuma partida ainda</b>
        <span>Toda partida que você jogar aparece aqui sozinha.</span>
        <div className="row">
          <button className="btn primary" data-home-new="" onClick={newGameFlow}>
            Nova partida
          </button>
        </div>
      </li>
    );
  else body = null; // a tela ainda não foi aberta

  return (
    <>
      <div className="admin-h">
        <div>
          <h2 id="hpTtl">Histórico de partidas</h2>
          <p>Toda partida é salva sozinha. As em andamento continuam de onde pararam; as concluídas abrem para revisão.</p>
        </div>
        <button className="btn" id="hpReload" ref={reloadRef} onClick={() => pager.load(true)}>
          Atualizar
        </button>
      </div>
      <div className="histpage-tools">
        <div className="histpage-filters">
          <div className="seg" id="hpStatus" role="group" aria-label="Situação da partida">
            {STATUS.map(([f, label]) => (
              <button key={f} data-f={f} aria-pressed={H.status === f ? 'true' : 'false'} onClick={() => pager.setStatus(f)}>
                {label}
              </button>
            ))}
          </div>
          <div className="seg" id="hpResult" role="group" aria-label="Resultado">
            {RESULTS.map(([r, label]) => (
              <button key={r} data-r={r} aria-pressed={H.result === r ? 'true' : 'false'} onClick={() => pager.setResult(r)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <span className="histpage-count" id="hpCount" aria-live="polite">
          {hpCountText(H)}
        </span>
      </div>
      <FormMsg
        id="hpMsg"
        msg={
          refresh
            ? msgOf(
                H.error && H.games.length
                  ? 'Não foi possível conectar ao servidor: aparecem só as partidas que ainda estão na fila deste computador.'
                  : '',
              )
            : null
        }
        role="status"
      />
      <ul className="hist-list" id="hpList">
        {body}
      </ul>
      <div className="histpage-more" id="hpMoreWrap" hidden={!list.length || !more || !!H.error}>
        <button className="btn" id="hpMore" disabled={H.loading} onClick={() => pager.load(false)}>
          {H.loading && list.length ? 'Carregando…' : 'Carregar mais'}
        </button>
      </div>
      <Modal id="gameConfirmModal" open={confirmOpen} onClose={closeConfirm} initialFocus={noRef} returnFocus={returnRef}>
        <div
          className="card modal-card confirm-card"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="gameConfirmTtl"
          aria-describedby="gameConfirmTxt"
          tabIndex={-1}
        >
          <h2 id="gameConfirmTtl">Excluir partida</h2>
          <p id="gameConfirmTxt">{deleting ? confirmText(deleting) : ''}</p>
          <FormMsg id="gameConfirmMsg" msg={delMsg} role="alert" />
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 0 }}>
            <button className="btn" id="gameConfirmNo" ref={noRef} onClick={closeConfirm}>
              Cancelar
            </button>
            <button
              className="btn danger-solid"
              id="gameConfirmYes"
              disabled={delBusy}
              aria-busy={delBusy ? 'true' : undefined}
              onClick={confirmDelete}
            >
              {delBusy ? 'Excluindo…' : 'Excluir partida'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
