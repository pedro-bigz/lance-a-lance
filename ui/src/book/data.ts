// Dados do livro de aberturas, gerados por tools/gerar-livro.mjs em data.generated.json (não edite à mão).
//   names: nomes das aberturas (português)
//   pos:   "hash36[:índice36],…" posição do livro → índice do nome (sem índice = posição sem nome próprio)
//   lines: "índice36|lances SAN" por linha, separadas por \n (linhas completas, para busca e treino)
import raw from './data.generated.json';

export interface BookData {
  names: string[];
  pos: string;
  lines: string;
}
export const BOOK_DATA: BookData = raw;
