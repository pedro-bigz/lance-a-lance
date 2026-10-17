// @vitest-environment jsdom
import './setup';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { histItemHtml } from '../../src/game/history';
import { HistItem } from '../../src/desktop/react/hist-item';
import { game } from './fixtures';

/** HTML sem os espaços entre as tags (o template de string tem quebras de linha; o React não) */
const norm = (h: string) => h.replace(/>\s+</g, '><').trim();
const fromHtml = (h: string) => {
  const ul = document.createElement('ul');
  ul.innerHTML = h;
  return norm(ul.innerHTML);
};

describe('HistItem', () => {
  const cases = {
    'concluída com variação do rating': game('a'),
    'em andamento valendo rating': game('b', { status: 'andamento', result: null, resultText: '', ratingDelta: null }),
    'derrota sem rating': game('c', { result: 'derrota', rated: false, ratingDelta: -10 }),
    'PGN importado de exemplo': game('d', {
      mode: 'review',
      mock: true,
      result: 'importada',
      ratingDelta: null,
      rated: false,
      headers: { White: 'Kasparov', Black: 'Topalov' },
    }),
    'abertura e pretas': game('e', {
      player: 'b',
      opening: 'Defesa Siciliana',
      gameMode: 'assistido',
      ratingDelta: null,
      rated: false,
      resultText: '',
    }),
  };
  for (const [name, rec] of Object.entries(cases))
    it(`gera o mesmo HTML do modal: ${name}`, () => {
      const { container } = render(
        <ul>
          <HistItem rec={rec} onOpen={() => {}} onDelete={() => {}} />
        </ul>,
      );
      expect(norm(container.querySelector('ul')!.innerHTML)).toBe(fromHtml(histItemHtml(rec)));
      const { container: c2 } = render(
        <ul>
          <HistItem rec={rec} onOpen={() => {}} />
        </ul>,
      );
      expect(norm(c2.querySelector('ul')!.innerHTML)).toBe(fromHtml(histItemHtml(rec, { del: false })));
    });
});
