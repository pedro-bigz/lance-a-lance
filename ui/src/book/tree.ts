// Árvore de prefixos do livro (estudo de aberturas): prefixo de lances (SAN separados por espaço) -> próximos lances
// {n linhas, nome da linha mais curta}. Montada uma vez, na primeira consulta.
import { Chess } from 'chess.js';
import { BOOK_LINES, openingName } from './index';

export interface TreeEntry {
  n: number;
  name: string;
  len: number;
}
export type BookTree = Map<string, Map<string, TreeEntry>>;
export interface SanStep {
  san: string;
  from: string;
  to: string;
  promotion?: string;
  fen: string;
}
export interface NextMove extends SanStep {
  n: number;
  name: string;
}

let TREE: BookTree | null = null;
export function bookTree(): BookTree {
  if (TREE) return TREE;
  const tree: BookTree = new Map();
  for (const l of BOOK_LINES) {
    let key = '';
    for (let k = 0; k < l.sans.length; k++) {
      let kids = tree.get(key);
      if (!kids) tree.set(key, (kids = new Map()));
      const san = l.sans[k] as string,
        e = kids.get(san);
      if (!e) kids.set(san, { n: 1, name: l.name, len: l.sans.length });
      else {
        e.n++;
        if (l.sans.length < e.len) {
          e.name = l.name;
          e.len = l.sans.length;
        }
      }
      key = key ? key + ' ' + san : san;
    }
  }
  return (TREE = tree);
}
// lance SAN numa posição: dados do lance e a posição a que leva (null se ilegal)
export function sanStep(fen: string, san: string): SanStep | null {
  const c = new Chess(fen),
    m = c.move(san);
  return m ? { san: m.san, from: m.from, to: m.to, promotion: m.promotion, fen: c.fen() } : null;
}
// próximos lances de livro depois de uma sequência que começou na posição inicial (mais linhas primeiro)
export function bookNext(sans: string[], fen: string): NextMove[] {
  const kids = bookTree().get(sans.join(' '));
  if (!kids) return [];
  const out: NextMove[] = [];
  for (const [san, e] of kids) {
    const m = sanStep(fen, san);
    if (m) out.push({ ...m, n: e.n, name: openingName(m.fen) || e.name });
  }
  return out.sort((a, b) => b.n - a.n);
}
// próximos lances dentro das variantes da prática (linhas = arrays de SAN)
export function linesNext(lines: string[][], sans: string[], fen: string): NextMove[] {
  const count = new Map<string, number>();
  for (const l of lines)
    if (l.length > sans.length && sans.every((m, i) => l[i] === m))
      count.set(l[sans.length] as string, (count.get(l[sans.length] as string) || 0) + 1);
  const kids = bookTree().get(sans.join(' '));
  const out: NextMove[] = [];
  for (const [san, n] of count) {
    const m = sanStep(fen, san);
    if (m) out.push({ ...m, n, name: openingName(m.fen) || (kids && kids.get(san) ? (kids.get(san) as TreeEntry).name : '') });
  }
  return out.sort((a, b) => b.n - a.n);
}
