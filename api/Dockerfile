# Imagem da API do Lance a Lance. Contexto de build: a RAIZ do repositório, porque a API usa a fórmula da
# pontuação (shared/) e o livro de aberturas da interface (ui/src/book/data.generated.json).
#   docker compose --profile api up -d --build   (a partir de api/; ver README, seção Docker)
# Segredos não entram na imagem: chegam como variáveis de ambiente do compose. A CA do TLS do banco é montada.

# ---------- dependências de produção ----------
FROM node:22-alpine AS deps
WORKDIR /app/api
RUN corepack enable
COPY api/package.json api/pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile \
 # do pacote stockfish (~200 MB) a API só usa o lite single-threaded (~1,9 MB): o resto fica fora da imagem
 && find node_modules/.pnpm/stockfish@*/node_modules/stockfish -mindepth 1 -maxdepth 1 ! -name bin ! -name package.json -exec rm -rf {} + \
 && find node_modules/.pnpm/stockfish@*/node_modules/stockfish/bin -type f ! -name 'stockfish-19-lite-single.*' -delete

# ---------- imagem final ----------
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app/api
COPY --from=deps --chown=node:node /app/api/node_modules ./node_modules
COPY --chown=node:node api/package.json api/server.mjs ./
COPY --chown=node:node api/src ./src
COPY --chown=node:node shared /app/shared
COPY --chown=node:node ui/src/book/data.generated.json /app/ui/src/book/data.generated.json
USER node
EXPOSE 8787
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server.mjs"]
