import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'public/', 'engines/*/', 'src/book/data.generated.json'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      // catch(_) {} vazio é intencional (localStorage, AudioContext, Intl): falhar em silêncio é o comportamento
      'no-empty': ['error', { allowEmptyCatch: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  // ilhas React (src/**/*.tsx) e testes de componente: regras de hooks
  { files: ['**/*.tsx'], ...reactHooks.configs.flat['recommended-latest'] },
  {
    files: ['scripts/**/*.mjs', '*.config.*', 'build/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
);
