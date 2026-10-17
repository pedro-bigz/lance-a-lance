/* ---------- Tabuleiro (componente) ----------
   Casas, peças, marcações (último lance, xeque, seleção, dica do estudo), setas e a escolha da promoção, a partir de S.
   Cada casa tem a chave da própria casa e a peça a chave da cor e do tipo: um redesenho no meio de uma animação mantém
   os mesmos nós (as animações de board/animations.ts e board/capture-fx.ts agem direto neles, pelo REFS). Os
   elementos de efeito que elas põem dentro das casas não são do React e somem sozinhos no fim da animação. */
import { Chess, type PieceType } from 'chess.js';
import { PIECE } from '../core/constants';
import { S, blind, gameReady, viewIdx } from '../core/state';
import { REFS, UI } from '../game/ui-state';
import { useGameView } from '../react/hooks';
import { IconCrown, IconFlag } from '../ui/icons';
import { ClsBadge, Piece } from './badge';
import { cancelPromo, choosePromo, onBoardPointerCancel, onBoardPointerDown, onBoardPointerMove, onBoardPointerUp } from './input';
import { STYLE } from './pieces';
import { arrowsOf, checkSquare, endState } from './render';

function EndBadge({ kind, how }: { kind: 'win' | 'lose'; how: 'mate' | 'resign' }) {
  if (kind === 'win')
    return (
      <span className="end-badge win" title="Venceu">
        <IconCrown />
      </span>
    );
  return how === 'resign' ? (
    <span className="end-badge lose" title="Desistiu">
      <IconFlag />
    </span>
  ) : (
    <span className="end-badge lose" title="Xeque-mate">
      #
    </span>
  );
}

function Squares() {
  const ref = (el: HTMLDivElement | null) => {
    REFS.squares = el;
  };
  if (!gameReady()) return <div className="squares" id="squares" ref={ref}></div>;
  const idx = viewIdx(),
    fen = S.positions[idx] as string,
    c = new Chess(fen),
    rows = c.board();
  const last = idx > 0 ? S.plies[idx - 1] : null;
  const k = idx > 0 ? S.cls[idx - 1] : null;
  const chk = checkSquare(c);
  const mark = S.studyMark && S.studyMark.fen === fen ? S.studyMark : null;
  const end = endState(c, idx);
  const hide = blind();
  const out = [];
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const f = S.orient === 'w' ? x : 7 - x,
        r = S.orient === 'w' ? 8 - y : y + 1;
      const sq = 'abcdefgh'[f] + r,
        p = (rows[8 - r] as (typeof rows)[number])[f];
      const cl = ['sq', (f + r) % 2 ? 'd' : 'l'];
      if (last && (sq === last.from || sq === last.to)) cl.push('last');
      if (sq === S.selected) cl.push('sel');
      if (sq === chk) cl.push('chk');
      if (mark && sq === mark.from) cl.push('hint');
      out.push(
        <div key={sq} className={cl.join(' ')} data-sq={sq}>
          {x === 0 ? <span className="coord r">{r}</span> : null}
          {y === 7 ? <span className="coord f">{'abcdefgh'[f]}</span> : null}
          {p ? <Piece key={p.color + p.type} type={p.type} color={p.color} fallen={!!end && p.type === 'k' && p.color === end.loser} /> : null}
          {end && p && p.type === 'k' ? <EndBadge kind={p.color === end.loser ? 'lose' : 'win'} how={end.how} /> : null}
          {S.targets.includes(sq) ? p ? <span className="ring"></span> : <span className="dot"></span> : null}
          {k && last && sq === last.to && !hide ? <ClsBadge k={k.key} cls="badge-sq" /> : null}
        </div>,
      );
    }
  return (
    <div className="squares" id="squares" ref={ref}>
      {out}
    </div>
  );
}

function Arrows() {
  return (
    <svg className="arrows" id="arrows" viewBox="0 0 8 8" aria-hidden="true">
      {(gameReady() ? arrowsOf() : []).map((a, i) => (
        <g key={i} opacity=".82">
          <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke={a.color} strokeWidth=".2" strokeLinecap="round" />
          <polygon points={a.points} fill={a.color} />
        </g>
      ))}
    </svg>
  );
}

function Promo() {
  const pr = UI.promo;
  return (
    <div
      className="promo"
      id="promo"
      hidden={!pr}
      onClick={(e) => {
        if ((e.target as HTMLElement).id === 'promo') cancelPromo();
      }}
    >
      <div className="opts" id="promoOpts">
        {pr
          ? (['q', 'r', 'b', 'n'] as PieceType[]).map((t) => (
              <button key={t} data-p={t} aria-label={PIECE[t][1]} onClick={() => choosePromo(t)}>
                <Piece type={t} color={pr.color} />
              </button>
            ))
          : null}
      </div>
    </div>
  );
}

export function Board() {
  useGameView();
  return (
    <div
      className="board"
      id="board"
      data-board={STYLE.board}
      data-pieces={STYLE.pieces}
      ref={(el) => {
        REFS.board = el;
      }}
      onPointerDown={onBoardPointerDown}
      onPointerMove={onBoardPointerMove}
      onPointerUp={onBoardPointerUp}
      onPointerCancel={onBoardPointerCancel}
    >
      <Squares />
      <Arrows />
      <Promo />
    </div>
  );
}
