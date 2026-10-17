// @vitest-environment jsdom
// Estudo de aberturas (artifact, sem login): busca, escolha, prática guiada com acerto, desvio, "Tentar de novo",
// dica, explorador e encerrar. O Stockfish não sobe aqui: as avaliações ficam "avaliando".
import './setup';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it } from 'vitest';
import { Board } from '../../src/board/board';
import { BOTS } from '../../src/core/constants';
import { resetBoard } from '../../src/core/game';
import { S } from '../../src/core/state';
import { REFS } from '../../src/game/ui-state';
import { initStudy, setStudy } from '../../src/study/panel';
import { STUDY } from '../../src/study/state';
import { StudyPanel } from '../../src/study/study-panel';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const press = (sq: string) =>
  act(() => {
    fireEvent.pointerDown($('board'), { button: 0, pointerId: 1, clientX: 'abcdefgh'.indexOf(sq[0]!) * 100 + 50, clientY: (8 - +sq[1]!) * 100 + 50 });
  });
const move = (a: string, b: string) => {
  press(a);
  press(b);
};

beforeAll(() => {
  initStudy();
  S.mode = 'play';
  S.bot = BOTS.find((b) => b.id === 'none')!;
  resetBoard();
});

describe('Estudo de aberturas', () => {
  it('abre com a busca focada e os populares', () => {
    render(
      <>
        <Board />
        <StudyPanel />
      </>,
    );
    act(() => setStudy(true));
    expect($('study').hidden).toBe(false);
    expect(document.activeElement).toBe($('studyQ'));
    expect(screen.getByText('Populares')).toBeTruthy();
    expect([...document.querySelectorAll('#studyPick .tutor-chips button')].map((b) => b.textContent)).toContain('Italiana');
    expect($('studyPractice').hidden).toBe(true);
  });
  it('busca, escolhe a família e pratica: acerto, desvio, tentar de novo e dica', async () => {
    const u = userEvent.setup();
    render(
      <>
        <Board />
        <StudyPanel />
      </>,
    );
    REFS.squares!.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 800, height: 800, right: 800, bottom: 800, x: 0, y: 0, toJSON() {} }) as DOMRect;
    await u.type($('studyQ'), 'italiana');
    await waitFor(() => expect(document.querySelectorAll('#studyPick .st-fam').length).toBeGreaterThan(0));
    const fam = document.querySelector<HTMLElement>('#studyPick .st-fam-h')!;
    await u.click(fam);
    expect(document.querySelector('#studyPick .st-sel b')!.textContent).toMatch(/Italiana/);
    expect(document.activeElement!.getAttribute('data-act')).toBe('watch');
    await u.click(screen.getByText('Praticar de brancas'));
    expect($('studyPractice').hidden).toBe(false);
    expect(document.querySelector('.st-ph small')!.textContent).toMatch(/^Você joga de brancas contra o Bot .+ · não vale rating$/);
    expect((document.getElementById('studyPickBox') as HTMLDetailsElement).open).toBe(false);
    expect((document.getElementById('studyExpBox') as HTMLDetailsElement).open).toBe(false);
    expect($('studyFb').textContent).toBe('Sua vez: jogue o lance da teoria.');
    // acerto: 1. e4 (o bot responde pela teoria)
    move('e2', 'e4');
    expect($('studyFb').className).toBe('st-fb hit');
    expect($('studyFb').textContent).toMatch(/^Lance de livro ✓ 1\. e4/);
    await waitFor(() => expect(S.plies.length).toBe(2), { timeout: 3000 });
    expect(document.querySelector('.st-score .ok b')!.textContent).toBe('1');
    // desvio: 2. a3 não é da Italiana
    move('a2', 'a3');
    expect($('studyFb').className).toBe('st-fb dev');
    expect($('studyFb').textContent).toMatch(/^Fora da teoria: 2\. a3/);
    expect(screen.getByText('Lances de livro aqui:')).toBeTruthy();
    expect(screen.getByText('Stockfish avaliando o seu lance e os de livro…')).toBeTruthy();
    expect([...document.querySelectorAll('#studyActs button')].map((b) => b.textContent)).toEqual([
      'Tentar de novo',
      'Continuar daqui',
      'Encerrar estudo',
    ]);
    expect(document.querySelector('.st-score .bad b')!.textContent).toBe('1');
    // o bot espera a escolha
    await new Promise((r) => setTimeout(r, 900));
    expect(S.plies.length).toBe(3);
    await u.click(screen.getByText('Tentar de novo'));
    expect(S.plies.length).toBe(2);
    expect($('studyFb').className).toBe('st-fb');
    expect(document.activeElement!.getAttribute('data-act')).toBe('hint');
    await u.click(document.activeElement as HTMLElement);
    expect($('studyFb').textContent).toMatch(/^Dica: a peça destacada em [a-h][1-8] tem um lance de livro\./);
    expect(document.querySelectorAll('#squares .sq.hint').length).toBe(1);
    expect(document.querySelector('.st-score span:last-child b')!.textContent).toBe('1');
  });
  it('explorador: lances de livro da posição e o clique realça no tabuleiro', async () => {
    render(
      <>
        <Board />
        <StudyPanel />
      </>,
    );
    const box = document.getElementById('studyExpBox') as HTMLDetailsElement;
    act(() => {
      box.open = true;
      box.dispatchEvent(new Event('toggle'));
    });
    expect(STUDY.expOpen).toBe(true);
    const rows = document.querySelectorAll<HTMLElement>('#studyExp .xp-row');
    expect(rows.length).toBeGreaterThan(0);
    expect(document.querySelector('#studyExp .xp-pos')!.textContent).toBe('Jogo do Peão do Rei · 2. brancas jogam');
    expect(rows[0]!.querySelector('.xp-ev')!.textContent).toBe('…');
    // partida contra o bot: o clique só realça (seta na cor do livro)
    fireEvent.click(rows[0]!);
    expect(S.studyMark).not.toBeNull();
    expect(document.querySelector('#arrows line')!.getAttribute('stroke')).toBe('var(--c-livro)');
  });
  it('Encerrar estudo: a prática acaba; Esc fecha o painel', async () => {
    const u = userEvent.setup();
    render(
      <>
        <Board />
        <StudyPanel />
      </>,
    );
    await u.click(screen.getByText('Encerrar estudo'));
    expect($('studyFb').textContent).toMatch(/^Prática encerrada\./);
    expect([...document.querySelectorAll('#studyActs button')].map((b) => b.textContent)).toEqual(['Praticar de novo']);
    // Esc fecha o painel e devolve o foco ao botão
    const btn = document.createElement('button');
    btn.id = 'openStudy';
    document.body.appendChild(btn);
    fireEvent.keyDown($('studyQ'), { key: 'Escape' });
    expect($('study').hidden).toBe(true);
    expect(document.activeElement).toBe(btn);
    btn.remove();
  });
});
