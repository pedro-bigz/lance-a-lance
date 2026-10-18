// Hash das posições do livro de aberturas (cyrb53, 53 bits, cabe num número do JS): o mesmo de tools/gerar-livro.mjs.
// Módulo puro compartilhado: a interface (ui/src/book/hash.ts) e a API (api/src/rating/book.mjs, que reconhece os
// lances de livro na análise da pontuação) importam este arquivo.
export function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed,
    h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
/** chave da posição: os 4 primeiros campos da FEN (sem os contadores de lances) */
export const posKey = (fen) => fen.split(' ').slice(0, 4).join(' ');
