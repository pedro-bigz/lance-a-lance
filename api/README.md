# API do Lance a Lance

Contas de usuário (MySQL + JWT), partidas e estatísticas dos jogadores, e o tutor de IA. As chaves das IAs (Gemini, DeepSeek, OpenRouter) e o segredo do JWT ficam só aqui,
no arquivo `.env`; o app desktop não tem chave nenhuma: o usuário entra com e-mail e senha, a API devolve
um token JWT e o app manda esse token em toda chamada ao tutor.

```
app desktop ──login──▶ API (.env com as chaves) ──▶ MySQL (users, roles, games, player_stats, rating_history)
            ──POST /v1/tutor/chat + Bearer JWT──▶ API ──▶ Gemini ─(falhou/sem crédito)─▶ DeepSeek ─▶ OpenRouter
```

Node 22 ou mais novo, `node:http` puro (sem framework: são poucas rotas e um roteador de 20 linhas basta).
Dependências: `mysql2`, `stockfish@19.0.1` (só o lite-single é usado, na pontuação) e `chess.js` 0.10.3 (a mesma da interface, para refazer os lances). Use o pnpm do projeto pelo corepack (não o pnpm global):

```bash
corepack pnpm@10.13.1 install
```

## Banco (MySQL 8.4 no Docker)

```bash
corepack pnpm@10.13.1 db:tls       # 1ª vez: gera a CA e o certificado TLS do MySQL em db/tls/
corepack pnpm@10.13.1 db:up        # docker compose up -d --wait (o container fica com restart: unless-stopped)
corepack pnpm@10.13.1 db:users     # 1ª vez (e sempre que trocar uma senha no .env): cria/ajusta lance_app e lance_migrator
corepack pnpm@10.13.1 db:migrate   # aplica db/migrations/*.sql que ainda não foram aplicadas (como lance_migrator)
corepack pnpm@10.13.1 db:backup    # backup na hora (o automático roda todo dia às 03:00, veja "Backup")
corepack pnpm@10.13.1 db:down      # para o container (os dados ficam no volume lance-a-lance-mysql)
```

As senhas do MySQL estão no `.env`. A porta é **3307** porque a 3306 deste computador já está ocupada por outro
MySQL; o container só aceita conexões de `127.0.0.1`, e só por TLS.

### Usuários do banco (privilégio mínimo)

| Usuário | Senha no `.env` | Pode | Quem usa |
|---|---|---|---|
| `lance_app` | `DB_USER` / `DB_PASSWORD` | `SELECT, INSERT, UPDATE, DELETE` em `lance_a_lance.*` | a API |
| `lance_migrator` | `DB_MIGRATE_USER` / `DB_MIGRATE_PASSWORD` | o mesmo + `CREATE, ALTER, DROP, INDEX, REFERENCES` em `lance_a_lance.*` | `pnpm db:migrate` |
| `root` | `MYSQL_ROOT_PASSWORD` | tudo | administração (DBeaver), `pnpm db:users`, backup |

Os três (`@'%'`) exigem TLS (`REQUIRE SSL`). `scripts/db-users.mjs` (`pnpm db:users`) cria os dois primeiros a partir do `.env`
e acerta senha, `REQUIRE SSL` e privilégios (concede o que falta e revoga o que sobra, inclusive globais, de outros bancos e
por tabela); é idempotente. O `docker-compose.yml` não cria mais `lance_app` (a imagem do MySQL daria `ALL PRIVILEGES` a ele).
A API não usa `LOCK TABLES` nem tabelas temporárias; `SELECT … FOR UPDATE` só precisa de `SELECT` e `UPDATE`.
Uma migração que precise de algo além da lista (view, trigger, procedure) exige incluir o privilégio em `scripts/db-users.mjs`
e rodar `pnpm db:users` de novo.

### TLS

O MySQL usa uma CA própria e um certificado de servidor gerados por `scripts/db-tls.sh` (`pnpm db:tls`) em `db/tls/`:

| Arquivo | O que é |
|---|---|
| `ca.pem` | certificado da CA: a API (`DB_SSL_CA`), o DBeaver e o Workbench usam para verificar o servidor |
| `ca-key.pem` | chave da CA (600): só para emitir certificado novo; não vai para o container |
| `server-cert.pem` | certificado do servidor (825 dias), SAN `IP:127.0.0.1`, `DNS:localhost`, `DNS:mysql`, `DNS:lance-a-lance-mysql` |
| `server-key.pem` | chave do servidor (600), montada só leitura no container |

`db/tls/` está no `.gitignore` e não entra no app desktop (o `electron-builder.yml` só empacota `desktop/`). O compose monta
os três arquivos do servidor e liga `require_secure_transport=ON` (TLS 1.2/1.3): conexão sem TLS é recusada.

A API e os scripts (`db:migrate`, `db:users`) conectam com `ssl: { ca, rejectUnauthorized: true, verifyIdentity: true }`:
conferem a cadeia e o nome do host (`DB_HOST`) contra o certificado. `DB_SSL` só aceita `required`; se a CA de `DB_SSL_CA`
não existir, a API não sobe e explica no log (nunca conecta sem TLS). Com `DB_HOST=127.0.0.1` o mysql2 confere o nome
`localhost` (ele não manda IP no SNI), que também está no certificado.

Renovar o certificado do servidor (antes de vencer; a data aparece em `pnpm db:tls`):
`pnpm db:tls -- --force-server` e `docker compose up -d --force-recreate --wait`. `--force` gera também uma CA nova (aí é
preciso apontar a CA nova no DBeaver/Workbench).

### DBeaver / MySQL Workbench

| Campo    | Valor                                  |
|----------|----------------------------------------|
| Host     | `127.0.0.1`                            |
| Porta    | `3307`                                 |
| Banco    | `lance_a_lance`                        |
| Usuário  | `lance_app` (só leitura e escrita de dados) ou `root` |
| Senha    | `DB_PASSWORD` (ou `MYSQL_ROOT_PASSWORD`) no `api/.env` |

TLS é obrigatório:

- **DBeaver** (conexão → Edit Connection → aba **SSL**): marque **Use SSL** e **Require SSL**; para verificar o servidor,
  marque **Verify server certificate** e em **CA Certificate** aponte `api/db/tls/ca.pem` (deixe certificado/chave do cliente
  vazios). Se aparecer "Public Key Retrieval is not allowed", em **Driver properties** coloque `allowPublicKeyRetrieval=true`.
- **MySQL Workbench** (Manage Server Connections → aba **SSL**): **Use SSL** = `Require` (ou `Require and Verify CA` /
  `Require and Verify Identity` com **SSL CA File** = `api/db/tls/ca.pem`); deixe **SSL Key**/**SSL CERT** vazios.

`lance_app` não pode criar, alterar nem apagar tabelas; para mexer no schema pelo cliente use `root` (ou, melhor, uma migração).

### Migrações

Ficam em `db/migrations/NNN_descricao.sql` e são aplicadas em ordem; cada uma aplicada é registrada na
tabela `schema_migrations`. Para mudar o banco, crie um arquivo novo (`003_...sql`) em vez de editar um antigo.

| Migração | O que faz |
|---|---|
| `001_create_users.sql` | tabela `users` |
| `002_roles.sql` | tabela `roles` (`1 administrador`, `2 jogador`) e `users.role_id` (FK, padrão jogador); quem estava no antigo `ADMIN_EMAILS` (`teste@lance.local`) virou administrador |
| `003_games_stats.sql` | tabelas `games`, `player_stats` e `rating_history`; cada usuário existente ganhou a linha de `player_stats` com 400 e o ponto `inicial` no histórico |
| `004_uuid.sql` | coluna `uuid BINARY(16) NOT NULL UNIQUE` em `users` e `games`; as linhas existentes ganharam um UUID v7 montado a partir do `created_at` (sem mexer no `updated_at`) |
| `006_rating_analysis.sql` | pontuação pelo Stockfish no servidor: em `games`, `rating_status` (`pending`/`applied`/`failed`; NULL = não vale ou é anterior), `rating_attempts`, `player_accuracy`, `bot_elo`, `expected_score`, `engine_version`, `rating_applied_at` e o índice `games_rating_status_idx`; em `rating_history`, `player_accuracy`, `bot_elo`, `expected_score`. Só `ADD COLUMN` (INSTANT) e índice online: a API antiga continua funcionando com o banco migrado |
| `005_player_stats_english_columns.sql` | renomeia as colunas de classificação de `player_stats` para inglês (`livro`→`book_moves`, `brilhante`→`brilliant_moves`, `otima`→`great_moves`, `melhor`→`best_moves`, `excelente`→`excellent_moves`, `boa`→`good_moves`, `imprecisao`→`inaccuracies`, `erro`→`mistakes`, `chance_perdida`→`missed_wins`, `capivarada`→`blunders`); `RENAME COLUMN` instantâneo, sem mexer nos dados nem no `updated_at` |

Padrão de nomes: tabelas, colunas, índices e constraints **só em inglês**, `snake_case`. Valores guardados (status, motivo,
classificação do lance em `moves[].cls`, slug de papel) são dados do app e seguem em português.

### Ids: numérico por dentro, UUID por fora

`users.id` e `games.id` (BIGINT AUTO_INCREMENT) continuam como chave primária e nas FKs: o InnoDB agrupa a tabela pela PK, e
um id sequencial mantém as inserções no fim e os índices pequenos. Esse id **nunca sai nem entra pela API**. Para fora, usuário
e partida são identificados pela coluna `uuid` (`BINARY(16)`, índice único): UUID **v7** (RFC 9562, 48 bits de milissegundos +
versão 7 + bits aleatórios), gerado em `src/uuid.mjs` (`uuidv7()`, `toBin`, `fromBin`, `isUuid`) a cada INSERT. É gravado na
ordem natural dos bytes (sem o flag de troca do `UUID_TO_BIN`), porque o v7 já começa pelo tempo e o índice cresce em ordem.
Para ler no banco: `SELECT BIN_TO_UUID(uuid), email FROM users;`. Papéis saem só pelo `slug`; `rating_history` não tem id público
(os pontos saem sem id e a partida vai pelo uuid dela).

### Schema

```
roles  id TINYINT UNSIGNED PK · slug VARCHAR(30) UNIQUE · name VARCHAR(60) · created_at
users  id BIGINT UNSIGNED PK (interno) · uuid BINARY(16) UNIQUE (id público, v7) · first_name · last_name · email UNIQUE · password (hash scrypt)
       role_id TINYINT UNSIGNED NOT NULL DEFAULT 2 → roles.id (ON DELETE RESTRICT, ON UPDATE CASCADE)
       active · forbidden · created_at · updated_at

games  id BIGINT UNSIGNED PK (interno) · uuid BINARY(16) UNIQUE (id público, v7) · client_ref VARCHAR(40) UNIQUE NULL (id gerado no app; deixa o POST idempotente)
       white_user_id, black_user_id BIGINT UNSIGNED NULL → users.id (ON DELETE SET NULL); contra bot o lado do bot é NULL
       opponent_type ENUM('bot','humano','analise') · bot_level VARCHAR(30) NULL · mode ENUM('normal','assistido')
       status ENUM('em_andamento','concluida','abandonada') · result ENUM('1-0','0-1','1/2-1/2') NULL · result_reason VARCHAR(30) NULL
       start_fen VARCHAR(100) NULL · pgn TEXT · moves JSON [{uci, san, cls}] · meta JSON (dados da tela) · opening_name
       ply_count · rated (vale pontuação) · rating_delta SMALLINT NULL
       rating_status ENUM('pending','applied','failed') NULL · rating_attempts · player_accuracy DECIMAL(5,2) · bot_elo · expected_score DECIMAL(5,4)
       engine_version VARCHAR(40) · rating_applied_at (pontuação pelo Stockfish, migração 006)
       stats_applied (resultado já somado) · counted_moves JSON (lances já somados, por cor)
       started_at · finished_at · created_at · updated_at
       índices: uuid (único), (white_user_id, status), (black_user_id, status), (white_user_id, finished_at), (black_user_id, finished_at)

player_stats  user_id PK → users.id (ON DELETE CASCADE) · rating (padrão 400) · games_played · wins · losses · draws
       games_classified (concluídas com lances classificados, base das médias)
       book_moves · brilliant_moves · great_moves · best_moves · excellent_moves · good_moves · inaccuracies · mistakes
       missed_wins · blunders (um contador por classificação de lance; src/move-classes.mjs liga cada valor de cls à coluna)
       total_moves · updated_at
       (users: índice único users_uuid_unique; games: games_uuid_unique)

rating_history  id PK · user_id → users.id (CASCADE) · game_id → games.id (SET NULL) · rating_before · rating_after · delta
       reason ('inicial', 'vitoria', 'derrota', 'empate') · player_accuracy · bot_elo · expected_score (006) · created_at · índice (user_id, created_at)
```

A regra "toda partida tem pelo menos um usuário" fica na API (quem cria a partida é sempre ligado a um lado), porque o
MySQL não aceita CHECK em coluna com ação de FK. Ao excluir uma conta, `user-store.deleteUser` apaga antes as partidas
em que ela é o único usuário (contra bot, análise); partidas contra outro usuário ficam, com o lado dela NULL.
`player_stats` e `rating_history` da conta somem pelo CASCADE. Um usuário criado depois da migração ganha a linha de
`player_stats` (400 + ponto `inicial`) na primeira vez que a API precisa dela.

### Tabelas novas ligadas a usuários (jogos, estatísticas…)

A exclusão de usuário pelo painel é **definitiva** (`DELETE FROM users`). Toda FK nova para `users.id` precisa
dizer o que acontece com as linhas dela:

- `ON DELETE CASCADE` para dados que só fazem sentido com o dono (ex.: partidas e estatísticas do jogador);
- `ON DELETE SET NULL` (coluna anulável) para registros que devem sobreviver sem o autor (ex.: logs, partidas
  contra outro usuário em que o adversário foi excluído).

Use `users.id` como `BIGINT UNSIGNED` na FK (o uuid é só para fora; nas respostas, troque pelo uuid com um JOIN). Uma FK sem uma dessas opções faz o DELETE falhar; a API responde 409
("tem registros ligados a ela") e sugere desativar a conta.

## Iniciar a API

```bash
corepack pnpm@10.13.1 start        # node --env-file=.env server.mjs
```

`GET /health` é público e mostra só se o tutor está pronto (`ai.ready`) e se o banco responde; o estado de cada IA
(com ou sem chave, pausada) aparece só no log da API. Para o tutor funcionar basta uma chave (`GEMINI_API_KEY`, `DEEPSEEK_API_KEY` ou `OPENROUTER_API_KEY`) no
`.env`; com mais de uma, a API troca sozinha quando uma falha.

```bash
corepack pnpm@10.13.1 test   # node:test: IA (fetch simulado), fórmula, fila e análise (motor falso), Stockfish real numa partida curta
# com o banco e a API de verdade (conta temporária, apagada no fim):
LANCE_DB_TESTS=1 node --env-file=.env --test test/rating-api.integration.test.mjs
```

## Variáveis (`.env`, modelo em `.env.example`)

- `AI_PROVIDER_ORDER` (padrão `gemini,deepseek,openrouter`), `AI_TIMEOUT_MS` (por provedor), `AI_QUOTA_COOLDOWN_MIN` — tutor.
- `GEMINI_API_KEY`/`GEMINI_MODEL`, `DEEPSEEK_API_KEY`/`DEEPSEEK_MODEL`, `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` (e `*_URL` opcionais).
- `HOST`, `PORT` — endereço da API (padrão `127.0.0.1:8787`).
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` — banco (a API entra com `DB_USER`, só DML).
- `DB_MIGRATE_USER`, `DB_MIGRATE_PASSWORD` — usuário das migrações (DDL); `pnpm db:migrate` falha com mensagem clara sem eles.
- `MYSQL_ROOT_PASSWORD` — root do MySQL (compose, `pnpm db:users`, backup).
- `DB_SSL` (só `required`), `DB_SSL_CA` (padrão `db/tls/ca.pem`, relativo a `api/`) — TLS com o banco.
- `JWT_SECRET` (32+ caracteres; trocar desloga todo mundo), `JWT_EXPIRES_IN` (`30m`, `12h`, `7d`).
- `RATE_LIMIT_PER_MIN` (tutor) e `AUTH_RATE_LIMIT_PER_MIN` (login e cadastro), por cliente.

## Tutor de IA (`src/ai/`)

As IAs são tentadas na ordem de `AI_PROVIDER_ORDER`. Quando uma dá erro (sem crédito, chave recusada, fora do ar,
demora), o pedido passa para a próxima na mesma requisição, e o app nem percebe a troca, só o nome de quem respondeu.

| Arquivo | Papel | Padrão |
|---|---|---|
| `chat-provider.mjs` | fluxo de uma chamada `/chat/completions` (corpo, timeout, resposta, erro) | Template Method |
| `providers.mjs` | Gemini, DeepSeek e OpenRouter: só o que cada um muda (cabeçalhos, códigos de erro) | herança dos ganchos |
| `errors.mjs` | tipos de falha (`FAILURE`) que todos os provedores usam | — |
| `circuit-breaker.mjs` | pausa quem falhou (sem crédito/chave recusada: `AI_QUOTA_COOLDOWN_MIN`; limite por minuto: 1 min; fora do ar: 30 s) | Circuit Breaker |
| `fallback-chain.mjs` | tenta um após o outro; pausados vão para o fim, mas ainda são tentados se os outros falharem | Chain of Responsibility |
| `index.mjs` | cria os provedores a partir do `.env` e monta a cadeia | Factory |

Para incluir outro provedor compatível com a OpenAI: subclasse em `providers.mjs`, entrada em `AI.providers`
(`config.mjs`), uma linha em `PROVIDER_CLASSES` (`index.mjs`) e o id em `AI_PROVIDER_ORDER`.

## Rotas

Todas respondem JSON. Erros vêm como `{ok: false, error}` com o status certo: 400 (JSON inválido),
401 (sem login / token inválido ou expirado), 403 (conta desativada ou bloqueada, ou papel sem permissão),
404, 409 (e-mail já usado ou proteção de administrador, veja abaixo), 422 (campo inválido), 429 (muitas requisições).
Rotas protegidas exigem `Authorization: Bearer <token>`. O hash da senha nunca sai da API.

**Ids**: todo `:id` de rota, todo `?user_id=` e todo campo de id nas respostas (`id`, `white_user_id`, `black_user_id`,
`user_id`, `game_id`, `deleted.id`) é um UUID em texto canônico (minúsculo, com hífens, ex. `01a14569-3830-774d-8f87-283aeeccca3a`).
`:id` fora desse formato (número, maiúsculas, espaço, sem hífens) dá 404, a mesma resposta de "não existe"; `?user_id=` inválido
também é 404. Nenhum id numérico do banco aparece em resposta nenhuma.

| Método | Rota | Quem | O que faz |
|---|---|---|---|
| GET | `/health` | público | `{ok, deepseek, model, db}` |
| POST | `/v1/auth/register` | público | `{first_name, last_name, email, password}` → cria a conta ativa e devolve `{token, expires_in, user}` |
| POST | `/v1/auth/login` | público | `{email, password}` → `{token, expires_in, user}`; 401 genérico para credencial errada, 403 se desativada/bloqueada |
| GET | `/v1/auth/me` | logado | `{user}` |
| GET | `/v1/users/me` | logado | `{user}` |
| PATCH | `/v1/users/me` | logado | `first_name`, `last_name`, `email`; trocar a senha exige `password` + `current_password` |
| GET | `/v1/users?q=&limit=&offset=` | administrador | lista paginada `{users, total, limit, offset}`; `q` busca em nome, sobrenome, nome completo e e-mail; `limit` 1–200 (padrão 50) |
| GET | `/v1/users/:id` | administrador | um usuário (`:id` = uuid) |
| POST | `/v1/users` | administrador | cria (`first_name`, `last_name`, `email`, `password`, opcional `role`, `active`, `forbidden`); sem `role` nasce jogador |
| PATCH | `/v1/users/:id` | administrador | edita qualquer campo: nome, sobrenome, e-mail, `password` (redefine sem a atual), `role`, `active`, `forbidden` |
| DELETE | `/v1/users/:id` | administrador | exclui de vez; responde `{deleted: user}` |
| GET | `/v1/roles` | administrador | `{roles: [{slug, name, created_at}]}` (sem id: o papel é o `slug`) |
| POST | `/v1/games` | logado | cria a partida do usuário (veja abaixo); com um `client_ref` já usado por ele, atualiza a mesma partida (200) |
| PATCH | `/v1/games/:id` | quem jogou | atualiza lances, PGN, modo, estado; concluída só aceita as classificações que faltavam |
| GET | `/v1/games?status=&limit=&offset=&user_id=` | logado | lista resumida (sem `moves`/`pgn`) da mais recente para a mais antiga: `{games, total, limit, offset}`; `limit` 1–100 (padrão 20) |
| GET | `/v1/games/:id` | quem jogou ou administrador | partida completa (com `moves`, `pgn`, `start_fen`) |
| GET | `/v1/games/:id/rating` | quem jogou ou administrador | estado da pontuação: `{game_id, rating_status, rating_change, rating}` (veja "Pontuação pelo Stockfish") |
| DELETE | `/v1/games/:id` | quem jogou | exclui a partida (`{deleted: {id}}`, o uuid); pontuação e estatísticas já somadas ficam (o ponto do histórico perde o `game_id`) |
| GET | `/v1/stats/me?user_id=` | logado | `{stats}`: totais, pontuação e cada tipo de lance com total e média por partida |
| GET | `/v1/stats/me/rating-history?from=&to=&group=&tz=&user_id=` | logado | pontos para o gráfico da pontuação |
| POST | `/v1/tutor/chat` | logado | corpo `{messages, tools}` no formato de chat da OpenAI; responde `{ok, provider, provider_name, message, finish, usage}`; sem IA configurada ou todas falharam: 503 `tutor_indisponivel` com mensagem genérica (o motivo de cada IA vai só para o log) |

`user` = `{id (uuid), first_name, last_name, email, role, role_name, active, forbidden, created_at, updated_at}`,
com `role` = `'administrador' | 'jogador'`. O cadastro público cria sempre jogador (mandar `role` dá 422).

A conta é conferida no banco a cada requisição: desativar, bloquear ou mudar o papel vale na hora, mesmo com
token válido. O JWT leva `{sub, email, role}`, com `sub` = uuid do usuário; o papel do token é só informativo (a autorização
usa o do banco). Token com `sub` em outro formato, inclusive os de antes dos uuids (`sub` numérico), é recusado com 401.

### Partidas e estatísticas

Tudo é do usuário logado; `?user_id=<uuid>` (nas rotas de leitura) só vale para administradores (jogador recebe 403). Partida de
outra pessoa responde 404 (para não revelar que existe); administrador que tenta editar ou excluir partida alheia, 403.
As rotas de partidas e estatísticas têm limite próprio de 300 requisições por minuto.

Corpo do `POST /v1/games` (todos opcionais, exceto `bot_level` contra bot):
`client_ref`, `opponent_type` (`bot` padrão, `analise` para tabuleiro livre e PGN importado; `humano` existe no banco mas a API
ainda não cria), `bot_level` (`novato`, `iniciante`, `intermediario`, `avancado`, `mestre`, `gm`), `color` (`w`/`b`, o lado de
quem cria), `start_fen`, `started_at` (ISO), mais os campos do PATCH. O `PATCH` aceita `moves`, `pgn`, `meta`, `opening_name`,
`status`, `result`, `result_reason`, `mode`, `rated`; campo desconhecido é 422.

Validação: corpo até 256 KB (413), PGN até 20.000 caracteres, até 1.000 lances (`uci` no formato `e2e4`/`e7e8q`, `san` até 12
caracteres, `cls` uma das classificações ou `null`; `chance` vira `chance_perdida`), `meta` até 8 KB, `opening_name` até 160.
`result_reason`: `xeque_mate`, `desistencia`, `afogamento`, `repeticao`, `material_insuficiente`, `regra_50_lances`, `encerrada`,
`importada`, `tempo`, `acordo`.

Regras:

- **Vale pontuação** (`rated`) só no modo normal contra bot. Pode deixar de valer a qualquer momento (trocar para o assistido
  tira); só passa a valer antes do primeiro lance. Pedido fora da regra é corrigido em silêncio para `false`.
- **Conclusão** (`status: concluida`) exige `result_reason` e, salvo `encerrada`/`importada`, `result`. Numa partida que vale
  pontuação, `encerrada` sem resultado vira derrota de quem jogou (a regra do app: "Encerrar e avaliar" conta como derrota).
- Ao concluir, numa transação que trava a linha da partida (`SELECT … FOR UPDATE`) e as de `player_stats`:
  1. se `stats_applied = 0`: soma vitória/derrota/empate (do ponto de vista de cada usuário ligado) e `games_played`; se vale
     pontuação, marca `rating_status = 'pending'` (a pontuação sai depois, pela fila de análise; veja "Pontuação pelo
     Stockfish"); marca `stats_applied = 1`. Concluir de novo não soma de novo.
  2. conta os lances classificados **de cada usuário** (só os da cor dele) e soma em `player_stats` a diferença para o que
     já tinha contado (`counted_moves`). Assim as classificações que chegam depois (o Stockfish termina de avaliar depois do
     fim) entram quando chegam, e reenviar não duplica. `games_classified` conta as partidas com algum lance contado.
  Partidas `analise` ficam fora das estatísticas.
- **Concluída é final**: lances diferentes, outro resultado ou voltar para em andamento dão 409. Reenviar os mesmos valores
  é aceito (o app manda a partida inteira a cada gravação); `moves` com os mesmos lances só preenche classificações que
  estavam vazias (as já gravadas não mudam); `pgn`, `meta` e `opening_name` ficam como estavam.
- A resposta de POST/PATCH é `{game, rating_change, rating}`: numa partida concluída que vale pontos,
  `rating_change = {status: 'pending', before, after, delta: 0}` (before = after = pontuação atual: um app antigo só vê
  "sem mudança") até a análise terminar; depois, `{status: 'applied', before, after, delta, accuracy, bot_elo,
  expected_score, engine_version}`; `rating` = pontuação atual. Partidas antigas (+10/−10) saem como `applied` com
  `accuracy` null e não são recalculadas.

`game` (inclui `rating_status` e `player_accuracy`) = `{id (uuid da partida), client_ref, white_user_id, black_user_id (uuid de cada lado ou null), color (lado de quem pediu), opponent_type, bot_level, mode, status,
result, result_reason, outcome ('vitoria'|'derrota'|'empate'|null, do ponto de vista de quem pediu), opening_name, ply_count,
rated, rating_delta, meta, started_at, finished_at, created_at, updated_at}` e, na leitura completa, `start_fen`, `pgn`, `moves`.

`stats` = `{user_id (uuid), rating, games_played, wins, losses, draws, games_classified, total_moves, avg_moves, moves: {book_moves:
{total, avg}, brilliant_moves, great_moves, best_moves, excellent_moves, good_moves, inaccuracies, mistakes, missed_wins, blunders},
updated_at}`; as chaves de `moves` são as colunas de `player_stats` (classificação `livro` → `book_moves`, …, `chance_perdida` →
`missed_wins`, `capivarada` → `blunders`); `avg` = total ÷ `games_classified` (2 casas).

`rating-history`: `from`/`to` em `AAAA-MM-DD` (dia inteiro, UTC) ou ISO; `group` = `day`, `week` (começa na segunda) ou
`month`, agrupando no fuso `tz` (minutos a somar ao UTC, ex. `-180`). Sem `group`, um ponto por mudança:
`{at, rating, delta, games, reason, game_id (uuid da partida ou null)}`; agrupado, o último valor de cada período: `{at, rating, delta (soma), games, min,
max}`. Vem também `start_rating` (pontuação no começo do período, para a linha começar na borda) e `current_rating`.

### Pontuação pelo Stockfish

Os pontos de cada partida que vale pontuação dependem do resultado, da força do bot em relação ao rating do jogador e da
precisão dos lances do jogador, medida pelo Stockfish **no servidor** (o app não manda nem consegue mudar nada disso: a API
usa só os lances e a posição inicial gravados). A fórmula é uma só, em `../shared/rating.mjs`, importada também pela
interface (rating local do artifact):

1. **Precisão** (0–100) só dos lances do jogador: chance de vitória antes/depois do lance pela mesma curva da interface
   (`WP_K = 0.00368208`), perda Δ = max(0, antes − depois) (0 se o lance é o melhor do motor ou dá mate), precisão do
   lance = `103,1668·e^(−0,04354·Δ) − 3,1669` em [0, 100]; lance de livro = 100. Precisão da partida = **média harmônica
   ponderada** Σw / Σ(w / max(10, a)), com peso w = max(0,1; 4p(1−p)), p = chance antes ou depois (a maior). Medido em
   partidas reais: a média simples dava 95 a quem perdeu para o Grão-mestre jogando ao acaso (depois de perdida, todo
   lance "perde 0"); a ponderada dá 68–70 nesse caso e 96–99 nas partidas limpas.
2. **Expectativa**: `E = 1 / (1 + 10^((eloBot − rating)/400))`, com o Elo nominal do nível (`BOT_ELO`, o mesmo da interface).
3. **Base** `32·(S − E)`; vitória × (0,5 + precisão/100); derrota × (1,5 − precisão/100); empate `32·(0,5 − E) + (precisão − 70)/10`.
4. **Limites**: vitória +4…+25, derrota −25…−4, empate −10…+10, inteiro; rating mínimo 100.
5. **Antiabuso**: desistir/encerrar com menos de 6 lances do jogador = derrota com precisão 0. Lances ilegais, ou um
   resultado que o tabuleiro não confirma (vitória sem mate do bot, empate sem empate no tabuleiro), contam como derrota
   com precisão 0.

| Arquivo | Papel |
|---|---|
| `src/engine/base.mjs` | `UciEngine`: processo filho (`node stockfish-19-lite-single.js`), UCI por stdin/stdout, prazos, `analyse(fen, lances, {depth})`; ganchos por versão (Template Method) |
| `src/engine/sf19-lite.mjs`, `registry.mjs` | Stockfish 19 lite (`stockfish@19.0.1`, só o lite-single); `ENGINE_ID` e `ANALYSIS` (profundidade fixa) num lugar só |
| `src/rating/book.mjs` | livro de aberturas da interface (`ui/src/book/data.generated.json` + `shared/book-hash.mjs`) |
| `src/rating/analyse-game.mjs` | refaz os lances com o chess.js (legalidade, mate/empate no tabuleiro) e mede a precisão |
| `src/rating/compute.mjs` | do resultado + análise ao delta (fórmula única) |
| `src/rating/queue.mjs` | fila no processo da API: uma análise por vez, sem duplicar, até 3 tentativas com intervalo crescente |
| `src/rating/store.mjs` | banco: pendentes e a aplicação numa transação com `FOR UPDATE` (aplica uma vez só) |
| `src/rating/index.mjs` | monta a fila; o motor sobe na primeira análise e é encerrado depois de 60 s parado |

Fluxo: a conclusão grava o resultado e as estatísticas como antes e deixa `rating_status = 'pending'`; depois do commit a
partida entra na fila. A análise usa `Threads 1`, `Hash 16`, `MultiPV 1`, **profundidade 14** fixa e `ucinewgame` a cada
partida (determinística: a mesma partida dá a mesma precisão). No fim, a transação trava a partida e a linha de
`player_stats`, confere que ainda está pendente, aplica o delta, grava `rating_history` (motivo, precisão, Elo do bot,
expectativa) e as colunas da partida (`rating_status = 'applied'`). Falha → `failed` com `rating_attempts + 1` e nova
tentativa (até 3; a rota mostra `pending` enquanto há tentativas); ao iniciar, a API põe de volta na fila as pendentes e as
falhas com tentativas sobrando. O app pergunta em `GET /v1/games/:id/rating` até o `status` sair de `pending`.

Custo medido (Mac, uma thread): partida de 38 lances do jogador (74 posições) — profundidade 12: 0,6 s; **14: 2,1 s**;
15: 12 s; 16: 18 s; 18: 36 s; a precisão muda menos de 1,5 ponto entre 14 e 18. Memória: o processo do Stockfish fica em
~140–150 MB enquanto ativo (encerrado depois de 60 s sem trabalho); a API não cresce.

### Papéis e proteções

- `auth.requireRole(req, ...papeis)` exige login (com a checagem de active/forbidden) e um dos papéis;
  `auth.requireAdmin(req)` é o atalho para `administrador`. Jogador recebe 403 nas rotas de administrador.
- Um administrador não pode excluir, desativar, bloquear nem rebaixar a si mesmo (409).
- O sistema nunca fica sem administrador ativo (papel administrador, `active` e não `forbidden`): editar ou
  excluir o último dá 409. A conferência roda numa transação que trava as linhas dos administradores, então
  dois administradores rebaixando ou excluindo um ao outro ao mesmo tempo não zeram a lista (o segundo leva
  403 ou 409).
- Contas de teste: `teste@lance.local` (administradora, senha no `.env` em `# TEST_USER_PASSWORD=`) e
  `jogador@lance.local` (jogadora, `# TEST_PLAYER_PASSWORD=`).

## Segurança

- Senhas com `scrypt` (N=16384, r=8, p=1) e salt aleatório, no formato `scrypt$N=…,r=…,p=…$salt$hash`;
  comparação em tempo constante. Mínimo de 8 caracteres.
- JWT HS256 assinado com `JWT_SECRET`, feito com `node:crypto`; o app guarda o token no processo principal
  (cifrado pelo chaveiro do sistema), nunca na página.
- Por padrão a API só aceita conexões deste computador (`HOST=127.0.0.1`), corpo de até 400 KB (256 KB nas partidas).
  Acima do limite a API responde 413 e descarta o resto do corpo.
- O `.env` está no `.gitignore` e tem permissão só para o seu usuário.
- Banco: a API entra com `lance_app` (só `SELECT/INSERT/UPDATE/DELETE`), as migrações com `lance_migrator`; o root
  fica para administração. Toda conexão de rede ao MySQL é por TLS verificado (veja "Banco → TLS").

## Backup

`scripts/backup-db.sh` (`pnpm db:backup`) faz `mysqldump --single-transaction --routines --triggers --events --hex-blob` de
dentro do container (root pelo socket; a senha vem da variável do próprio container, não aparece em linha de comando nem em
arquivo), comprime com gzip e grava em **`~/Backups/lance-a-lance/lance_a_lance-AAAAMMDD-HHMMSS.sql.gz`** (pasta 700,
arquivos 600). Antes de aceitar o arquivo, confere o gzip, o fim do dump e as 6 tabelas; se o Docker ou o container não
estiverem de pé, sai com erro sem deixar arquivo. Mantém os **14 mais recentes** e apaga os mais antigos. Log em
`~/Library/Logs/lance-a-lance/backup.log` (e `launchd.log`, a saída do agendamento).

**Agendamento** (macOS): LaunchAgent `~/Library/LaunchAgents/com.lance-a-lance.backup.plist`, todo dia às 03:00
(`StartCalendarInterval`). Se o Mac estiver dormindo, roda quando acordar; desligado, pula o dia.

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.lance-a-lance.backup.plist   # ligar (carregar)
launchctl kickstart -p gui/$(id -u)/com.lance-a-lance.backup                              # rodar agora
launchctl print gui/$(id -u)/com.lance-a-lance.backup | grep -E 'state|last exit'         # ver estado
launchctl bootout gui/$(id -u)/com.lance-a-lance.backup                                   # desligar
```

Para desligar de vez, `bootout` e apague o `.plist`. Se mudar a pasta do projeto, ajuste o caminho do script no `.plist`.

**Restaurar** (o dump não tem `CREATE DATABASE`/`USE`, então entra no banco que você indicar). Teste primeiro num banco à parte:

```bash
F=~/Backups/lance-a-lance/lance_a_lance-AAAAMMDD-HHMMSS.sql.gz
docker exec lance-a-lance-mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -e "CREATE DATABASE lance_a_lance_restore_test"'
gzip -dc "$F" | docker exec -i lance-a-lance-mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot lance_a_lance_restore_test'
# confira e depois: DROP DATABASE lance_a_lance_restore_test
```

Para voltar o banco de verdade: pare a API, faça um `pnpm db:backup` do estado atual e troque `lance_a_lance_restore_test`
por `lance_a_lance` no comando acima (as tabelas são recriadas com `DROP TABLE IF EXISTS`). Usuários e privilégios não estão
no dump: rode `pnpm db:users` se o banco for novo.

O backup fica **no mesmo disco** do banco: copie a pasta `~/Backups/lance-a-lance/` para fora desta máquina (disco externo,
Time Machine ou nuvem de sua escolha) para se proteger de perda do disco.
