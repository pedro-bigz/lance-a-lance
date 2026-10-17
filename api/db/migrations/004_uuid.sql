-- 004: id público em UUID v7 (ordenado por tempo), guardado em BINARY(16).
-- O id BIGINT AUTO_INCREMENT continua como chave primária e nas FKs (o InnoDB agrupa pela PK: sequencial mantém as
-- inserções no fim e os índices pequenos), mas não sai mais da API: respostas, rotas, query strings e o JWT usam o uuid.
-- As linhas novas recebem o uuid da API (src/uuid.mjs). As que já existem ganham aqui um v7 montado a partir do
-- created_at (DATETIME em UTC): 48 bits de milissegundos, versão 7, variante RFC e o resto aleatório.
-- Para ler no banco: SELECT BIN_TO_UUID(uuid) FROM users;  (sem o flag de troca: o v7 já é ordenado)
-- papéis (roles) não ganham uuid: saem da API só pelo slug.

ALTER TABLE users ADD COLUMN uuid BINARY(16) NULL AFTER id;
-- updated_at = updated_at: preencher o uuid não conta como edição da conta (sem isso o ON UPDATE troca a data)
UPDATE users SET updated_at = updated_at, uuid = UNHEX(CONCAT(
  LPAD(HEX(TIMESTAMPDIFF(SECOND, '1970-01-01 00:00:00', created_at) * 1000), 12, '0'),
  '7', SUBSTR(HEX(RANDOM_BYTES(2)), 1, 3),
  ELT(1 + FLOOR(RAND() * 4), '8', '9', 'A', 'B'), SUBSTR(HEX(RANDOM_BYTES(8)), 1, 15)));
ALTER TABLE users MODIFY uuid BINARY(16) NOT NULL, ADD UNIQUE KEY users_uuid_unique (uuid);

ALTER TABLE games ADD COLUMN uuid BINARY(16) NULL AFTER id;
UPDATE games SET updated_at = updated_at, uuid = UNHEX(CONCAT(
  LPAD(HEX(TIMESTAMPDIFF(SECOND, '1970-01-01 00:00:00', created_at) * 1000), 12, '0'),
  '7', SUBSTR(HEX(RANDOM_BYTES(2)), 1, 3),
  ELT(1 + FLOOR(RAND() * 4), '8', '9', 'A', 'B'), SUBSTR(HEX(RANDOM_BYTES(8)), 1, 15)));
ALTER TABLE games MODIFY uuid BINARY(16) NOT NULL, ADD UNIQUE KEY games_uuid_unique (uuid);
