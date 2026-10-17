// Testes unitários: lógica pura em ambiente node; os componentes React (test/**/*.test.tsx) declaram
// "// @vitest-environment jsdom" no topo e usam a Testing Library.
// Rode com o limite de workers na linha de comando: pnpm test --maxWorkers=2 (sem "--" no pnpm 10)
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
