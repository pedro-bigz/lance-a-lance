// Livro de aberturas no servidor: o mesmo arquivo de dados da interface (ui/src/book/data.generated.json, gerado por
// tools/gerar-livro.mjs) e o mesmo hash (shared/book-hash.mjs). Um lance é "de livro" quando a posição a que ele leva
// está no livro e todos os lances anteriores da partida também eram (regra de ui/src/book/index.ts → bookLength).
// Carregado na primeira análise (≈420 KB), não na subida da API.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cyrb53, posKey } from '../../../shared/book-hash.mjs';

const DATA = fileURLToPath(new URL('../../../ui/src/book/data.generated.json', import.meta.url));
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

let book = null;
function load() {
  if (book) return book;
  const raw = JSON.parse(readFileSync(DATA, 'utf8'));
  book = new Set(raw.pos.split(',').map((e) => parseInt(e.split(':')[0], 36)));
  return book;
}
export const inBook = (fen) => load().has(cyrb53(posKey(fen)));

/** quantos lances seguidos, desde o início, são de livro (positions[0] precisa ser a posição inicial padrão) */
export function bookLength(positions, plyCount) {
  if (!positions.length || posKey(positions[0]) !== posKey(START_FEN)) return 0;
  let n = 0;
  while (n < plyCount && inBook(positions[n + 1])) n++;
  return n;
}
