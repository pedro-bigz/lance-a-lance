# Lance a Lance: interface

A interface do app (tabuleiro, análise pelo Stockfish, estudo de aberturas, tutor e as telas do app desktop) em
Vite + TypeScript. O tabuleiro, o tutor e o estudo são TypeScript sem framework; as telas de formulário e lista do app desktop
(Início, Histórico, Estatísticas, Administração e o perfil) são ilhas React 19 (veja "Ilhas React" abaixo). O build gera
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

Os módulos só definem funções, tipos e estado. `main.ts` liga tudo chamando as funções `init…()` **na mesma ordem da
antiga página única**: vários atalhos de teclado registrados no `document` conferem `e.defaultPrevented` de quem
registrou antes (Esc fecha primeiro o menu, depois o estudo, depois a gaveta…).

| Pasta                | O que tem                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.ts`, `boot.ts` | Entrada (estilos, `init…()` em ordem, login do desktop) e `bootApp` (GameStore, estilo salvo, partida guardada).                                                                                                                                                                                                                                                                                                              |
| `types/`             | Tipos do chess.js 0.10.3 (`chess.d.ts`), da ponte `window.lanceDesktop` e das respostas da API (`api.ts`), de `window.claude` (`globals.d.ts`).                                                                                                                                                                                                                                                                               |
| `core/`              | Regras e estado do jogo: `state.ts` (estado `S` tipado), `game.ts` (resetBoard, startGame, applyMove, checkOver, undo, loadPgn), `classify.ts` e `eval.ts` (classificação e avaliação, puros), `result.ts` (`resultOf`), `rating.ts` (regras do rating local), `constants.ts` (bots, classificações, profundidades).                                                                                                          |
| `engine/`            | `engine.ts` (Stockfish em Web Worker, fila de pedidos), `analysis.ts` (fila de análise da partida e reclassificação), `bot.ts` (lance do bot e do treino).                                                                                                                                                                                                                                                                    |
| `book/`              | Dados do livro, `hash.ts` (cyrb53), `index.ts` (índice, `openingName`, `findLines`, linhas), `tree.ts` (árvore de prefixos do estudo, `bookNext`/`linesNext`).                                                                                                                                                                                                                                                                |
| `board/`             | Desenho do tabuleiro e setas (`render.ts`), peças e estilos (`pieces.ts`), animações de lance (`animations.ts`) e de captura (`capture-fx.ts`), arrastar/clicar e promoção (`input.ts`), sons (`sound.ts`), seletor de estilo (`style-picker.ts`).                                                                                                                                                                            |
| `game/`              | Tela do Tabuleiro: painéis e `renderAll` (`panel.ts`), controles e teclado (`controls.ts`), menus do topo (`menus.ts`), reprodução e `goTo` (`replay.ts`), desistência (`resign.ts`), rating exibido (`rating.ts`), histórico em modal e abrir partida salva (`history.ts`), exemplos e `window.LanceALance` (`mocks.ts`).                                                                                                    |
| `store/`             | `game-store.ts` (GameStore local/API, fila com reenvio), `convert.ts` (`fromApi`/`apiBody`, UUID, puro), `session.ts` (partida aberta no localStorage, `saveGame`, resposta da API), `contexts.ts` (partidas separadas do Tabuleiro e do Aberturas), `local.ts` (chaves e leitura do localStorage), `types.ts` (registro de partida), `data-events.ts` (tópicos "dados mudaram" e store mínimo para as ilhas React).          |
| `desktop/`           | Só no app desktop: `bridge.ts` (ponte), `account.ts` (login, cadastro, menu da conta), `views.ts` (rotas por hash e contrato das telas), `sidebar.ts`, `islands.tsx` (monta as ilhas React). Cada tela React tem os dados e as regras num `.ts` e o desenho num `-view.tsx`: `home`, `history-page`, `stats`, `admin`, `profile`. `react/` tem o que as ilhas dividem (hooks, `Modal`, `FormMsg`, item da lista de partidas). |
| `study/`             | Estudo de aberturas sem IA: estado, avaliação pelo Stockfish, escolha (`pick.ts`), prática guiada (`practice.ts`), explorador (`explorer.ts`), painel (`panel.ts`).                                                                                                                                                                                                                                                           |
| `tutor/`             | Tutor de IA (`tutor.ts`: ferramentas, chat pela API do desktop ou pelo Claude do artifact) e treino/demonstração no tabuleiro (`training.ts`).                                                                                                                                                                                                                                                                                |
| `ui/`                | Utilitários de DOM (`$`, `$opt`), escape de HTML, formulários, toast, formatação, ícones, tema e preferências.                                                                                                                                                                                                                                                                                                                |
| `styles/`            | O CSS da página original dividido por seção, **sem mudança de conteúdo**; `index.css` importa na ordem original (a ordem importa para a cascata). Os tokens de tema ficam em `tokens.css`. Fora do Prettier, de propósito.                                                                                                                                                                                                    |

`index.html` tem a marcação da página (a mesma da versão em página única) e o script inline que aplica o tema salvo
antes de desenhar.

## Convenções

- `$('#id')` devolve o elemento sem `null` (a marcação é fixa); quando o elemento pode faltar de propósito, use `$opt`.
- Nomes, textos e chaves do localStorage ficam como estão (`lance-a-lance:…:v1`): o app desktop e o artifact já têm
  dados gravados com eles. O contrato com a API e com o IPC do desktop está em `types/api.ts`.
- Lógica pura (livro, classificação, resultado, rating, conversão da API, escape) não toca no DOM e tem testes em `test/`.
- O que vem do localStorage passa por uma checagem de forma simples (`isGameRecord`, `lsGet(chave, padrão, checagem)` em
  `store/local.ts`): item fora do formato vira o padrão em vez de quebrar a página.

## Ilhas React (só no app desktop)

- Cada tela tem um `createRoot` dentro da própria `<section class="view" data-view="…">` de `index.html` (que fica vazia);
  o modal de perfil é uma ilha sem section. `desktop/islands.tsx` monta todas uma vez, logo depois do login e antes do
  roteamento. No artifact (sem login) nenhuma ilha sobe: o React vai no bundle, mas não roda.
- Os modais das ilhas entram em `#appRoot` por `createPortal`, com o mesmo HTML de antes (`<div class="modal" id hidden>`
  sempre no DOM). `react/modal.tsx` cuida do foco ao abrir, de Esc e clique no fundo para fechar e da volta do foco.
- O HTML gerado é o mesmo da versão sem React (mesmas classes, ids, textos e atributos `aria-*`); o CSS não mudou.
  Campos de formulário não são controlados pelo React (refs), para o valor não virar atributo `value` no HTML.
- Dados: as ilhas usam as mesmas funções de antes (ponte `window.lanceDesktop`, `GameStore`, `openGameById`,
  `newGameFlow`, `viewToast`). Para recarregar, `views.ts` publica o tópico `tela:<view>` (`store/data-events.ts`) no
  `onShow` da tela e quando uma gravação muda o que a tela aberta mostra (`viewDataChanged`, `refreshIfCurrent`); a ilha
  assina com `useViewRefresh`. Sem biblioteca de estado: o Histórico guarda a lista num store pequeno
  (`createHistPager`) lido com `useSyncExternalStore`.
- Testes de componente ficam em `test/react/` (`// @vitest-environment jsdom` no topo, Testing Library); a ponte do
  desktop é trocada por `vi.mock('../../src/desktop/bridge')`.
