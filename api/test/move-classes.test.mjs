// Classificação de lance → coluna de player_stats (migração 005): toda coluna em inglês e snake_case, sem repetir,
// e as mesmas colunas que a migração cria.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CLS_COLUMNS, CLASSIFICATIONS, CLS_ALIAS } from '../src/move-classes.mjs';

test('uma coluna por classificação do app, na ordem do app', () => {
  assert.deepEqual(CLASSIFICATIONS, ['livro', 'brilhante', 'otima', 'melhor', 'excelente', 'boa', 'imprecisao', 'erro', 'chance_perdida', 'capivarada']);
  assert.equal(CLS_ALIAS.chance, 'chance_perdida');
});

test('colunas em inglês, snake_case e sem repetição', () => {
  const cols = Object.values(CLS_COLUMNS);
  assert.deepEqual(cols, ['book_moves', 'brilliant_moves', 'great_moves', 'best_moves', 'excellent_moves', 'good_moves', 'inaccuracies', 'mistakes', 'missed_wins', 'blunders']);
  assert.equal(new Set(cols).size, cols.length);
  for (const c of cols) assert.match(c, /^[a-z]+(_[a-z]+)*$/);
});

test('a migração 005 renomeia exatamente essas colunas', () => {
  const sql = readFileSync(new URL('../db/migrations/005_player_stats_english_columns.sql', import.meta.url), 'utf8')
    .split('\n').filter(l => !l.trimStart().startsWith('--')).join('\n');
  const renames = Object.fromEntries([...sql.matchAll(/RENAME COLUMN (\w+)\s+TO (\w+)/g)].map(m => [m[1], m[2]]));
  assert.deepEqual(renames, { ...CLS_COLUMNS });
});
