// Item da lista de partidas (Início, página Histórico e modal de histórico do tabuleiro), a partir de histItemView
// (game/history.ts). data-open e data-del ficam no HTML como antes.
import { GLYPH } from '../board/pieces';
import { histItemView } from '../game/history';
import type { GameRecord } from '../store/types';

export interface HistItemProps {
  rec: GameRecord;
  onOpen: (id: string) => void;
  /** sem onDelete, o item não tem o botão Excluir */
  onDelete?: (rec: GameRecord, btn: HTMLButtonElement) => void;
  /** estado do Excluir em dois cliques (modal de histórico do tabuleiro): armado, gravando ou falhou */
  del?: 'armed' | 'busy' | 'retry' | null;
}
const DEL_LABEL = { armed: 'Confirmar', busy: 'Confirmar', retry: 'Tente de novo' };
export function HistItem({ rec, onOpen, onDelete, del }: HistItemProps) {
  const v = histItemView(rec);
  return (
    <li className={v.cls}>
      <button className="hist-open" data-open={v.id} onClick={() => onOpen(v.id)}>
        <span className={'hist-ico ' + v.ico} aria-hidden="true">
          {GLYPH.k}
        </span>
        <span className="hist-main">
          <b>
            {v.title}
            {v.mock ? <span className="mock-tag">exemplo</span> : null}
          </b>
          <small>{v.meta}</small>
          {v.detail ? (
            <small>
              {v.detail.text}
              {v.detail.rating ? (
                <>
                  {' · '}
                  <span className={v.detail.rating.cls}>{v.detail.rating.text}</span>
                </>
              ) : v.detail.rated ? (
                ' · vale rating'
              ) : null}
            </small>
          ) : null}
        </span>
        <span className="hist-side">
          <span className="chip">{v.label}</span>
          <span className="hist-act">{v.act}</span>
        </span>
      </button>
      {onDelete ? (
        <button
          className={del ? 'hist-del armed' : 'hist-del'}
          data-del={v.id}
          aria-label={`Excluir ${v.title}`}
          disabled={del === 'busy'}
          onClick={(e) => onDelete(rec, e.currentTarget)}
        >
          {del ? DEL_LABEL[del] : 'Excluir'}
        </button>
      ) : null}
    </li>
  );
}
