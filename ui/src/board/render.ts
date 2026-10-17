/* ---------- Tabuleiro ----------
   Desenho das casas, peças, marcações (último lance, xeque, seleção, dica do estudo) e setas. */
import { Chess, type Color } from 'chess.js';
import { CLS, type ClsKey } from '../core/constants';
import { S, blind, botColor, isLive, viewIdx } from '../core/state';
import { $ } from '../ui/dom';
import { ICON_CROWN, ICON_FLAG } from '../ui/icons';
import { pieceSpan } from './pieces';

export const boardEl = $('#board'),
  squaresEl = $('#squares');
export function sqXY(sq: string): [number, number] {
  const f = 'abcdefgh'.indexOf(sq[0] as string),
    r = +(sq[1] as string);
  return S.orient === 'w' ? [f, 8 - r] : [7 - f, r - 1];
}
export function sqAt(x: number, y: number): string | null {
  const b = squaresEl.getBoundingClientRect();
  const cx = Math.floor(((x - b.left) / b.width) * 8),
    cy = Math.floor(((y - b.top) / b.height) * 8);
  if (cx < 0 || cx > 7 || cy < 0 || cy > 7) return null;
  return S.orient === 'w' ? 'abcdefgh'[cx] + (8 - cy) : 'abcdefgh'[7 - cx] + (cy + 1);
}
export function canUserMove(): boolean {
  if (!isLive() || S.over || S.botThinking) return false;
  if (S.mode === 'review' && S.fromHistory) return false; // partida concluída do histórico: só revisão
  const bc = botColor();
  return !bc || S.game.turn() !== bc;
}
export function badgeHtml(key: ClsKey, cls: string): string {
  const c = CLS[key];
  return `<span class="${cls}" style="background:var(--c-${key})" title="${c.label}">${c.sym}</span>`;
}
// fim de jogo decidido na posição exibida: quem perdeu e como (mate ou desistência)
function endState(c: Chess, idx: number): { loser: Color; how: 'mate' | 'resign' } | null {
  if (idx !== S.positions.length - 1) return null;
  if (c.in_checkmate()) return { loser: c.turn(), how: 'mate' };
  const resignedReview = S.mode === 'review' && S.fromHistory && /desistiu/i.test(S.recText || '');
  if ((S.mode === 'play' && S.resigned) || resignedReview) return { loser: S.player, how: 'resign' };
  return null;
}
function endBadge(kind: 'win' | 'lose', how: 'mate' | 'resign'): string {
  if (kind === 'win') return `<span class="end-badge win" title="Venceu">${ICON_CROWN}</span>`;
  return how === 'resign'
    ? `<span class="end-badge lose" title="Desistiu">${ICON_FLAG}</span>`
    : `<span class="end-badge lose" title="Xeque-mate">#</span>`;
}
export function renderBoard(): void {
  const idx = viewIdx(),
    fen = S.positions[idx] as string,
    c = new Chess(fen),
    rows = c.board();
  const last = idx > 0 ? S.plies[idx - 1] : null;
  const k = idx > 0 ? S.cls[idx - 1] : null;
  let chk: string | null = null;
  const mark = S.studyMark && S.studyMark.fen === fen ? S.studyMark : null;
  // o chess.js 0.10 não informa a casa em board(); ela sai da posição na matriz (linha 0 = 8ª fileira)
  if (c.in_check())
    rows.forEach((row, ri) =>
      row.forEach((p, fi) => {
        if (p && p.type === 'k' && p.color === c.turn()) chk = 'abcdefgh'[fi] + (8 - ri);
      }),
    );
  const end = endState(c, idx);
  let html = '';
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
      html += `<div class="${cl.join(' ')}" data-sq="${sq}">`;
      if (x === 0) html += `<span class="coord r">${r}</span>`;
      if (y === 7) html += `<span class="coord f">${'abcdefgh'[f]}</span>`;
      if (p) {
        let ph = pieceSpan(p.type, p.color);
        if (end && p.type === 'k' && p.color === end.loser) ph = ph.replace('class="pc ', 'class="pc fallen ');
        html += ph;
      }
      if (end && p && p.type === 'k') html += endBadge(p.color === end.loser ? 'lose' : 'win', end.how);
      if (S.targets.includes(sq)) html += p ? '<span class="ring"></span>' : '<span class="dot"></span>';
      if (k && last && sq === last.to && !blind()) html += badgeHtml(k.key, 'badge-sq');
      html += '</div>';
    }
  squaresEl.innerHTML = html;
  renderArrows();
}
function arrowSvg(uci: string, color: string): string {
  const [x1, y1] = sqXY(uci.slice(0, 2)).map((v) => v + 0.5) as [number, number],
    [x2, y2] = sqXY(uci.slice(2, 4)).map((v) => v + 0.5) as [number, number];
  const dx = x2 - x1,
    dy = y2 - y1,
    len = Math.hypot(dx, dy),
    ux = dx / len,
    uy = dy / len;
  const sx = x1 + ux * 0.28,
    sy = y1 + uy * 0.28,
    hx = x2 - ux * 0.42,
    hy = y2 - uy * 0.42;
  const px = -uy * 0.27,
    py = ux * 0.27,
    tx = x2 - ux * 0.12,
    ty = y2 - uy * 0.12;
  return `<g opacity=".82"><line x1="${sx}" y1="${sy}" x2="${hx}" y2="${hy}" stroke="${color}" stroke-width=".2" stroke-linecap="round"/><polygon points="${tx},${ty} ${hx + px},${hy + py} ${hx - px},${hy - py}" fill="${color}"/></g>`;
}
function renderArrows(): void {
  const idx = viewIdx();
  let out = '';
  // lance destacado pelo explorador do estudo (seta na cor do livro)
  const mk =
    S.studyMark && S.studyMark.to && S.studyMark.fen === S.positions[idx] ? arrowSvg(S.studyMark.from + S.studyMark.to, 'var(--c-livro)') : '';
  if (blind()) {
    $('#arrows').innerHTML = mk;
    return;
  }
  if (idx > 0) {
    const k = S.cls[idx - 1],
      A = S.cache.get(S.positions[idx - 1] as string);
    if (k && A && A.best && !k.isBest && !['brilhante', 'otima', 'melhor'].includes(k.key)) out += arrowSvg(A.best, 'var(--c-melhor)');
  }
  if (S.hintAt === idx) {
    const r = S.cache.get(S.positions[idx] as string);
    if (r && r.best) out += arrowSvg(r.best, 'var(--c-otima)');
  }
  $('#arrows').innerHTML = out + mk;
}
