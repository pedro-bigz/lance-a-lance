/* Escolher a abertura: busca no livro (findLines), agrupa por família (nome antes de ":") e mostra a linha principal.
   "Ver a linha" reproduz a variante (buildDemo sem lances extras + playDemo). */
import { findLines, pgnOf, type BookLine } from '../book/index';
import { goView } from '../desktop/views';
import { buildDemo, playDemo } from '../tutor/training';
import { $, $opt } from '../ui/dom';
import { esc } from '../ui/escape';
import { busy } from '../ui/forms';
import { studyNeedsCtx } from './practice';
import { STUDY, type StudyGroup } from './state';

const STUDY_POPULAR = [
  'Italiana',
  'Ruy Lopez',
  'Siciliana',
  'Francesa',
  'Caro-Kann',
  'Gambito da Dama',
  'Índia do Rei',
  'Londres',
  'Inglesa',
  'Escandinava',
];
const famOf = (name: string) => (name.split(':')[0] as string).trim();
const varOf = (name: string) => {
  const r = name.split(':')[1];
  return r ? (r.split(',')[0] as string).trim() : '';
};
const lineRank = (l: BookLine) => (l.name.split(',').length - 1) * 100 + l.name.length;
// linha principal: o nome mais "raiz" do grupo e, entre esses, a linha mais longa
export function mainLine(lines: BookLine[]): BookLine {
  return lines.reduce((b, l) => {
    const d = lineRank(l) - lineRank(b);
    return d < 0 || (d === 0 && l.sans.length > b.sans.length) ? l : b;
  });
}
function studyGroups(q: string): StudyGroup[] {
  const fams = new Map<string, { fam: string; lines: BookLine[]; vars: Map<string, { v: string; lines: BookLine[] }> }>();
  for (const l of findLines(q)) {
    const f = famOf(l.name);
    let g = fams.get(f);
    if (!g) fams.set(f, (g = { fam: f, lines: [], vars: new Map() }));
    g.lines.push(l);
    const v = varOf(l.name);
    let vg = g.vars.get(v);
    if (!vg) g.vars.set(v, (vg = { v, lines: [] }));
    vg.lines.push(l);
  }
  return [...fams.values()]
    .sort((a, b) => b.lines.length - a.lines.length)
    .map((g) => ({ ...g, vars: [...g.vars.values()].sort((a, b) => b.lines.length - a.lines.length) }));
}
export function studySelect(fam: string, lines: BookLine[], v?: string): void {
  const vars = new Set(lines.map((l) => varOf(l.name)));
  const one = v != null ? v : vars.size === 1 ? ([...vars][0] as string) : '';
  STUDY.sel = { title: one ? `${fam}: ${one}` : fam, lines, main: mainLine(lines), names: new Set(lines.map((l) => l.name)).size };
  renderStudyPick();
  const b = $opt('#studyPick [data-act="watch"]');
  if (b) b.focus();
}
const shortPgn = (sans: string[], n = 10) => pgnOf(sans.slice(0, n)) + (sans.length > n ? ' …' : '');
export function renderStudyPick(): void {
  const el = $('#studyPick'),
    q = STUDY.q.trim(),
    sel = STUDY.sel;
  let html = '';
  if (sel) {
    const nl = sel.lines.length;
    html += `<div class="st-sel"><div class="st-sel-h"><b>${esc(sel.title)}</b><button class="link-btn" data-act="unsel">Trocar</button></div>
      <p class="st-pgn">${esc(pgnOf(sel.main.sans))}</p>
      <small>Linha principal: ${esc(sel.main.name)} · ${sel.names} variante${sel.names === 1 ? '' : 's'} (${nl} linha${nl === 1 ? '' : 's'} do livro)</small>
      <div class="row"><button class="btn" data-act="watch">Ver a linha</button><button class="btn primary" data-act="prac-w">Praticar de brancas</button><button class="btn primary" data-act="prac-b">Praticar de pretas</button></div></div>`;
  }
  if (!q) {
    STUDY.groups = [];
    html += `<p class="st-lab">Populares</p><div class="tutor-chips">${STUDY_POPULAR.map((n) => `<button data-q="${esc(n)}">${esc(n)}</button>`).join('')}</div>`;
  } else {
    STUDY.groups = studyGroups(q).slice(0, 8);
    if (!STUDY.groups.length)
      html += `<p class="st-empty">Nada no livro para “${esc(q)}”. Tente outro nome, como “siciliana” ou “gambito evans”.</p>`;
    STUDY.groups.forEach((g, gi) => {
      const shown = g.vars.slice(0, 6);
      html +=
        `<div class="st-fam"><button class="st-fam-h" data-g="${gi}">${esc(g.fam)}<small>${g.lines.length} linha${g.lines.length === 1 ? '' : 's'} · ver tudo</small></button>` +
        shown
          .map(
            (vg, vi) =>
              `<button class="st-var" data-g="${gi}" data-v="${vi}"><b>${esc(vg.v || 'Linha principal')}</b><span>${esc(shortPgn(mainLine(vg.lines).sans))}</span></button>`,
          )
          .join('') +
        (g.vars.length > shown.length
          ? `<div class="st-more">+${g.vars.length - shown.length} variantes: refine a busca ou escolha a família inteira</div>`
          : '') +
        '</div>';
    });
  }
  el.innerHTML = html;
}
// "Ver a linha": reproduz a linha principal no tabuleiro, lance a lance
export async function studyWatch(btn: HTMLElement): Promise<void> {
  const sel = STUDY.sel;
  if (!sel) return;
  if (studyNeedsCtx()) {
    goView('aberturas');
    btn = $opt('#studyPick [data-act="watch"]') || btn;
  }
  busy(btn as HTMLButtonElement, true, 'Preparando…');
  const demo = await buildDemo(sel.main, 0);
  busy(btn as HTMLButtonElement, false);
  STUDY.practice = null;
  playDemo(demo);
}
