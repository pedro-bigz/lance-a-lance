-- 001: contas de usuário do app.
-- A senha é guardada só como hash (scrypt com salt), nunca em texto.
-- Não há campo de papel: administradores são os e-mails listados em ADMIN_EMAILS no api/.env.
CREATE TABLE IF NOT EXISTS users (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  first_name  VARCHAR(100)    NOT NULL,
  last_name   VARCHAR(100)    NOT NULL,
  email       VARCHAR(255)    NOT NULL,
  password    VARCHAR(255)    NOT NULL,
  active      TINYINT(1)      NOT NULL DEFAULT 1,
  forbidden   TINYINT(1)      NOT NULL DEFAULT 0,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY users_email_unique (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
