/* Explorador de livro: próximos lances de livro da posição exibida (índice prefixo → lances, montado uma vez em
   bookTree) com a avaliação do Stockfish de cada um, em sequência, com cache por FEN e cancelada quando a posição muda. */
import { stm } from '../core/constants';
import { terminalOf, uciToSan } from '../core/eval';
import { userMove } from '../core/game';
import { S, blind, botColor, isLive, viewIdx } from '../core/state';
import { START_KEY, openingAt, posKey } from '../book/index';
import { bookNext } from '../book/tree';
import { canUserMove, renderBoard } from '../board/render';
import { goTo } from '../game/replay';
import { $, $opt } from '../ui/dom';
import { esc } from '../ui/escape';
import { ICON_BOOK } from '../ui/icons';
import { fmtEv, moveNo, studyEval } from './eval';
import { STUDY } from './state';

export function renderStudyExplorer(force?: boolean): void {
  if ($('#study').hidden || !$<HTMLDetailsElement>('#studyExpBox').open) return;
  const idx = viewIdx(),
    fen = S.positions[idx] as string,
    sans = S.plies.slice(0, idx).map((p) => p.san);
  const fromStart = posKey(S.positions[0] as string) === START_KEY,
    hide = blind();
  const play = S.mode === 'play' && !!botColor();
  const key = [fen, sans.join(' '), fromStart, hide, play, S.mode, isLive()].join('|');
  if (!force && key === STUDY.expKey) return;
  STUDY.expKey = key;
  const tok = ++STUDY.expTok,
    stale = () => tok !== STUDY.expTok || S.botThinking;
  const el = $('#studyExp'),
    name = fromStart ? openingAt(S.positions, Math.min(idx, S.bookLen || 0)) : null;
  const moves = fromStart ? bookNext(sans, fen) : [];
  let html = `<p class="xp-pos">${ICON_BOOK}<span>${esc(idx === 0 ? 'Posição inicial' : name || 'Sem nome no livro')} · ${esc(moveNo(fen))} ${stm(fen) === 'w' ? 'brancas' : 'pretas'} jogam</span></p>`;
  if (!moves.length) {
    const term = terminalOf(fen);
    html += `<p class="xp-off"><b>Posição fora do livro</b>${fromStart ? '' : '<small>A partida não começou da posição inicial.</small>'}</p>
      <p class="note" id="xpRef">${term ? 'Fim de jogo nesta posição.' : hide ? 'Melhor lance do Stockfish escondido no modo normal até o fim da partida.' : 'Melhor lance do Stockfish: …'}</p>`;
    el.innerHTML = html;
    if (!term && !hide)
      studyEval(fen, stale).then((e) => {
        const ref = $opt('#xpRef');
        if (tok !== STUDY.expTok || !e || !ref) return;
        ref.innerHTML =
          e.err || !e.best
            ? 'O Stockfish não respondeu nesta posição.'
            : `Melhor lance do Stockfish (referência): <b class="san">${esc(uciToSan(fen, e.best))}</b> · ${fmtEv(e)} (+ = brancas melhor)`;
      });
    return;
  }
  const max = moves[0]!.n;
  html += `<div class="xp-head" aria-hidden="true"><span>Lance</span><span>Leva a</span><span class="xp-pop-h">Linhas</span><span></span><span title="Avaliação do Stockfish depois do lance (+ = vantagem das brancas)">Aval.</span></div>
    <ol class="xp-list">${moves.map((m, i) => `<li><button class="xp-row" data-i="${i}" title="${esc(m.name || '')}"><span class="san">${esc(moveNo(fen))} ${esc(m.san)}</span><span class="xp-name">${esc(m.name || '—')}</span><span class="xp-pop" aria-hidden="true"><i style="width:${Math.max(4, (m.n / max) * 100).toFixed(0)}%"></i></span><span class="xp-n" aria-label="${m.n} linhas do livro">${m.n}</span><span class="xp-ev">${hide ? '—' : fmtEv(STUDY.evals.get(m.fen))}</span></button></li>`).join('')}</ol>
    <p class="note">${hide ? 'Avaliações escondidas no modo normal até o fim da partida. ' : ''}${play ? 'Clique num lance para destacá-lo no tabuleiro (ele não é jogado por você).' : 'Clique num lance para jogá-lo no tabuleiro (ou avançar, se for o lance da partida).'}</p>`;
  el.innerHTML = html;
  STUDY.expMoves = moves;
  if (hide) return;
  const rows = el.querySelectorAll('.xp-row .xp-ev');
  // em sequência: o botEngine atende um pedido por vez; os da posição antiga são pulados quando ela muda
  moves.forEach((m, i) => {
    if (!STUDY.evals.has(m.fen))
      studyEval(m.fen, stale).then((e) => {
        if (tok === STUDY.expTok && e) (rows[i] as Element).textContent = fmtEv(e);
      });
  });
}
export function studyExpClick(i: number): void {
  const m = STUDY.expMoves && STUDY.expMoves[i];
  if (!m) return;
  const idx = viewIdx(),
    fen = S.positions[idx],
    next = S.plies[idx];
  if (S.mode === 'review' && next && next.san === m.san) {
    goTo(idx + 1);
    return;
  } // é o lance da partida: só avança
  const canPlay = (S.mode === 'review' || !botColor()) && isLive() && canUserMove() && S.game.fen() === fen;
  if (canPlay) {
    userMove(m.from, m.to, m.promotion);
    return;
  }
  // partida contra o bot (ou prática): só realça, sem jogar pelo usuário
  S.studyMark = { fen: fen as string, from: m.from, to: m.to };
  renderBoard();
}
