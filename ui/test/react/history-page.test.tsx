// @vitest-environment jsdom
import './setup';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createHistPager } from '../../src/desktop/history-page';
import { HistoryPageView } from '../../src/desktop/history-page-view';
import { refreshView } from '../../src/desktop/views';
import { setGameStore } from '../../src/store/game-store';
import { fakeStore, game } from './fixtures';

function setup(store: ReturnType<typeof fakeStore>) {
  setGameStore(store);
  const pager = createHistPager(() => store);
  const r = render(
    <section className="view histpage" data-view="historico">
      <HistoryPageView pager={pager} />
    </section>,
  );
  act(() => refreshView('historico'));
  return { ...r, pager };
}
const items = () => document.querySelectorAll('#hpList .hist-item');

describe('Histórico (página)', () => {
  it('antes de abrir a tela a lista fica vazia (mesmo HTML de antes)', () => {
    const store = fakeStore([game('a')]);
    const pager = createHistPager(() => store);
    render(<HistoryPageView pager={pager} />);
    expect(document.querySelector('#hpList')!.children.length).toBe(0);
    expect(document.querySelector('#hpMsg')!.className).toBe('form-msg');
  });
  it('lista as partidas com a contagem e filtra por resultado nas já carregadas', async () => {
    const store = fakeStore([game('a'), game('b', { result: 'derrota' }), game('c', { status: 'andamento', result: null })]);
    setup(store);
    await waitFor(() => expect(items().length).toBe(3));
    expect(screen.getByText('3 de 3 partidas')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Vitórias' }));
    await waitFor(() => expect(items().length).toBe(1));
    expect(screen.getByText('1 encontrada em 3 de 3 partidas')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Vitórias' }).getAttribute('aria-pressed')).toBe('true');
  });
  it('situação vai para a API; escolher um resultado tira o filtro "em andamento"', async () => {
    const store = fakeStore([game('a'), game('c', { status: 'andamento', result: null })]);
    setup(store);
    await waitFor(() => expect(items().length).toBe(2));
    await userEvent.click(screen.getByRole('button', { name: 'Em andamento' }));
    await waitFor(() => expect(items().length).toBe(1));
    expect(store.calls.at(-1)!.status).toBe('andamento');
    await userEvent.click(screen.getByRole('button', { name: 'Derrotas' }));
    await waitFor(() => expect(screen.getByText('Nenhuma partida neste filtro')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Todas' }).getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    await waitFor(() => expect(items().length).toBe(2));
  });
  it('estado vazio e estado de erro com "Tentar de novo"', async () => {
    setup(fakeStore([]));
    await waitFor(() => expect(screen.getByText('Nenhuma partida ainda')).toBeTruthy());
  });
  it('erro de conexão sem nada na fila', async () => {
    const store = fakeStore([], { fail: true });
    setup(store);
    await waitFor(() => expect(screen.getByText('Não foi possível carregar as partidas')).toBeTruthy());
    const n = store.calls.length;
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(store.calls.length).toBe(n + 1);
  });
  it('"Carregar mais" busca a próxima página', async () => {
    const many = Array.from({ length: 25 }, (_, i) => game('g' + i));
    const store = fakeStore(many);
    setup(store);
    await waitFor(() => expect(items().length).toBe(20));
    expect(document.querySelector<HTMLElement>('#hpMoreWrap')!.hidden).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));
    await waitFor(() => expect(items().length).toBe(25));
    expect(document.querySelector<HTMLElement>('#hpMoreWrap')!.hidden).toBe(true);
  });
  it('excluir: diálogo com foco no Cancelar, Esc fecha e devolve o foco; confirmar exclui', async () => {
    const store = fakeStore([game('a'), game('b')]);
    setup(store);
    await waitFor(() => expect(items().length).toBe(2));
    const del = screen.getAllByRole('button', { name: /^Excluir Você/ })[0]!;
    await userEvent.click(del);
    const modal = document.getElementById('gameConfirmModal')!;
    expect(modal.hidden).toBe(false);
    expect(modal.parentElement!.id).toBe('appRoot');
    expect(document.activeElement!.id).toBe('gameConfirmNo');
    expect(document.getElementById('gameConfirmTxt')!.textContent).toMatch(/^Excluir a partida Você × .+ \(vitória, .+\)\? Ela some do histórico/);
    await userEvent.keyboard('{Escape}');
    expect(modal.hidden).toBe(true);
    expect(document.activeElement).toBe(del);
    await userEvent.click(del);
    await userEvent.click(within(modal).getByRole('button', { name: 'Excluir partida' }));
    await waitFor(() => expect(modal.hidden).toBe(true));
    expect(store.removed).toEqual(['a']);
    expect(items().length).toBe(1);
    expect(document.activeElement!.id).toBe('hpReload');
    expect(document.getElementById('viewToast')!.textContent).toMatch(/^Partida Você × .+ excluída\.$/);
  });
});
