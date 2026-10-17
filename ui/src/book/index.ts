/* ---------- Livro de aberturas ----------
   ~3.900 linhas nomeadas do Lichess (domínio público) mais linhas curadas com nomes em português.
   Um lance é "de livro" quando a posição a que ele leva está no livro e todos os lances anteriores da
   partida também eram; quando a sequência sai do livro, os lances seguintes são avaliados pelo Stockfish. */
import { Chess } from 'chess.js';
import { BOOK_DATA } from './data';
import { cyrb53, posKey } from './hash';

export { posKey };
export const START_KEY = posKey(new Chess().fen());
export const BOOK = new Map<number, number>(); // hash da posição -> índice do nome (-1 = sem nome próprio)
for (const e of BOOK_DATA.pos.split(',')) {
  const [h, i] = e.split(':');
  BOOK.set(parseInt(h as string, 36), i == null ? -1 : parseInt(i, 36));
}
export const inBook = (fen: string): boolean => BOOK.has(cyrb53(posKey(fen)));
// nome da abertura numa posição (só as posições com nome próprio no livro têm)
export function openingName(fen: string): string | null {
  const i = BOOK.get(cyrb53(posKey(fen)));
  return i != null && i >= 0 ? (BOOK_DATA.names[i] as string) : null;
}
// nome vigente no lance idx: o da última posição com nome até ali
export function openingAt(positions: string[], idx: number): string | null {
  for (let i = Math.min(idx, positions.length - 1); i >= 1; i--) {
    const n = openingName(positions[i] as string);
    if (n) return n;
  }
  return null;
}
// quantos lances seguidos, desde o início, são de livro (positions[0] precisa ser a posição inicial)
export function bookLength(positions: string[], plyCount: number): number {
  if (!positions.length || posKey(positions[0] as string) !== START_KEY) return 0;
  let n = 0;
  while (n < plyCount && inBook(positions[n + 1] as string)) n++;
  return n;
}

/** linha do livro com nome: [{name, sans}] */
export interface BookLine {
  name: string;
  sans: string[];
}
export const BOOK_LINES: BookLine[] = BOOK_DATA.lines
  .split('\n')
  .map((l) => {
    const [i, mv] = l.split('|');
    return { name: BOOK_DATA.names[parseInt(i as string, 36)] as string, sans: mv ? mv.split(' ') : [] };
  })
  .filter((l) => l.sans.length);
export const norm = (t: unknown): string =>
  String(t || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
// alguns nomes em inglês ou apelidos que o usuário pode usar
const OPENING_ALIASES: Record<string, string> = {
  italian: 'italiana',
  giuoco: 'giuoco',
  sicilian: 'siciliana',
  french: 'francesa',
  'caro kann': 'caro-kann',
  spanish: 'ruy lopez',
  espanhola: 'ruy lopez',
  lopez: 'ruy lopez',
  "queen's gambit": 'gambito da dama',
  'kings indian': 'india do rei',
  "king's indian": 'india do rei',
  london: 'londres',
  scotch: 'escocesa',
  english: 'inglesa',
  dutch: 'holandesa',
  slav: 'eslava',
  nimzo: 'nimzoindia',
};
const STOP_WORDS = [
  'abertura',
  'defesa',
  'de',
  'da',
  'do',
  'a',
  'o',
  'e',
  'variante',
  'linha',
  'jogo',
  'partida',
  'quero',
  'aprender',
  'game',
  'opening',
  'defense',
  'defence',
  'variation',
  'line',
  'the',
  'of',
];
// busca no livro: todas as palavras da consulta (sem acento, apelidos trocados) precisam estar no nome
export function findLines(query: string): BookLine[] {
  let q = norm(query).replace(/[^a-z0-9\- ]/g, ' ');
  // apelidos só como palavra inteira ("italian" não pode virar "italianaa")
  for (const [k, v] of Object.entries(OPENING_ALIASES))
    q = q.replace(new RegExp(`(^|\\s)${norm(k).replace(/[^a-z0-9 ]/g, '.')}(?=\\s|$)`, 'g'), `$1${v}`);
  const words = q.split(/\s+/).filter((w) => w.length > 1 && !STOP_WORDS.includes(w));
  if (!words.length) return [];
  return BOOK_LINES.filter((l) => {
    const n = norm(l.name);
    return words.every((w) => n.includes(w));
  });
}
export const pgnOf = (sans: string[]): string => sans.map((m, i) => (i % 2 ? '' : `${i / 2 + 1}. `) + m).join(' ');
// lances em SAN (com ou sem número) validados a partir da posição inicial; para no primeiro ilegal
export function validLine(sans: unknown[] | null | undefined): string[] {
  const c = new Chess(),
    out: string[] = [];
  for (const raw of sans || []) {
    const m = c.move(
      String(raw)
        .replace(/^\d+\.+/, '')
        .trim(),
      { sloppy: true },
    );
    if (!m) break;
    out.push(m.san);
  }
  return out;
}
// até n linhas de nomes diferentes, com preferência (sorteada) pelas variantes principais
export function pickVariety(list: BookLine[], n: number): BookLine[] {
  const byName = new Map<string, BookLine>();
  for (const l of list) if (!byName.has(l.name) || (byName.get(l.name) as BookLine).sans.length < l.sans.length) byName.set(l.name, l);
  // variantes principais primeiro: nomes com menos subdivisões (vírgulas) e mais curtos
  const rank = (l: BookLine) => (l.name.split(',').length - 1) * 100 + l.name.length;
  const uniq = [...byName.values()].sort((a, b) => rank(a) - rank(b));
  const out: BookLine[] = [];
  while (out.length < n && uniq.length)
    out.push(uniq.splice(Math.floor(Math.random() * Math.min(uniq.length, Math.max(3, n * 2))), 1)[0] as BookLine);
  return out;
}
// família em comum entre as linhas escolhidas
export function openingNameOfLines(lines: BookLine[]): string | null {
  const fams = new Set(lines.map((l) => l.name.split(':')[0]));
  return fams.size === 1 ? ([...fams][0] as string) : null;
}
