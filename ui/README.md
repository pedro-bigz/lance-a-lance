# Lance a Lance: interface

A interface do app (tabuleiro, análise pelo Stockfish, estudo de aberturas, tutor e as telas do app desktop) em
Vite + TypeScript + React 19. A página inteira é uma árvore React (`app/app.tsx`); as regras, o motor, o livro e o estado da
partida continuam em módulos TypeScript sem React, expostos por um store observável (veja "React e o estado do jogo"
abaixo). O build gera
**um único HTML** que é usado em dois lugares:

- **App desktop** (`../desktop`): `desktop/scripts/prepare.mjs` roda o build e monta `desktop/app/` a partir de
  `dist/lance-a-lance.html`, trocando as fontes do Google pelas cópias locais.
- **Artifact do claude.ai**: publica-se `dist/lance-a-lance.html` com os arquivos do motor listados em `dist/engine.json`
  (no padrão: `stockfish-19-lite-single.js`, `stockfish-19-lite-single.wasm`, `stockfish-19-asm.js`,
  `STOCKFISH-LICENSE.txt`) e `dist/pieces/` como arquivos de apoio (mesmos caminhos relativos, ao lado da página). Sem `window.lanceDesktop` a página roda sem login, com o localStorage e
  com o tutor pelo Claude da conta (`window.claude.use('sample')`).

## Comandos

Use o pnpm do projeto pelo corepack (o pnpm global 11.x quebra o `node_modules` dos projetos 10.x):

```bash
corepack pnpm@10.13.1 install
corepack pnpm@10.13.1 dev                  # servidor do Vite (modo artifact, sem login) em http://localhost:5173
corepack pnpm@10.13.1 build                # dist/lance-a-lance.html + motor (engine.json) + dist/pieces/
VITE_STOCKFISH=sf10 corepack pnpm@10.13.1 build  # o mesmo build com outra versão registrada do Stockfish
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
- `public/pieces/` é copiado como está para `dist/`. Os arquivos do Stockfish saem de `engines/<versão>/`, só os da versão
  escolhida (`build/stockfish-engine.ts`, um plugin do Vite), junto com `dist/engine.json` (`{id, label, version, files}`),
  que o `desktop/scripts/prepare.mjs` usa para copiar os mesmos arquivos. No `pnpm dev` o plugin serve esses arquivos na
  raiz (o `.wasm` como `application/wasm`).
- O livro de aberturas (~420 KB) é `src/book/data.generated.json`, gerado por `../tools/gerar-livro.mjs` (que usa o
  chess.js de `node_modules`; instale as dependências antes). Não edite o JSON à mão.

## Motor (Stockfish)

O app fala só com o contrato `StockfishAdapter` (`src/engine/adapters/base.ts`); análise, classificação, bot, estudo,
tutor e demonstrações não sabem qual versão está rodando. A classe base tem o que é comum (worker, troca de candidato,
timeout de 30 s, fila de pedidos, leitura das linhas UCI, `analyse()`); cada versão é uma subclasse que declara os
próprios dados e sobrescreve só os ganchos que mudam (Template Method):

| Membro                                                          | O que é                                                                                          |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `id`, `label`, `version`                                        | id do registro e da pasta `engines/<id>/`, nome para gente, versão do pacote npm `stockfish`     |
| `candidates`                                                    | ordem de carga: `{kind: 'wasm' \| 'asm', script, wasm?}` (nomes dos arquivos em `engines/<id>/`) |
| `cdn`                                                           | pastas de CDN com os mesmos arquivos (reserva final, por Blob com `importScripts`)               |
| `capabilities`                                                  | MultiPV máximo, Skill Level, faixa do `UCI_LimitStrength`/`UCI_Elo`, WDL                         |
| `botLevels`                                                     | cada nível do bot (`BOTS` em `core/constants.ts`) em skill/depth/movetime/aleatoriedade ou Elo   |
| `calibration.wpK`                                               | inclinação da curva centipeões → chance de vitória da classificação (`core/eval.ts`)             |
| `initCommands()`                                                | comandos depois do `uciok` (o SF10 manda `Contempt 0`; o SF19 não tem mais essa opção)           |
| `strengthCommands()`                                            | Skill Level e, se houver, `UCI_LimitStrength`/`UCI_Elo` antes de cada busca                      |
| `parseInfo()`, `parseExtra()`, `isPvToken()`, `parseBestmove()` | leitura de `info … score … pv …` (com `wdl` quando vier) e de `bestmove`                         |
| `probeWasm()`                                                   | confere o `.wasm` (HEAD, `application/wasm`) antes de subir um candidato wasm                    |

Versões registradas (`src/engine/adapters/registry.ts`):

- **`sf19-lite`** (padrão): Stockfish 19 lite do stockfish.js 19.0.1, rede NNUE pequena, WebAssembly de uma thread
  (não exige cross-origin isolation). Candidatos: `stockfish-19-lite-single.js` + `.wasm` (28 KB + 1,8 MB),
  `stockfish-19-asm.js` (3 MB, reserva sem WebAssembly, bem mais lenta), depois os mesmos no unpkg. O jsDelivr recusa o
  pacote 19.0.1 (403, passa de 150 MB por causa dos builds completos de ~94 MB). Os builds completos e os multithread não
  são usados (tamanho e cross-origin isolation). O `.js` do lite acha o `.wasm` pelo endereço no hash da URL do worker,
  que a base sempre manda (vale também para o worker de Blob da CDN).
- **`sf10`**: Stockfish 10 (stockfish.js 10.0.2, asm.js), o motor até a versão 3.5, mantido para comparar e para provar
  a troca nos dois sentidos.

A versão vem de `src/engine/config.ts`: `VITE_STOCKFISH` (do ambiente ou de um `.env` do Vite) ou o `DEFAULT_ENGINE` do
registro. Id desconhecido para o build com a lista das versões. A dica do estado ("Stockfish pronto") mostra o motor e o
candidato que subiu (ex.: "Stockfish 19 Lite WASM · wasm (local)").

Na troca do 10 pelo 19 (outubro de 2026), medido com as partidas de exemplo na profundidade normal do app (15, 1,5 s,
MultiPV 2): as classificações continuam espalhadas pela régua (sem virar tudo "Melhor" ou "Erro"), então os limiares e a
curva (`wpK`) ficaram iguais nas duas versões. Os níveis Novato, Iniciante e Intermediário ficaram como estavam (a perda
média por lance não mudou); Avançado e Mestre, que ficaram bem mais fortes com Skill Level, passaram a usar `UCI_Elo`
1600 e 2200.

## Como instalar uma nova versão do Stockfish

1. **Baixe o pacote** (ex.: `npm pack stockfish@<versão>`), confira o checksum com `npm view stockfish@<versão>
dist.shasum` e leia o README dele: quais builds existem, como o `.js` acha o `.wasm`, se precisa de cross-origin
   isolation (multithread precisa; prefira os single-thread) e a licença.
2. **Coloque os arquivos** em `ui/engines/<id>/` com os nomes do pacote (ex.: `ui/engines/sf20-lite/`), mais o
   `STOCKFISH-LICENSE.txt` (o `Copying.txt` do pacote). Prefira um build wasm pequeno e um asm.js de reserva.
3. **Rode o motor no Node** (`node ui/engines/<id>/<arquivo>.js` aceita UCI pela entrada padrão) e colha: a saída de
   `uci` (opções e faixas: `MultiPV`, `Skill Level`, `UCI_Elo`, `Hash`), linhas `info … pv …` reais (com `multipv`, `mate`,
   `wdl`, `lowerbound`) e `bestmove`. Confira se os CDNs servem os arquivos (`curl -I`: 200, CORS, `application/wasm`).
4. **Crie a subclasse** em `src/engine/adapters/<id>.ts` estendendo `StockfishAdapter` (copie `sf19-lite.ts`): `id`,
   `label`, `version`, `candidates`, `cdn`, `capabilities`, `botLevels`. Sobrescreva só o que mudar: `initCommands()` se a
   versão tiver ou perder opções, `parseExtra()`/`isPvToken()`/`parseBestmove()` se o formato da saída mudar,
   `strengthCommands()` se a força for pedida de outro jeito, `calibration` se a escala das notas mudar.
5. **Registre** em `src/engine/adapters/registry.ts` (`ENGINE_ADAPTERS`) e, para virar o padrão, troque `DEFAULT_ENGINE`.
   Para testar antes de trocar: `VITE_STOCKFISH=<id> corepack pnpm@10.13.1 build`.
6. **Testes**: em `test/engine.test.ts`, um bloco para a versão nova com as linhas reais do passo 3 (parser, comandos
   UCI gerados, candidatos, níveis do bot); os testes do registro e do build já passam por todas as versões
   registradas. Rode `typecheck`, `lint`, `test --maxWorkers=2` e `build`.
7. **Calibre a classificação**: classifique as mesmas partidas (o Morphy de `SAMPLE_PGN` e as de `game/mocks.ts`) com a
   versão antiga e a nova na profundidade/tempo de `DEPTH` e compare as contagens por classe e a perda de cada lance.
   Só mexa em `calibration.wpK` (ou nos limiares de `core/classify.ts`, que valem para todas as versões) se as classes
   ficarem concentradas num extremo.
8. **Calibre o bot**: para cada nível, meça a perda média por lance (chance de vitória, régua do app) e a taxa de
   capivaradas numa centena de posições, com um motor forte de referência, na versão antiga e na nova. Ajuste os
   `botLevels` da versão nova até a perda ficar perto da antiga (com `UCI_Elo` quando a versão tiver, ou skill, depth,
   movetime e aleatoriedade).
9. **Confira no navegador e no desktop**: `pnpm build`, sirva `dist/` (com `.wasm` como `application/wasm`) e veja a dica
   do estado do Stockfish, a análise de uma partida inteira, o bot, a dica e o explorador do estudo; simule a falta do
   `.wasm` para ver a reserva assumir. No desktop, `node scripts/prepare.mjs` e o mesmo roteiro. Atualize este README, o
   `README.md` da raiz (arquivos a publicar no artifact) e o `desktop/README.md`.

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
| `engine/`             | `adapters/` (contrato `StockfishAdapter` e uma subclasse por versão; veja "Motor (Stockfish)"), `config.ts` (versão em uso), `engine.ts` (os dois motores do app), `analysis.ts` (fila de análise da partida e reclassificação), `bot.ts` (lance do bot e do treino).                                                                                                                                                                                                                                                                 |
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
