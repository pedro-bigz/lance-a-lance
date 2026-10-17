// Classificações de lance. A chave é o valor que o app manda e que fica guardado em games.moves[].cls e nas chaves
// de games.counted_moves (vocabulário do app, em português; 'chance' do app chega como 'chance_perdida').
// O valor é a coluna de player_stats com o total daquela classificação, que também é a chave em stats.moves de
// GET /v1/stats/me. Nomes de coluna são sempre em inglês (migração 005).
export const CLS_COLUMNS = Object.freeze({
  livro: 'book_moves',
  brilhante: 'brilliant_moves',
  otima: 'great_moves',
  melhor: 'best_moves',
  excelente: 'excellent_moves',
  boa: 'good_moves',
  imprecisao: 'inaccuracies',
  erro: 'mistakes',
  chance_perdida: 'missed_wins',
  capivarada: 'blunders',
});

// classificações aceitas em moves[].cls, na ordem do app (da melhor para a pior)
export const CLASSIFICATIONS = Object.freeze(Object.keys(CLS_COLUMNS));
// apelidos aceitos na entrada
export const CLS_ALIAS = Object.freeze({ chance: 'chance_perdida' });
