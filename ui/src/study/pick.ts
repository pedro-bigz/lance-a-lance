/* Escolher a abertura: busca no livro (findLines), agrupa por família (nome antes de ":") e mostra a linha principal.
   "Ver a linha" reproduz a variante (buildDemo sem lances extras + playDemo). O desenho fica em study-panel.tsx. */
import { findLines, pgnOf, type BookLine } from '../book/index';
import { goView } from '../desktop/views';
import { REFS } from '../game/ui-state';
import { publish } from '../store/view-store';
import { buildDemo, playDemo } from '../tutor/training';
import { studyNeedsCtx } from './practice';
import { STUDY, type StudyGroup } from './state';

export const STUDY_POPULAR = [
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
let groupsMemo: { q: string; groups: StudyGroup[] } = { q: '', groups: [] };
/** famílias (até 8) para a busca atual; vazio sem busca */
export function groupsFor(q: string): StudyGroup[] {
  q = q.trim();
  if (!q) return [];
  if (groupsMemo.q !== q) groupsMemo = { q, groups: studyGroups(q).slice(0, 8) };
  return groupsMemo.groups;
}
export function studySelect(fam: string, lines: BookLine[], v?: string): void {
  const vars = new Set(lines.map((l) => varOf(l.name)));
  const one = v != null ? v : vars.size === 1 ? ([...vars][0] as string) : '';
  STUDY.sel = { title: one ? `${fam}: ${one}` : fam, lines, main: mainLine(lines), names: new Set(lines.map((l) => l.name)).size };
  publish('board');
  const b = document.querySelector<HTMLElement>('#studyPick [data-act="watch"]');
  if (b) b.focus();
}
/** família inteira (gi) ou uma variante dela (vi) da busca atual */
export function studySelectGroup(gi: number, vi?: number): void {
  const grp = groupsFor(STUDY.q)[gi];
  if (!grp) return;
  if (vi != null) {
    const vg = grp.vars[vi];
    if (vg) studySelect(grp.fam, vg.lines, vg.v);
  } else studySelect(grp.fam, grp.lines);
}
/** chip "Populares": vira a busca */
export function studySearch(q: string): void {
  if (REFS.studyQ) REFS.studyQ.value = q;
  STUDY.q = q;
  publish('board');
}
export function studyUnselect(): void {
  STUDY.sel = null;
  publish('board');
  if (REFS.studyQ) REFS.studyQ.focus();
}
export const shortPgn = (sans: string[], n = 10): string => pgnOf(sans.slice(0, n)) + (sans.length > n ? ' …' : '');
// "Ver a linha": reproduz a linha principal no tabuleiro, lance a lance
export async function studyWatch(): Promise<void> {
  const sel = STUDY.sel;
  if (!sel || STUDY.watchBusy) return;
  if (studyNeedsCtx()) goView('aberturas');
  STUDY.watchBusy = true;
  publish('board');
  const demo = await buildDemo(sel.main, 0);
  STUDY.watchBusy = false;
  STUDY.practice = null;
  playDemo(demo);
}
