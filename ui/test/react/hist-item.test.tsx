// @vitest-environment jsdom
import './setup';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GLYPH } from '../../src/board/pieces';
import { histItemView } from '../../src/game/history';
import { HistItem } from '../../src/react/hist-item';
import type { GameRecord } from '../../src/store/types';
import { esc } from '../../src/ui/escape';
import { game } from './fixtures';

/** o HTML do item do modal de histórico antes da etapa 3 (template de string), guardado como referência */
function histItemHtml(r: GameRecord, { del = true }: { del?: boolean } = {}): string {
  const v = histItemView(r);
  const rtxt = v.detail
    ? v.detail.rating
      ? ` · <span class="${v.detail.rating.cls}">${v.detail.rating.text}</span>`
      : v.detail.rated
        ? ' · vale rating'
        : ''
    : '';
  const detail = v.detail ? `<small>${esc(v.detail.text)}${rtxt}</small>` : '';
  return `<li class="${v.cls}">
    <button class="hist-open" data-open="${esc(v.id)}">
      <span class="hist-ico ${v.ico}" aria-hidden="true">${GLYPH.k}</span>
      <span class="hist-main"><b>${esc(v.title)}${v.mock ? '<span class="mock-tag">exemplo</span>' : ''}</b><small>${esc(v.meta)}</small>${detail}</span>
      <span class="hist-side"><span class="chip">${v.label}</span><span class="hist-act">${v.act}</span></span>
    </button>
    ${del ? `<button class="hist-del" data-del="${esc(v.id)}" aria-label="Excluir ${esc(v.title)}">Excluir</button>` : ''}
  </li>`;
}

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
  it('Excluir em dois cliques: armado, gravando e "Tente de novo"', () => {
    const rec = game('a');
    const html = (del: 'armed' | 'busy' | 'retry') => {
      const { container } = render(
        <ul>
          <HistItem rec={rec} onOpen={() => {}} onDelete={() => {}} del={del} />
        </ul>,
      );
      return container.querySelector('.hist-del') as HTMLButtonElement;
    };
    expect(html('armed').className).toBe('hist-del armed');
    expect(html('armed').textContent).toBe('Confirmar');
    expect(html('busy').disabled).toBe(true);
    expect(html('retry').textContent).toBe('Tente de novo');
    expect(html('retry').disabled).toBe(false);
  });
});
