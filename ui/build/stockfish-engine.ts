/* Plugin do Vite: põe ao lado da página só os arquivos da versão do Stockfish escolhida (VITE_STOCKFISH, padrão em
   src/engine/adapters/registry.ts). No build copia engines/<id>/<arquivo> para dist/ e grava dist/engine.json
   ({id, label, version, files}), que desktop/scripts/prepare.mjs usa para copiar os mesmos arquivos para o app.
   No "pnpm dev" serve os mesmos arquivos na raiz, com o MIME certo (.wasm = application/wasm). */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { Plugin } from 'vite';
import type { EngineManifest } from '../src/engine/adapters/base';
import { createAdapter, resolveEngineId } from '../src/engine/adapters/registry';

export const ENGINE_MIME: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

/** manifesto da versão, conferindo que todos os arquivos existem em engines/<id>/ */
export function engineManifest(enginesDir: string, idOrEnv: string | undefined): EngineManifest {
  const id = resolveEngineId(idOrEnv);
  const m = createAdapter(id).manifest();
  const missing = m.files.filter((f) => !existsSync(join(enginesDir, id, f)));
  if (missing.length) throw new Error(`Faltam arquivos do Stockfish "${id}" em engines/${id}/: ${missing.join(', ')}`);
  return m;
}
/** copia os arquivos da versão para outDir e grava engine.json; devolve o manifesto */
export function copyEngine(enginesDir: string, outDir: string, m: EngineManifest): EngineManifest {
  for (const f of m.files) copyFileSync(join(enginesDir, m.id, f), join(outDir, f));
  writeFileSync(join(outDir, 'engine.json'), JSON.stringify(m, null, 2) + '\n');
  return m;
}

export function stockfishEngine(enginesDir: string, idOrEnv: string | undefined): Plugin {
  const m = engineManifest(enginesDir, idOrEnv);
  let outDir = 'dist';
  return {
    name: 'lance-a-lance:stockfish',
    config: () => ({ define: { 'import.meta.env.VITE_STOCKFISH': JSON.stringify(m.id) } }),
    configResolved(c) {
      outDir = join(c.root, c.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = decodeURIComponent((req.url || '').split(/[?#]/)[0]!.replace(/^\/+/, ''));
        if (name !== 'engine.json' && !m.files.includes(name)) return next();
        const body = name === 'engine.json' ? JSON.stringify(m) : readFileSync(join(enginesDir, m.id, name));
        res.setHeader('Content-Type', name === 'engine.json' ? 'application/json' : ENGINE_MIME[extname(name)] || 'application/octet-stream');
        res.end(body);
      });
    },
    writeBundle() {
      copyEngine(enginesDir, outDir, m);
      this.info(`${m.label} (${m.id}): ${m.files.join(', ')}`);
    },
  };
}
