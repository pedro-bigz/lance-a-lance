# Lance a Lance (desktop)

App de xadrez para macOS, Windows e Linux: jogue contra bots ou abra um PGN, e o Stockfish classifica
cada lance (brilhante, ótima, melhor, excelente, boa, imprecisão, erro, chance perdida, capivarada).
Funciona offline: motor, biblioteca de xadrez e fontes vão dentro do app.

## Como está montado

- `../lance-a-lance.html` é a fonte única da interface (a mesma página publicada como artifact).
- `scripts/prepare.mjs` gera `app/` a partir dela, trocando as fontes e o chess.js da CDN pelas cópias em `vendor/`.
- `main.js` abre a janela e serve `app/` pelo protocolo `app://`, para o Stockfish rodar num Web Worker.
- `electron-builder.yml` define os instaladores; `build/icon.png` é o ícone (`pnpm icons` gera de novo).
- `.env` tem só o endereço da API (`LANCE_API_URL`). O app pede login (e-mail e senha) antes de abrir o
  tabuleiro; o token JWT fica no processo principal, cifrado com o `safeStorage` em `session.bin` na pasta de
  dados do app, para lembrar o login entre aberturas. Sair, token expirado ou conta bloqueada voltam ao login.
  A API (contas, banco e tutor) está em `../api` — veja o README de lá.
- `preload.js` expõe `window.lanceDesktop.auth` (login, cadastro, perfil), `.admin` (`listUsers`, `getUser`,
  `createUser`, `updateUser`, `deleteUser`, `listRoles`, só para administradores) e `.ai` (tutor). Cada uma é um
  IPC (`auth:*`, `users:update-me`, `admin:*`, `ai:*`) que confere se a chamada veio de `app://lance/` e manda a
  requisição à API com o token da sessão. Um 403 numa rota de administração não desloga: o processo principal
  confere `/v1/auth/me` e só encerra a sessão se a própria conta foi desativada ou bloqueada.
- `.games` (`create`, `update`, `list`, `get`, `remove`) e `.stats` (`me`, `ratingHistory`) são os IPC `games:*` e `stats:*`:
  mesma checagem de origem, ids de usuário e de partida só UUID (texto canônico; número é recusado), corpo da partida com campos conhecidos e até 250 KB (a API valida o resto).
  A página usa essas pontes pelo `GameStore` (comentário "GameStore" em `lance-a-lance.html`): toda partida é salva
  sozinha na conta do usuário, com debounce de ~1 s; se a API cair, a fila fica no localStorage do app (por usuário) e é
  reenviada com espera crescente, inclusive ao reabrir. A pontuação exibida vem de `player_stats` e a variação (+10/−10) da
  resposta da API quando a partida termina. Partidas e pontuação guardadas localmente por versões anteriores do app são
  ignoradas (ficam no localStorage, sem uso). Até a 3.4 essas chaves usavam o id numérico da conta (`u1`, `u7`); a API agora só
  fala UUID. No primeiro login depois da troca, se a sessão guardada era da mesma conta (mesmo e-mail), o processo principal
  entrega à página o id antigo uma única vez (`legacyId` no retorno do login) e a página move as chaves para o uuid
  (`migrateLegacyKeys`). Sem esse vínculo (outra conta, sessão apagada), as chaves antigas ficam sem uso; gravações pendentes que
  apontavam para uma partida pelo id numérico (`s<número>`) são descartadas. A partida aberta no tabuleiro é lembrada por usuário
  (`lance-a-lance:v1:u<uuid>`, mais `:estudo`, a fila `lance-a-lance:fila:u<uuid>` e `lance-a-lance:pontuacao-animada:u<uuid>`)
  e, sem ela, o app retoma a última partida contra bot em andamento na conta.

## Telas (views), sidebar e papéis

Depois do login (ou com a sessão lembrada), a área do app (`#appRoot`) abre sempre no **Início** e é dividida em
telas com rota por hash, navegadas por uma sidebar à esquerda:

| Rota | View | Papéis |
|---|---|---|
| `#/inicio` | Início (padrão após o login): saudação, pontuação e bot recomendado, "Continuar partida" (partida contra bot em andamento, com miniatura da posição), resumo de vitórias/derrotas/empates e as últimas 5 partidas | administrador, jogador |
| `#/jogo` | Tabuleiro: tabuleiro, painel, tutor e o modal de histórico | administrador, jogador |
| `#/estatisticas` | cartões (pontuação, partidas, vitórias, derrotas, empates), lances por classificação com total e média por partida, gráfico da pontuação (7/30/90 dias, 1 ano, tudo) | administrador, jogador |
| `#/historico` | Histórico: todas as partidas, filtro por situação (todas/em andamento/concluídas) e por resultado, "Carregar mais", estado vazio e de erro, excluir com diálogo de confirmação | administrador, jogador |
| `#/admin` | painel de administração: usuários, papéis, ativar/desativar, bloquear, excluir | administrador |

Sidebar: logo, botão **Nova partida** (vai para o tabuleiro e abre a mesma escolha de nível do botão do topo; a partida
em andamento continua salva e pode ser retomada pelo Histórico), um item por view com `nav: true` (Administração só
para administrador), item ativo destacado e, no rodapé, "Recolher menu" e o avatar com o menu da conta (Ver perfil,
Painel de administração, Tema, Sair). Recolhida mostra só os ícones; o estado fica no localStorage
(`lance-a-lance:sidebar:v1`). Em janelas de até 900 px ela vira gaveta, aberta pelo botão de menu do topo e fechada ao
navegar, com Esc ou clicando fora.

Para criar uma tela nova (contrato descrito também no comentário "Telas do app desktop" em `lance-a-lance.html`):

1. HTML: `<section class="view" data-view="NOME" hidden>` dentro de `#appRoot`, ao lado das outras views;
   modais dela ficam fora das views, junto dos outros `.modal`.
2. JS: `VIEWS.NOME = {title: 'Título', roles: ['administrador', 'jogador'], nav: true, icon: 'chave', onShow() {}, onHide() {}}`.
   `nav: true` põe a tela na sidebar, na ordem das chaves de `VIEWS`, com o ícone `NAV_ICONS[icon]` (SVG de traço 24×24;
   crie a chave se precisar) e o texto de `title`; só aparece para quem tem o papel. `onShow`/`onHide` são opcionais.
   Para mudar a tela inicial, troque `DEFAULT_VIEW`.
3. Navegue com um link para `#/NOME`, `showView('NOME')` ou `goView('NOME')` (troca na hora). Quem não tem o papel
   volta para a view padrão com um aviso.

Trocar de tela só esconde/mostra as sections: a partida, o bot e o Stockfish continuam rodando. Controles do topo que
só servem ao jogo têm a classe `game-only` e somem nas outras telas (em janela larga o topo inteiro some fora do
tabuleiro). O tutor só aparece no tabuleiro. Abrir uma partida pelo Início ou pelo Histórico leva ao tabuleiro: em
andamento retoma, concluída abre em revisão. Na página publicada como artifact (sem `window.lanceDesktop`) não há
login, sidebar nem roteamento: aparece direto o jogo, com o botão do histórico em modal.

## Rodar

```bash
corepack pnpm@10.13.1 install
corepack pnpm@10.13.1 start
```

## Gerar instaladores

```bash
corepack pnpm@10.13.1 dist:mac     # .dmg (arm64 e x64)
corepack pnpm@10.13.1 dist:win     # instalador .exe (x64 e arm64)
corepack pnpm@10.13.1 dist:linux   # .AppImage e .deb (x64 e arm64)
```

Os arquivos saem em `dist/`. Do macOS dá para gerar os três sistemas; o workflow
`.github/workflows/desktop.yml` gera cada um no próprio sistema ao criar uma tag `vX.Y.Z`.

## Primeira abertura

O app não tem assinatura de desenvolvedor, então cada sistema pede confirmação uma vez:

- **macOS:** clique com o botão direito no app → Abrir → Abrir. Se aparecer "está danificado", rode
  `xattr -cr "/Applications/Lance a Lance.app"`.
- **Windows:** no aviso do SmartScreen, clique em "Mais informações" → "Executar assim mesmo".
- **Linux:** `chmod +x LanceALance-*.AppImage` e execute; ou instale o `.deb` com `sudo apt install ./LanceALance-*.deb`.

## Licença

GPL-3.0 (o Stockfish é GPL). Fontes do Google Fonts sob a OFL.
