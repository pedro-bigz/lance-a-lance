// Build da interface: um único HTML com JS e CSS embutidos (vite-plugin-singlefile). pieces/ fica em public/ e sai ao
// lado do HTML em dist/; os arquivos do Stockfish saem de engines/<versão>/ só da versão escolhida (VITE_STOCKFISH,
// padrão em src/engine/adapters/registry.ts; build/stockfish-engine.ts), mais dist/engine.json. Depois do vite build,
// scripts/finalize.mjs transforma dist/index.html em dist/lance-a-lance.html (o fragmento que o artifact e o
// app desktop envolvem no próprio esqueleto). As telas de formulário e lista do app desktop são ilhas React (TSX);
// o React entra no mesmo bundle.
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { stockfishEngine } from './build/stockfish-engine';

const engines = fileURLToPath(new URL('./engines', import.meta.url));

export default defineConfig(({ mode }) => ({
  // caminhos relativos: a página roda em app://lance/ (desktop), no artifact e em qualquer pasta servida
  base: './',
  // VITE_STOCKFISH vem do ambiente ou de um .env do Vite; id desconhecido para o build com a lista das versões
  plugins: [
    react(),
    viteSingleFile({ removeViteModuleLoader: true }),
    stockfishEngine(engines, process.env.VITE_STOCKFISH ?? loadEnv(mode, process.cwd(), 'VITE_').VITE_STOCKFISH),
  ],
  build: {
    target: 'es2022',
    // o CSS vai como foi escrito (sem minificar nem reescrever propriedades): é o mesmo da página original
    cssMinify: false,
    // o livro de aberturas (~420 KB) vai no bundle de propósito
    chunkSizeWarningLimit: 2000,
  },
  // shared/ (fórmula da pontuação e hash do livro, também usados pela API) fica fora de ui/: o servidor de
  // desenvolvimento libera só ui/ e essa pasta (nunca a raiz do repositório, onde fica api/.env)
  server: { port: 5173, fs: { allow: [fileURLToPath(new URL('.', import.meta.url)), fileURLToPath(new URL('../shared', import.meta.url))] } },
}));
