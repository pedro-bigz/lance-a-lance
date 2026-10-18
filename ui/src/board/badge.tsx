// Peça e selo de classificação como componentes (o mesmo HTML de antes: <span class="pc w">♚</span>, a imagem nos
// conjuntos ilustrados, e o selo colorido com o símbolo da classificação)
import type { Color, PieceType } from 'chess.js';
import { CLS, type ClsKey } from '../core/constants';
import { IconBook } from '../ui/icons';
import { IMG_SETS, STYLE, glyph } from './pieces';

export function Piece({ type, color, pieces = STYLE.pieces, fallen }: { type: PieceType; color: Color; pieces?: string; fallen?: boolean }) {
  const cls = 'pc ' + (fallen ? 'fallen ' : '') + color;
  if (IMG_SETS.has(pieces))
    return (
      <span className={cls + ' img'}>
        <img src={`pieces/${pieces}/${color}${type}.webp`} alt="" draggable={false} />
      </span>
    );
  return <span className={cls}>{glyph(type, color, pieces)}</span>;
}
/** selo da classificação; cls é 'mini' (lista, relatório, legenda) ou 'badge-sq' (casa do último lance) */
export function ClsBadge({ k, cls }: { k: ClsKey; cls: string }) {
  const c = CLS[k];
  return (
    <span className={cls} style={{ background: `var(--c-${k})` }} title={c.label}>
      {k === 'livro' ? <IconBook /> : c.sym}
    </span>
  );
}
/** símbolo grande do cartão do treinador */
export const ClsSym = ({ k }: { k: ClsKey }) => (k === 'livro' ? <IconBook /> : <>{CLS[k].sym}</>);
