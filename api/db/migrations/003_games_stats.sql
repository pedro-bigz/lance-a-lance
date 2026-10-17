-- 003: partidas, estatísticas por jogador e histórico de pontuação.
-- Toda partida é ligada a um ou dois usuários (white_user_id / black_user_id); contra bot o lado do bot é NULL.
-- As FKs dos lados são ON DELETE SET NULL: numa partida entre dois usuários, excluir um deixa o lado dele vazio.
-- A partida que ficaria sem nenhum usuário (contra bot, análise) é apagada pela API junto com a conta
-- (user-store.deleteUser), já que o MySQL não aceita CHECK em coluna com ação de FK. A regra "pelo menos um
-- usuário" é garantida pela API, que sempre liga quem cria a partida a um dos lados.
CREATE TABLE IF NOT EXISTS games (
  id              BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  client_ref      VARCHAR(40)      NULL,              -- id gerado no app (torna o POST idempotente)
  white_user_id   BIGINT UNSIGNED  NULL,
  black_user_id   BIGINT UNSIGNED  NULL,
  opponent_type   ENUM('bot','humano','analise') NOT NULL,
  bot_level       VARCHAR(30)      NULL,              -- novato, iniciante, intermediario, avancado, mestre, gm
  mode            ENUM('normal','assistido') NOT NULL DEFAULT 'assistido',
  status          ENUM('em_andamento','concluida','abandonada') NOT NULL DEFAULT 'em_andamento',
  result          ENUM('1-0','0-1','1/2-1/2') NULL,
  result_reason   VARCHAR(30)      NULL,              -- xeque_mate, desistencia, afogamento, repeticao…
  start_fen       VARCHAR(100)     NULL,              -- NULL = posição inicial
  pgn             TEXT             NULL,
  moves           JSON             NULL,              -- [{uci, san, cls}] com a classificação de cada lance
  meta            JSON             NULL,              -- dados da tela (orientação, cabeçalhos do PGN, texto do resultado)
  opening_name    VARCHAR(160)     NULL,
  ply_count       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  rated           TINYINT(1)       NOT NULL DEFAULT 0, -- afeta a pontuação (modo normal contra bot)
  rating_delta    SMALLINT         NULL,              -- quanto a pontuação mudou na conclusão
  stats_applied   TINYINT(1)       NOT NULL DEFAULT 0, -- resultado já somado em player_stats (conclusão idempotente)
  counted_moves   JSON             NULL,              -- lances já somados em player_stats, por cor: {w:{…}, b:{…}}
  started_at      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at     DATETIME         NULL,
  created_at      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY games_client_ref_unique (client_ref),
  KEY games_white_status_idx (white_user_id, status),
  KEY games_black_status_idx (black_user_id, status),
  KEY games_white_finished_idx (white_user_id, finished_at),
  KEY games_black_finished_idx (black_user_id, finished_at),
  CONSTRAINT games_white_user_fk FOREIGN KEY (white_user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT games_black_user_fk FOREIGN KEY (black_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- uma linha por usuário: totais e contadores por tipo de lance (só os lances do próprio usuário)
CREATE TABLE IF NOT EXISTS player_stats (
  user_id          BIGINT UNSIGNED  NOT NULL,
  rating           SMALLINT UNSIGNED NOT NULL DEFAULT 400,
  games_played     INT UNSIGNED     NOT NULL DEFAULT 0,  -- concluídas com resultado (vitórias + derrotas + empates)
  wins             INT UNSIGNED     NOT NULL DEFAULT 0,
  losses           INT UNSIGNED     NOT NULL DEFAULT 0,
  draws            INT UNSIGNED     NOT NULL DEFAULT 0,
  games_classified INT UNSIGNED     NOT NULL DEFAULT 0,  -- concluídas com lances classificados (base das médias)
  livro            INT UNSIGNED     NOT NULL DEFAULT 0,
  brilhante        INT UNSIGNED     NOT NULL DEFAULT 0,
  otima            INT UNSIGNED     NOT NULL DEFAULT 0,
  melhor           INT UNSIGNED     NOT NULL DEFAULT 0,
  excelente        INT UNSIGNED     NOT NULL DEFAULT 0,
  boa              INT UNSIGNED     NOT NULL DEFAULT 0,
  imprecisao       INT UNSIGNED     NOT NULL DEFAULT 0,
  erro             INT UNSIGNED     NOT NULL DEFAULT 0,
  chance_perdida   INT UNSIGNED     NOT NULL DEFAULT 0,
  capivarada       INT UNSIGNED     NOT NULL DEFAULT 0,
  total_moves      INT UNSIGNED     NOT NULL DEFAULT 0,
  updated_at       DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT player_stats_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS rating_history (
  id             BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  user_id        BIGINT UNSIGNED  NOT NULL,
  game_id        BIGINT UNSIGNED  NULL,
  rating_before  SMALLINT UNSIGNED NOT NULL,
  rating_after   SMALLINT UNSIGNED NOT NULL,
  delta          SMALLINT         NOT NULL,
  reason         VARCHAR(30)      NOT NULL,             -- inicial, vitoria, derrota, empate
  created_at     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY rating_history_user_created_idx (user_id, created_at),
  KEY rating_history_game_idx (game_id),
  CONSTRAINT rating_history_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT rating_history_game_fk FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- usuários que já existem: pontuação inicial de 400 e o primeiro ponto do histórico
INSERT INTO player_stats (user_id, rating) SELECT id, 400 FROM users;
INSERT INTO rating_history (user_id, game_id, rating_before, rating_after, delta, reason, created_at)
  SELECT id, NULL, 400, 400, 0, 'inicial', created_at FROM users;
