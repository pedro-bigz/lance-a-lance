// @vitest-environment jsdom
// Tabuleiro: desenho da posição a partir de S, clique-clique, promoção e lista de lances.
import './setup';
import { act, fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { Board } from '../../src/board/board';
import { BOOK_CLS } from '../../src/core/classify';
import { BOTS } from '../../src/core/constants';
import { applyMove, resetBoard } from '../../src/core/game';
import { S } from '../../src/core/state';
import { MovesCard } from '../../src/game/panels';
import { REFS, UI } from '../../src/game/ui-state';
import { publish } from '../../src/store/view-store';

// tabuleiro livre (sem bot) numa posição; o quadro tem 800 px, então cada casa tem 100 px
function setup(fen?: string) {
  S.mode = 'play';
  S.bot = BOTS.find((b) => b.id === 'none')!;
  S.player = 'w';
  S.orient = 'w';
  S.headers = {};
  S.trainer = null;
  resetBoard(fen);
  UI.promo = null;
  const r = render(<Board />);
  REFS.squares!.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 800, height: 800, right: 800, bottom: 800, x: 0, y: 0, toJSON() {} }) as DOMRect;
  return r;
}
const center = (sq: string) => ({ clientX: 'abcdefgh'.indexOf(sq[0]!) * 100 + 50, clientY: (8 - +sq[1]!) * 100 + 50 });
const press = (sq: string) => fireEvent.pointerDown(document.getElementById('board')!, { button: 0, pointerId: 1, ...center(sq) });
const square = (sq: string) => document.querySelector(`#squares [data-sq="${sq}"]`) as HTMLElement;

beforeEach(() => {
  S.cls = [];
  S.studyMark = null;
  S.hintAt = -1;
});

describe('Board', () => {
  it('desenha a posição inicial: 64 casas, peças, coordenadas e cores', () => {
    setup();
    expect(document.querySelectorAll('#squares .sq').length).toBe(64);
    expect(square('e1').querySelector('.pc')!.outerHTML).toBe('<span class="pc w">♚</span>');
    expect(square('d8').querySelector('.pc')!.outerHTML).toBe('<span class="pc b">♛</span>');
    expect(square('e4').querySelector('.pc')).toBeNull();
    expect(square('a1').className).toBe('sq d');
    expect(square('a1').querySelector('.coord.r')!.textContent).toBe('1');
    expect(square('a1').querySelector('.coord.f')!.textContent).toBe('a');
    // a primeira casa desenhada é a8 (brancas embaixo)
    expect((document.querySelector('#squares .sq') as HTMLElement).dataset.sq).toBe('a8');
  });
  it('clique-clique: seleciona, mostra os destinos e joga; a casa mantém o mesmo nó', () => {
    setup();
    const e4 = square('e4');
    act(() => {
      press('e2');
    });
    expect(square('e2').classList.contains('sel')).toBe(true);
    expect(square('e3').querySelector('.dot')).toBeTruthy();
    expect(square('e4').querySelector('.dot')).toBeTruthy();
    act(() => {
      press('e4');
    });
    expect(S.plies.map((p) => p.san)).toEqual(['e4']);
    expect(square('e4')).toBe(e4); // chave estável por casa: nada é recriado
    expect(square('e4').querySelector('.pc')!.textContent).toBe('♟');
    expect(square('e2').classList.contains('last')).toBe(true);
    expect(square('e4').classList.contains('last')).toBe(true);
    expect(document.querySelectorAll('#squares .dot').length).toBe(0);
  });
  it('clique numa casa sem destino desfaz a seleção', () => {
    setup();
    act(() => {
      press('g1');
    });
    expect(S.selected).toBe('g1');
    act(() => {
      press('e5');
    });
    expect(S.selected).toBeNull();
    expect(document.querySelectorAll('#squares .sel').length).toBe(0);
  });
  it('promoção: escolhe a peça e joga; clique fora cancela', () => {
    setup('8/P1k5/8/8/8/8/8/K7 w - - 0 1');
    act(() => {
      press('a7');
    });
    act(() => {
      press('a8');
    });
    const promo = document.getElementById('promo')!;
    expect(promo.hidden).toBe(false);
    expect([...promo.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))).toEqual(['dama', 'torre', 'bispo', 'cavalo']);
    // clique no fundo cancela
    fireEvent.click(promo);
    expect(promo.hidden).toBe(true);
    expect(S.plies.length).toBe(0);
    act(() => {
      press('a7');
    });
    act(() => {
      press('a8');
    });
    fireEvent.click(promo.querySelector('[data-p="n"]')!);
    expect(promo.hidden).toBe(true);
    expect(S.plies[0]!.san).toBe('a8=N+');
    expect(square('a8').querySelector('.pc')!.textContent).toBe('♞');
    expect(square('c7').classList.contains('chk')).toBe(true);
  });
  it('xeque-mate: rei caído e selos de vitória e derrota', () => {
    setup();
    act(() => {
      for (const m of ['f3', 'e5', 'g4', 'Qh4#']) applyMove(m, { silent: true });
      publish();
    });
    expect(square('e1').querySelector('.pc')!.className).toBe('pc fallen w');
    expect(square('e1').querySelector('.end-badge.lose')!.textContent).toBe('#');
    expect(square('e8').querySelector('.end-badge.win svg')).toBeTruthy();
  });
  it('vira o tabuleiro e desenha o realce do estudo com seta', () => {
    setup();
    act(() => {
      S.orient = 'b';
      S.studyMark = { fen: S.positions[0]!, from: 'g1', to: 'f3' };
      publish();
    });
    expect((document.querySelector('#squares .sq') as HTMLElement).dataset.sq).toBe('h1');
    expect(square('g1').classList.contains('hint')).toBe(true);
    expect(document.querySelectorAll('#arrows g').length).toBe(1);
    expect(document.querySelector('#arrows line')!.getAttribute('stroke')).toBe('var(--c-livro)');
  });
});

describe('Lista de lances', () => {
  it('numera, mostra os selos, marca o lance atual e navega no clique', () => {
    setup();
    act(() => {
      for (const m of ['e4', 'e5', 'Nf3']) applyMove(m, { silent: true });
      S.cls = [BOOK_CLS, BOOK_CLS, null];
      publish();
    });
    render(<MovesCard />);
    const list = document.getElementById('moveList')!;
    expect([...list.querySelectorAll('li.n')].map((n) => n.textContent)).toEqual(['1.', '2.']);
    const mvs = [...list.querySelectorAll('.mv')];
    expect(mvs.map((b) => b.textContent!.replace(/\s/g, ''))).toEqual(['e4', 'e5', 'Nf3', '']);
    expect(mvs[0]!.querySelector('.mini')!.getAttribute('title')).toBe('Livro');
    expect(mvs[2]!.querySelector('.mini')!.getAttribute('style')).toContain('var(--line)');
    expect(mvs[2]!.classList.contains('cur')).toBe(true);
    fireEvent.click(mvs[0]!);
    expect(S.view).toBe(1);
    expect(list.querySelector('.cur')!.textContent).toContain('e4');
    // o tabuleiro mostra a posição depois de 1. e4
    expect(square('e4').querySelector('.pc')).toBeTruthy();
    expect(square('e5').querySelector('.pc')).toBeNull();
  });
  it('sem lances: "Nenhum lance ainda."', () => {
    setup();
    render(<MovesCard />);
    expect(document.getElementById('moveList')!.textContent).toBe('Nenhum lance ainda.');
    expect((document.getElementById('btnFinish') as HTMLButtonElement).disabled).toBe(true);
  });
});
