// Build da interface: um único HTML com JS e CSS embutidos (vite-plugin-singlefile). stockfish.asm.js e pieces/
// ficam em public/ e saem ao lado do HTML em dist/ (mesmos caminhos relativos da página). Depois do vite build,
// scripts/finalize.mjs transforma dist/index.html em dist/lance-a-lance.html (o fragmento que o artifact e o
// app desktop envolvem no próprio esqueleto). As telas de formulário e lista do app desktop são ilhas React (TSX);
// o React entra no mesmo bundle.
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  // caminhos relativos: a página roda em app://lance/ (desktop), no artifact e em qualquer pasta servida
  base: './',
  plugins: [react(), viteSingleFile({ removeViteModuleLoader: true })],
  build: {
    target: 'es2022',
    // o CSS vai como foi escrito (sem minificar nem reescrever propriedades): é o mesmo da página original
    cssMinify: false,
    // o livro de aberturas (~420 KB) vai no bundle de propósito
    chunkSizeWarningLimit: 2000,
  },
  server: { port: 5173 },
});
