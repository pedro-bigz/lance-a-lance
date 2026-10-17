# Lance a Lance

App de xadrez para jogar contra bots e estudar aberturas. O Stockfish avalia cada lance (livro,
brilhante, ótima, melhor, excelente, boa, imprecisão, erro, chance perdida, capivarada).

## Estrutura

| Pasta / arquivo | O que é |
|---|---|
| `ui/` | Interface (Vite + TypeScript, em módulos). É a fonte única: o build gera `ui/dist/lance-a-lance.html`, que vira o app desktop e o artifact web. Veja `ui/README.md`. |
| `ui/public/stockfish.asm.js` | Motor Stockfish 10 (asm.js), roda num Web Worker; o build o copia para o lado da página. |
| `ui/public/pieces/` | Conjuntos de peças ilustrados (`<conjunto>/{w,b}{k,q,r,b,n,p}.webp`). |
| `desktop/` | App Electron para macOS, Windows e Linux: login, partidas, estatísticas, administração. Veja `desktop/README.md`. |
| `api/` | API Node 22 (MySQL + JWT): contas, papéis, partidas, estatísticas e tutor de IA com fallback entre provedores. Veja `api/README.md`. |
| `tools/` | Geração do livro de aberturas (`gerar-livro.mjs`, escreve `ui/src/book/data.generated.json`) e recorte das peças (`extrair-pecas.py`, grava em `ui/public/pieces/`). |
| `.github/workflows/desktop.yml` | Confere e builda a interface e gera os instaladores ao criar uma tag `vX.Y.Z`. |

## Começar

```bash
# banco e API
cd api
cp .env.example .env            # preencha senhas e chaves
corepack pnpm@10.13.1 install
corepack pnpm@10.13.1 db:tls    # certificados do MySQL
corepack pnpm@10.13.1 db:up
corepack pnpm@10.13.1 db:users
corepack pnpm@10.13.1 db:migrate
corepack pnpm@10.13.1 start

# interface (em outro terminal, a partir da raiz; serve ao desktop e ao artifact)
cd ui
corepack pnpm@10.13.1 install
corepack pnpm@10.13.1 build     # gera ui/dist/lance-a-lance.html (+ stockfish.asm.js e pieces/)
corepack pnpm@10.13.1 dev       # desenvolver no navegador (modo artifact, sem login)

# app desktop (a partir da raiz; o prepare roda o build da ui sozinho)
cd desktop
cp .env.example .env            # endereço da API
corepack pnpm@10.13.1 install
corepack pnpm@10.13.1 start
```

Segredos (`.env`) e certificados (`api/db/tls/`) nunca vão para o repositório.

## Publicar como artifact

O arquivo publicado é `ui/dist/lance-a-lance.html` (gerado por `corepack pnpm@10.13.1 build` em `ui/`; não fica no git).
Ele é um fragmento de página (sem `<!doctype>`/`<html>`/`<body>`: o publicador põe o esqueleto) com o JS e o CSS
embutidos. Publique junto, como arquivos de apoio com os mesmos caminhos, `ui/dist/stockfish.asm.js` e `ui/dist/pieces/`.

## Licença

GPL-3.0 (o Stockfish é GPL).
