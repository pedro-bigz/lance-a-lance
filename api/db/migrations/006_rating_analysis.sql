-- 006: pontuação calculada pelo Stockfish no servidor (resultado + força do bot + precisão do jogador).
-- A conclusão de uma partida que vale pontuação grava o resultado como antes, mas deixa a pontuação pendente
-- (rating_status = 'pending'); a fila de análise da API (src/rating/) roda o Stockfish sobre os lances gravados e,
-- numa transação com FOR UPDATE, aplica o delta uma vez só (rating_status = 'applied').
--
-- Só ADD COLUMN, todas anuláveis ou com DEFAULT: ALGORITHM=INSTANT muda só o dicionário de dados, sem reescrever
-- linhas (o ON UPDATE de updated_at não dispara) e sem travar a tabela; a API antiga continua funcionando com o
-- banco migrado (ela lista as colunas que lê e que grava). Partidas antigas ficam com rating_status NULL e não são
-- recalculadas. O índice de rating_status (a fila procura as pendentes ao iniciar) é criado online (INPLACE, LOCK=NONE).
--
-- Para voltar (antes, volte também o código da API):
--   ALTER TABLE games DROP INDEX games_rating_status_idx, DROP COLUMN rating_status, DROP COLUMN rating_attempts,
--     DROP COLUMN player_accuracy, DROP COLUMN bot_elo, DROP COLUMN expected_score, DROP COLUMN engine_version,
--     DROP COLUMN rating_applied_at;
--   ALTER TABLE rating_history DROP COLUMN player_accuracy, DROP COLUMN bot_elo, DROP COLUMN expected_score;
--   DELETE FROM schema_migrations WHERE version = '006_rating_analysis.sql';
ALTER TABLE games ALGORITHM=INSTANT,
  ADD COLUMN rating_status     ENUM('pending','applied','failed') NULL AFTER rating_delta,  -- NULL: não vale pontuação ou é anterior à 006
  ADD COLUMN rating_attempts   TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER rating_status,    -- análises que falharam
  ADD COLUMN player_accuracy   DECIMAL(5,2)     NULL AFTER rating_attempts,                -- precisão do jogador (0–100) pelo Stockfish
  ADD COLUMN bot_elo           SMALLINT UNSIGNED NULL AFTER player_accuracy,              -- Elo nominal do bot usado no cálculo
  ADD COLUMN expected_score    DECIMAL(5,4)     NULL AFTER bot_elo,                        -- E = 1/(1+10^((bot−jogador)/400))
  ADD COLUMN engine_version    VARCHAR(40)      NULL AFTER expected_score,                 -- motor da análise, ex. sf19-lite@19.0.1
  ADD COLUMN rating_applied_at DATETIME         NULL AFTER engine_version;                 -- quando a pontuação foi aplicada

ALTER TABLE games ALGORITHM=INPLACE, LOCK=NONE, ADD KEY games_rating_status_idx (rating_status);

ALTER TABLE rating_history ALGORITHM=INSTANT,
  ADD COLUMN player_accuracy DECIMAL(5,2)      NULL AFTER reason,
  ADD COLUMN bot_elo         SMALLINT UNSIGNED NULL AFTER player_accuracy,
  ADD COLUMN expected_score  DECIMAL(5,4)      NULL AFTER bot_elo;
