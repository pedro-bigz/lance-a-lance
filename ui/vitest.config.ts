// Testes unitários da lógica pura (sem DOM): livro, classificação, resultado, rating, conversão da API, escape.
// Rode com o limite de workers na linha de comando: pnpm test -- --maxWorkers=2
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
