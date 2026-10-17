-- 002: papéis de usuário (administrador e jogador).
-- Antes, administrador era quem estava em ADMIN_EMAILS no api/.env; agora o papel fica no banco.
CREATE TABLE IF NOT EXISTS roles (
  id          TINYINT UNSIGNED NOT NULL,
  slug        VARCHAR(30)      NOT NULL,
  name        VARCHAR(60)      NOT NULL,
  created_at  DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY roles_slug_unique (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO roles (id, slug, name) VALUES
  (1, 'administrador', 'Administrador'),
  (2, 'jogador',       'Jogador');

-- toda conta nasce jogadora; o papel não pode ser apagado enquanto houver usuário com ele
ALTER TABLE users
  ADD COLUMN role_id TINYINT UNSIGNED NOT NULL DEFAULT 2 AFTER password,
  ADD KEY users_role_id_idx (role_id),
  ADD CONSTRAINT users_role_fk FOREIGN KEY (role_id) REFERENCES roles (id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- quem estava em ADMIN_EMAILS (api/.env) vira administrador
UPDATE users SET role_id = 1 WHERE email IN ('teste@lance.local');
