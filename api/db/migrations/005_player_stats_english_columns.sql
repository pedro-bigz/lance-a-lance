-- 005: colunas de player_stats em inglês (padrão do banco: nomes de tabelas e colunas só em inglês, snake_case).
-- Só renomeia (RENAME COLUMN): tipo, NOT NULL, DEFAULT e dados ficam como estão. ALGORITHM=INSTANT muda só o
-- dicionário de dados, sem reescrever linhas, então o ON UPDATE de updated_at não dispara; se o servidor não
-- conseguir fazer instantâneo, o ALTER falha em vez de copiar a tabela. Um único ALTER é atômico no MySQL 8:
-- ou renomeia todas, ou nenhuma.
--
-- As classificações dos lances continuam com os valores do app em games.moves[].cls e nas chaves de
-- games.counted_moves (livro, brilhante, ..., chance_perdida, capivarada): são dados, não nomes de coluna.
-- A API traduz classificação → coluna em src/move-classes.mjs.
--
-- Para voltar (antes, volte também o código da API):
--   ALTER TABLE player_stats ALGORITHM=INSTANT,
--     RENAME COLUMN book_moves TO livro, RENAME COLUMN brilliant_moves TO brilhante, RENAME COLUMN great_moves TO otima,
--     RENAME COLUMN best_moves TO melhor, RENAME COLUMN excellent_moves TO excelente, RENAME COLUMN good_moves TO boa,
--     RENAME COLUMN inaccuracies TO imprecisao, RENAME COLUMN mistakes TO erro, RENAME COLUMN missed_wins TO chance_perdida,
--     RENAME COLUMN blunders TO capivarada;
--   DELETE FROM schema_migrations WHERE version = '005_player_stats_english_columns.sql';
ALTER TABLE player_stats ALGORITHM=INSTANT,
  RENAME COLUMN livro          TO book_moves,       -- lance de teoria de abertura
  RENAME COLUMN brilhante      TO brilliant_moves,  -- !!  sacrifício correto
  RENAME COLUMN otima          TO great_moves,      -- !   único lance bom
  RENAME COLUMN melhor         TO best_moves,       -- ★   lance do motor
  RENAME COLUMN excelente      TO excellent_moves,  -- ✓✓  perda < 2%
  RENAME COLUMN boa            TO good_moves,       -- ✓   perda de 2 a 5%
  RENAME COLUMN imprecisao     TO inaccuracies,     -- ?!  perda de 5 a 10%
  RENAME COLUMN erro           TO mistakes,         -- ?   perda de 10 a 20%
  RENAME COLUMN chance_perdida TO missed_wins,      -- ✕   não puniu o erro do rival
  RENAME COLUMN capivarada     TO blunders;         -- ??  perda ≥ 20%
