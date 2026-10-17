# Lance a Lance

App de xadrez para jogar contra bots e estudar aberturas. O Stockfish avalia cada lance (livro,
brilhante, ótima, melhor, excelente, boa, imprecisão, erro, chance perdida, capivarada).

## Estrutura

| Pasta / arquivo | O que é |
|---|---|
| `lance-a-lance.html` | Interface inteira (HTML, CSS e JS numa página). É a fonte única: vira o app desktop e o artifact web. |
| `stockfish.asm.js` | Motor Stockfish 10 (asm.js), roda num Web Worker. |
| `pieces/` | Conjuntos de peças ilustrados (`<conjunto>/{w,b}{k,q,r,b,n,p}.webp`). |
| `desktop/` | App Electron para macOS, Windows e Linux: login, partidas, estatísticas, administração. Veja `desktop/README.md`. |
| `api/` | API Node 22 (MySQL + JWT): contas, papéis, partidas, estatísticas e tutor de IA com fallback entre provedores. Veja `api/README.md`. |
| `tools/` | Geração do livro de aberturas (`gerar-livro.mjs`) e recorte das peças (`extrair-pecas.py`). |
| `.github/workflows/desktop.yml` | Gera os instaladores ao criar uma tag `vX.Y.Z`. |

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

# app desktop (em outro terminal)
cd desktop
cp .env.example .env            # endereço da API
corepack pnpm@10.13.1 install
corepack pnpm@10.13.1 start
```

Segredos (`.env`) e certificados (`api/db/tls/`) nunca vão para o repositório.

## Licença

GPL-3.0 (o Stockfish é GPL).
