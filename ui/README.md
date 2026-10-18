# Lance a Lance: interface

A interface do app (tabuleiro, análise pelo Stockfish, estudo de aberturas, tutor e as telas do app desktop) em
Vite + TypeScript + React 19. A página inteira é uma árvore React (`app/app.tsx`); as regras, o motor, o livro e o estado da
partida continuam em módulos TypeScript sem React, expostos por um store observável (veja "React e o estado do jogo"
abaixo). O build gera
**um único HTML** que é usado em dois lugares:

- **App desktop** (`../desktop`): `desktop/scripts/prepare.mjs` roda o build e monta `desktop/app/` a partir de
  `dist/lance-a-lance.html`, trocando as fontes do Google pelas cópias locais.
- **Artifact do claude.ai**: publica-se `dist/lance-a-lance.html` com `dist/stockfish.asm.js` e `dist/pieces/` como
  arquivos de apoio (mesmos caminhos relativos). Sem `window.lanceDesktop` a página roda sem login, com o localStorage e
  com o tutor pelo Claude da conta (`window.claude.use('sample')`).

## Comandos

Use o pnpm do projeto pelo corepack (o pnpm global 11.x quebra o `node_modules` dos projetos 10.x):

```bash
corepack pnpm@10.13.1 install
corepack pnpm@10.13.1 dev                  # servidor do Vite (modo artifact, sem login) em http://localhost:5173
corepack pnpm@10.13.1 build                # dist/lance-a-lance.html + dist/stockfish.asm.js + dist/pieces/
corepack pnpm@10.13.1 typecheck            # tsc --noEmit (strict)
corepack pnpm@10.13.1 lint                 # ESLint (typescript-eslint) + prettier --check
corepack pnpm@10.13.1 format               # prettier --write
corepack pnpm@10.13.1 test --maxWorkers=2  # Vitest (lógica pura e componentes React com jsdom)
```

Testes: passe o limite de workers **sem** `--` (`pnpm test --maxWorkers=2`). No pnpm 10, `pnpm test -- --maxWorkers=2`
repassa o `--` ao Vitest, que ignora tudo o que vem depois dele.

## Build

- `vite build` com `vite-plugin-singlefile` embute o JS (inclusive o chess.js 0.10.3, vindo do npm) e o CSS no HTML.
  O CSS não é minificado nem reescrito (`cssMinify: false`): sai como está em `src/styles/`.
- `scripts/finalize.mjs` transforma o `dist/index.html` em `dist/lance-a-lance.html`: tira o esqueleto (`<!doctype>`,
  `<html>`, `<head>`, metas e o bloco `data-dev-only` de `index.html`, que só imita no `pnpm dev` o esqueleto que o
  artifact e o desktop põem em volta) e põe o script do app (módulo, inline) no fim, depois da marcação.
- `public/stockfish.asm.js` e `public/pieces/` são copiados como estão para `dist/`.
- O livro de aberturas (~420 KB) é `src/book/data.generated.json`, gerado por `../tools/gerar-livro.mjs` (que usa o
  chess.js de `node_modules`; instale as dependências antes). Não edite o JSON à mão.

## Módulos (`src/`)

Os módulos só definem funções, tipos e estado. `main.tsx` monta a árvore React e liga os atalhos do `document` chamando
as funções `init…()` **na mesma ordem da antiga página única**: vários atalhos de teclado conferem `e.defaultPrevented` de
quem registrou antes (Esc fecha primeiro o menu ⋮, depois a nova partida, o estudo, o histórico ou o estilo, o menu da
conta e por fim a gaveta da sidebar). Os modais das telas de formulário registram o próprio Esc quando abrem (depois).

| Pasta                 | O que tem                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.tsx`, `boot.ts` | Entrada (estilos, árvore React, `init…()` em ordem, login do desktop) e `bootApp` (GameStore, estilo salvo, partida guardada).                                                                                                                                                                                                                                                                                                                                                                                                        |
| `app/`                | `app.tsx` (a árvore: tela de entrada, sidebar, topo, as telas `section.view`, tutor e modal de histórico) e `error-boundary.tsx` (aviso genérico com "Recarregar").                                                                                                                                                                                                                                                                                                                                                                   |
| `types/`              | Tipos do chess.js 0.10.3 (`chess.d.ts`), da ponte `window.lanceDesktop` e das respostas da API (`api.ts`), de `window.claude` (`globals.d.ts`).                                                                                                                                                                                                                                                                                                                                                                                       |
| `core/`               | Regras e estado do jogo: `state.ts` (estado `S` tipado), `game.ts` (resetBoard, startGame, applyMove, checkOver, undo, loadPgn), `classify.ts` e `eval.ts` (classificação e avaliação, puros), `result.ts` (`resultOf`), `rating.ts` (regras do rating local), `constants.ts` (bots, classificações, profundidades).                                                                                                                                                                                                                  |
| `engine/`             | `engine.ts` (Stockfish em Web Worker, fila de pedidos), `analysis.ts` (fila de análise da partida e reclassificação), `bot.ts` (lance do bot e do treino).                                                                                                                                                                                                                                                                                                                                                                            |
| `book/`               | Dados do livro, `hash.ts` (cyrb53), `index.ts` (índice, `openingName`, `findLines`, linhas), `tree.ts` (árvore de prefixos do estudo, `bookNext`/`linesNext`).                                                                                                                                                                                                                                                                                                                                                                        |
| `board/`              | Componente `Board` (`board.tsx`), geometria, setas e fim de jogo (`render.ts`), peça e selo (`badge.tsx`), peças e estilos (`pieces.ts`), animações de lance (`animations.ts`) e de captura (`capture-fx.ts`), arrastar/clicar e promoção (`input.ts`), sons (`sound.ts`), estilo do tabuleiro (`style-picker.ts` e `style-picker-view.tsx`).                                                                                                                                                                                         |
| `game/`               | Tela do Tabuleiro: estado da interface e elementos estáveis (`ui-state.ts`: `UI`, `REFS`), topo (`top-bar.tsx`), conteúdo da tela (`game-view.tsx`), painéis (`panels.tsx`: jogadores, avaliação, treinador, lances, relatório, navegação, legenda), modal de histórico (`history-modal.tsx`), ações e atalhos (`controls.ts`, `menus.ts`), reprodução e `goTo` (`replay.ts`), desistência (`resign.ts`), rating exibido (`rating.ts`), histórico e abrir partida salva (`history.ts`), exemplos e `window.LanceALance` (`mocks.ts`). |
| `store/`              | `view-store.ts` (stores por versão da tela do jogo e do shell, `publish`), `game-store.ts` (GameStore local/API, fila com reenvio), `convert.ts` (`fromApi`/`apiBody`, UUID, puro), `session.ts` (partida aberta no localStorage, `saveGame`, resposta da API), `contexts.ts` (partidas separadas do Tabuleiro e do Aberturas), `local.ts` (chaves e leitura do localStorage), `types.ts` (registro de partida), `data-events.ts` (tópicos "dados mudaram" das telas de formulário e lista).                                          |
| `desktop/`            | Só no app desktop: `bridge.ts` (ponte), `account.ts` (login, cadastro, conta) e `auth-view.tsx`, `views.ts` (roteador por hash e contrato das telas), `sidebar.ts` e `sidebar-view.tsx`. Cada tela de formulário ou lista tem os dados e as regras num `.ts` e o desenho num `-view.tsx`: `home`, `history-page`, `stats`, `admin`, `profile`.                                                                                                                                                                                        |
| `react/`              | O que os componentes dividem: hooks (`useGameView`, `useShellView`, `useViewRefresh`…), `Modal`, `FormMsg`, item da lista de partidas.                                                                                                                                                                                                                                                                                                                                                                                                |
| `study/`              | Estudo de aberturas sem IA: estado, avaliação pelo Stockfish, escolha (`pick.ts`), prática guiada (`practice.ts`), explorador (`explorer.ts`), abrir/fechar (`panel.ts`) e o painel (`study-panel.tsx`).                                                                                                                                                                                                                                                                                                                              |
| `tutor/`              | Tutor de IA (`tutor.ts`: ferramentas, chat pela API do desktop ou pelo Claude do artifact; `tutor-panel.tsx`: o painel) e treino/demonstração no tabuleiro (`training.ts`).                                                                                                                                                                                                                                                                                                                                                           |
| `ui/`                 | Utilitários (alvo de evento, escape de HTML dos efeitos), formulários, toast, formatação, ícones (`icons.tsx`), tema e preferências.                                                                                                                                                                                                                                                                                                                                                                                                  |
| `styles/`             | O CSS da página original dividido por seção, **sem mudança de conteúdo**; `index.css` importa na ordem original (a ordem importa para a cascata). Os tokens de tema ficam em `tokens.css`. Fora do Prettier, de propósito.                                                                                                                                                                                                                                                                                                            |

`index.html` tem só o esqueleto do `pnpm dev`, o script inline que aplica o tema salvo antes de desenhar e o
`<div id="app">` onde a árvore React monta.

## Convenções

- O HTML gerado pelos componentes é o mesmo da página sem React (mesmas classes, ids, textos e atributos `aria-*`); o CSS
  não muda. Campos de formulário não são controlados pelo React (refs), para o valor não virar atributo `value` no HTML.
- Nomes, textos e chaves do localStorage ficam como estão (`lance-a-lance:…:v1`): o app desktop e o artifact já têm
  dados gravados com eles. O contrato com a API e com o IPC do desktop está em `types/api.ts`.
- Lógica pura (livro, classificação, resultado, rating, conversão da API, escape) não toca no DOM e tem testes em `test/`.
- O que vem do localStorage passa por uma checagem de forma simples (`isGameRecord`, `lsGet(chave, padrão, checagem)` em
  `store/local.ts`): item fora do formato vira o padrão em vez de quebrar a página.

## React e o estado do jogo

- **Um store por versão** (`store/view-store.ts`): o estado continua em objetos TypeScript fora do React (`S` da partida,
  `UI` da tela do jogo, `STUDY`, `TUTOR`, `HIST`, `RATING_UI`, a rota em `ROUTE`, a conta em `ACCOUNT`/`AUTH`, a
  sidebar em `SIDEBAR`). Quem muda chama `publish()` (tela do jogo) ou `publishShell()` (rota, sidebar, conta, login); os
  componentes assinam com `useGameView()`/`useShellView()` (`useSyncExternalStore`, snapshot = número de versão) e leem
  os objetos ao desenhar. `publish('board')` não rola a lista de lances até o lance atual (era o `renderBoard` de antes).
- `publish()` redesenha na hora (`flushSync`): quem chama conta com o DOM novo logo depois, como no `renderAll` de antes.
  As animações e o foco dependem disso. Estado derivado (prática do estudo, classe `blind` do body, replay e desistência
  que deixam de valer) é acertado antes de cada redesenho (`onBeforeGameRender`).
- **Animações**: continuam imperativas (Web Animations API) em `board/animations.ts` e `board/capture-fx.ts`, sobre os
  elementos de `REFS` (tabuleiro e casas). Cada casa tem a chave da própria casa e cada peça a chave de cor e tipo, então
  um redesenho no meio de uma animação mantém os mesmos nós; os elementos de efeito (anéis, faixa de mate, cacos) não são
  do React e se removem sozinhos. A análise que chega no meio de uma animação de lance ainda espera `S.animUntil`.
- **Roteador** (`desktop/views.ts`): rota por hash sem biblioteca, mesmo contrato de antes (`#/inicio`, `#/jogo`,
  `#/aberturas`, `#/estatisticas`, `#/historico`, `#/admin`, papéis, aviso ao negar, `DEFAULT_VIEW`; no artifact não há
  roteamento e aparece o jogo). O App mostra só a `section.view` da rota.
- Telas de formulário e lista (Início, Histórico, Estatísticas, Administração, perfil) só existem depois do login; os
  modais delas entram no fim de `#appRoot` por `createPortal` (`react/modal.tsx`: foco ao abrir, Esc e clique no fundo,
  volta do foco). Para recarregar, `views.ts` publica o tópico `tela:<view>` (`store/data-events.ts`) no `onShow` da tela
  e quando uma gravação muda o que ela mostra; o componente assina com `useViewRefresh`.
- A tela de entrada e a área do app ficam cada uma numa barreira de erro (`app/error-boundary.tsx`): um erro de desenho
  vira um aviso genérico com "Recarregar", sem detalhes técnicos.
- Testes de componente ficam em `test/react/` (`// @vitest-environment jsdom` no topo, Testing Library); a ponte do
  desktop é trocada por `vi.mock('../../src/desktop/bridge')` e o estado da partida é montado direto em `S`
  (`resetBoard`, `applyMove`).
