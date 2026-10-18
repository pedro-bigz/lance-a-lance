// Rodapé do tabuleiro: botão e painel "Estilo do tabuleiro e peças" (tabuleiro, peças e animação de captura)
import { UI } from '../game/ui-state';
import { useGameView } from '../react/hooks';
import { Piece } from './badge';
import { BOARD_STYLES, CAPTURE_STYLES, PIECE_STYLES } from './pieces';
import { PICK_STYLE, closeStyle, pickBoard, pickCapture, pickPieces, saveStyle, styleNowText, toggleStyle } from './style-picker';

// miniatura 5×5 com um cavalo no meio (a animação de captura roda nela)
function CapStage({ boardId, piecesId }: { boardId: string; piecesId: string }) {
  const cells = [];
  for (let y = 0; y < 5; y++)
    for (let x = 0; x < 5; x++)
      cells.push(
        <i key={y * 5 + x} className={(x + y) % 2 ? 'd' : 'l'} data-x={x} data-y={y}>
          {x === 2 && y === 2 ? <Piece type="n" color="w" pieces={piecesId} /> : null}
        </i>,
      );
  return (
    <span className="cap-stage" data-board={boardId} data-pieces={piecesId} aria-hidden="true">
      {cells}
    </span>
  );
}

export function StylePicker() {
  useGameView();
  const open = UI.style;
  return (
    <footer className="bottom">
      <div className="pop-anchor up">
        <button className="btn" id="openStyle" aria-expanded={open} aria-controls="stylePop" aria-haspopup="dialog" onClick={toggleStyle}>
          {UI.styleLabel}
        </button>
        <section className="card pop pop-up" id="stylePop" hidden={!open} role="dialog" aria-labelledby="styleTtl" tabIndex={-1}>
          <h2 id="styleTtl">Estilo do tabuleiro e peças</h2>
          <div className="field">
            <span className="lab">Tabuleiro</span>
            <div className="style-grid" id="boardStyles">
              {UI.styleOpened
                ? BOARD_STYLES.map((b) => (
                    <button
                      key={b.id}
                      className="style-opt"
                      data-board={b.id}
                      data-pick-board={b.id}
                      aria-pressed={b.id === PICK_STYLE.board}
                      onClick={() => pickBoard(b.id)}
                    >
                      <span className="sw" aria-hidden="true">
                        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                          <i key={i}></i>
                        ))}
                      </span>
                      {b.name}
                    </button>
                  ))
                : null}
            </div>
          </div>
          <div className="field">
            <span className="lab">Peças</span>
            <div className="style-grid" id="pieceStyles">
              {UI.styleOpened
                ? PIECE_STYLES.map((p) => (
                    <button
                      key={p.id}
                      className="style-opt"
                      data-board={PICK_STYLE.board}
                      data-pieces={p.id}
                      data-pick-pieces={p.id}
                      aria-pressed={p.id === PICK_STYLE.pieces}
                      onClick={() => pickPieces(p.id)}
                    >
                      <span className="pv" aria-hidden="true">
                        <Piece type="k" color="w" pieces={p.id} />
                        <Piece type="q" color="b" pieces={p.id} />
                        <Piece type="n" color="w" pieces={p.id} />
                        <Piece type="p" color="b" pieces={p.id} />
                      </span>
                      {p.name}
                    </button>
                  ))
                : null}
            </div>
          </div>
          <div className="field">
            <span className="lab">
              Animação de captura <small className="lab-hint">clique para ver</small>
            </span>
            <div className="style-grid cap-grid" id="captureStyles">
              {UI.styleOpened
                ? CAPTURE_STYLES.map((c) => (
                    <button
                      key={c.id}
                      className="style-opt cap-opt"
                      data-pick-capture={c.id}
                      aria-pressed={c.id === PICK_STYLE.capture}
                      onClick={() => pickCapture(c.id)}
                    >
                      <CapStage boardId={PICK_STYLE.board} piecesId={PICK_STYLE.pieces} />
                      <span className="cap-name">
                        {c.name}
                        <small>{c.desc}</small>
                      </span>
                    </button>
                  ))
                : null}
            </div>
          </div>
          <div className="row">
            <button className="btn" id="styleCancel" onClick={() => closeStyle(true)}>
              Cancelar
            </button>
            <button className="btn primary" id="styleSave" onClick={saveStyle}>
              Salvar estilo
            </button>
          </div>
        </section>
      </div>
      <p className="note" id="styleNow">
        {styleNowText()}
      </p>
    </footer>
  );
}
