// Hash das posições do livro: o mesmo cyrb53 de tools/gerar-livro.mjs (53 bits, cabe num número do JS).
// Fica em shared/book-hash.mjs, que a API também usa para reconhecer os lances de livro na análise da pontuação.
export { cyrb53, posKey } from '../../../shared/book-hash.mjs';
