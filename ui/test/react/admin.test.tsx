// @vitest-environment jsdom
import './setup';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiUser } from '../../src/types/api';
import { user } from './fixtures';

// ponte do desktop (window.lanceDesktop.admin / .auth) falsa
const bridge = vi.hoisted(() => {
  const db: { users: ApiUser[] } = { users: [] };
  const ok = <T extends object>(x: T) => Promise.resolve({ ok: true as const, ...x });
  const admin = {
    listRoles: vi.fn(() =>
      ok({
        roles: [
          { slug: 'administrador', name: 'Administrador' },
          { slug: 'jogador', name: 'Jogador' },
        ],
      }),
    ),
    listUsers: vi.fn((p: { q: string; limit: number; offset: number }) => {
      const f = db.users.filter((u) => !p.q || `${u.first_name} ${u.last_name} ${u.email}`.includes(p.q));
      return ok({ users: f.slice(p.offset, p.offset + p.limit), total: f.length, limit: p.limit, offset: p.offset });
    }),
    getUser: vi.fn(),
    createUser: vi.fn((d: Record<string, string | boolean>) => {
      const u = {
        id: 'novo',
        first_name: String(d.first_name),
        last_name: String(d.last_name),
        email: String(d.email),
        role: String(d.role),
        active: true,
        forbidden: false,
        created_at: '2026-10-17T00:00:00Z',
      };
      db.users.push(u);
      return ok({ user: u });
    }),
    updateUser: vi.fn((id: string, d: Record<string, string | boolean>) => {
      const i = db.users.findIndex((u) => u.id === id);
      db.users[i] = { ...db.users[i]!, ...d } as ApiUser;
      return ok({ user: db.users[i]! });
    }),
    deleteUser: vi.fn((id: string) => {
      const u = db.users.find((x) => x.id === id)!;
      db.users = db.users.filter((x) => x.id !== id);
      return ok({ deleted: u });
    }),
  };
  const auth = { me: vi.fn(() => ok({ user: db.users[0]! })) };
  return { db, admin, auth };
});
vi.mock('../../src/desktop/bridge', () => ({
  LD: undefined,
  DESKTOP_AUTH: bridge.auth,
  DESKTOP_ADMIN: bridge.admin,
  DESKTOP_AI: undefined,
  DESKTOP_STATS: undefined,
  API_GAMES_STORE: undefined,
  API_GAMES: false,
}));
const { AdminView } = await import('../../src/desktop/admin-view');
const { refreshView } = await import('../../src/desktop/views');
const { ACCOUNT } = await import('../../src/desktop/account');

beforeEach(() => {
  bridge.db.users = [user('u1', { first_name: 'Teste', last_name: 'Lance', role: 'administrador', role_name: 'Administrador' }), user('u2')];
  ACCOUNT.user = bridge.db.users[0]!;
  vi.clearAllMocks();
});
async function open() {
  render(<AdminView />);
  act(() => refreshView('admin'));
  await waitFor(() => expect(document.querySelectorAll('#adminRows tr[data-id]').length).toBe(2));
}
const row = (id: string) => document.querySelector<HTMLElement>(`#adminRows tr[data-id="${id}"]`)!;

describe('Administração', () => {
  it('mostra os usuários, o selo "você" e a contagem', async () => {
    await open();
    expect(bridge.admin.listRoles).toHaveBeenCalledTimes(1);
    expect(within(row('u1')).getByText('você')).toBeTruthy();
    expect(within(row('u2')).getByText('Ativo')).toBeTruthy();
    expect(screen.getByText('1–2 de 2 usuários')).toBeTruthy();
    expect((document.getElementById('adminPrev') as HTMLButtonElement).disabled).toBe(true);
    expect((document.getElementById('adminNext') as HTMLButtonElement).disabled).toBe(true);
  });
  it('desativar e bloquear chamam a API e mostram o aviso', async () => {
    await open();
    await userEvent.click(within(row('u2')).getByRole('button', { name: 'Desativar' }));
    await waitFor(() => expect(screen.getByText('Ana Souza: conta desativada.')).toBeTruthy());
    expect(bridge.admin.updateUser).toHaveBeenCalledWith('u2', { active: false });
    expect(within(row('u2')).getByText('Inativo')).toBeTruthy();
    await userEvent.click(within(row('u2')).getByRole('button', { name: 'Bloquear' }));
    await waitFor(() => expect(screen.getByText('Ana Souza: conta bloqueada.')).toBeTruthy());
    expect(within(row('u2')).getByText('Bloqueado')).toBeTruthy();
  });
  it('busca espera 300 ms e manda o texto sem espaços nas pontas', async () => {
    await open();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar usuários' }), ' zzz ');
    expect(bridge.admin.listUsers).not.toHaveBeenCalledWith(expect.objectContaining({ q: 'zzz' }));
    await act(() => vi.advanceTimersByTimeAsync(350));
    vi.useRealTimers();
    await waitFor(() => expect(screen.getByText('Nenhum usuário encontrado para essa busca.')).toBeTruthy());
    expect(bridge.admin.listUsers).toHaveBeenLastCalledWith({ q: 'zzz', limit: 20, offset: 0 });
  });
  it('novo usuário: valida, marca o campo e cria', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Novo usuário' }));
    const modal = document.getElementById('adminUserModal')!;
    expect(modal.hidden).toBe(false);
    expect(document.activeElement!.id).toBe('auFirst');
    expect(document.getElementById('auFlags')!.hidden).toBe(true);
    await userEvent.click(within(modal).getByRole('button', { name: 'Criar usuário' }));
    expect(screen.getByRole('alert').textContent).toBe('Informe o nome.');
    expect(document.getElementById('auFirst')!.getAttribute('aria-invalid')).toBe('true');
    await userEvent.type(document.getElementById('auFirst')!, 'Bia');
    await userEvent.type(document.getElementById('auLast')!, 'Lima');
    await userEvent.type(document.getElementById('auEmail')!, 'bia@lance.local');
    await userEvent.type(document.getElementById('auPass')!, 'curta');
    await userEvent.click(within(modal).getByRole('button', { name: 'Criar usuário' }));
    expect(document.getElementById('adminUserMsg')!.textContent).toBe('A senha precisa ter pelo menos 8 caracteres.');
    expect(document.getElementById('auFirst')!.hasAttribute('aria-invalid')).toBe(false);
    expect(document.activeElement!.id).toBe('auPass');
    await userEvent.type(document.getElementById('auPass')!, '12345678');
    await userEvent.click(within(modal).getByRole('button', { name: 'Criar usuário' }));
    await waitFor(() => expect(modal.hidden).toBe(true));
    expect(bridge.admin.createUser).toHaveBeenCalledWith({
      first_name: 'Bia',
      last_name: 'Lima',
      email: 'bia@lance.local',
      password: 'curta12345678',
      role: 'jogador',
    });
    await waitFor(() => expect(screen.getByText('Bia Lima foi criado como jogador.')).toBeTruthy());
    await waitFor(() => expect(document.querySelectorAll('#adminRows tr[data-id]').length).toBe(3));
  });
  it('editar: preenche o formulário, "nada mudou" e salva só o que mudou', async () => {
    await open();
    const btn = within(row('u2')).getByRole('button', { name: 'Editar' });
    await userEvent.click(btn);
    const modal = document.getElementById('adminUserModal')!;
    expect((document.getElementById('auEmail') as HTMLInputElement).value).toBe('u2@lance.local');
    expect((document.getElementById('auRole') as HTMLSelectElement).value).toBe('jogador');
    expect(document.getElementById('auFlags')!.hidden).toBe(false);
    expect(document.getElementById('auPassHint')!.textContent).toBe('Deixe em branco para manter a senha atual');
    await userEvent.click(within(modal).getByRole('button', { name: 'Salvar alterações' }));
    expect(document.getElementById('adminUserMsg')!.textContent).toBe('Nada mudou neste usuário.');
    expect(document.getElementById('adminUserMsg')!.className).toBe('form-msg info');
    await userEvent.selectOptions(document.getElementById('auRole')!, 'administrador');
    await userEvent.click(within(modal).getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(modal.hidden).toBe(true));
    expect(bridge.admin.updateUser).toHaveBeenCalledWith('u2', { role: 'administrador' });
    expect(document.activeElement).toBe(btn);
    expect(screen.getByText('Ana Souza: alterações salvas.')).toBeTruthy();
  });
  it('excluir: diálogo, Esc cancela, confirmar exclui', async () => {
    await open();
    const btn = within(row('u2')).getByRole('button', { name: 'Excluir' });
    await userEvent.click(btn);
    const modal = document.getElementById('adminConfirmModal')!;
    expect(document.activeElement!.id).toBe('adminConfirmNo');
    expect(document.getElementById('adminConfirmTxt')!.textContent).toBe(
      'Excluir a conta de Ana Souza (u2@lance.local)? Esta ação é definitiva e não pode ser desfeita.',
    );
    await userEvent.keyboard('{Escape}');
    expect(modal.hidden).toBe(true);
    expect(document.activeElement).toBe(btn);
    expect(bridge.admin.deleteUser).not.toHaveBeenCalled();
    await userEvent.click(btn);
    await userEvent.click(within(modal).getByRole('button', { name: 'Excluir definitivamente' }));
    await waitFor(() => expect(screen.getByText('A conta de Ana Souza foi excluída.')).toBeTruthy());
    expect(bridge.admin.deleteUser).toHaveBeenCalledWith('u2');
    await waitFor(() => expect(document.querySelectorAll('#adminRows tr[data-id]').length).toBe(1));
  });
  it('erro da API: mensagem na tela e linha de erro', async () => {
    const real = bridge.admin.listUsers.getMockImplementation()!;
    bridge.admin.listUsers.mockImplementation(
      () => Promise.resolve({ ok: false, status: 0, error: 'Não foi possível conectar ao servidor.' }) as never,
    );
    try {
      render(<AdminView />);
      act(() => refreshView('admin'));
      await waitFor(() => expect(screen.getByText('Não foi possível carregar os usuários.')).toBeTruthy());
      expect(document.getElementById('adminMsg')!.textContent).toBe('Não foi possível conectar ao servidor.');
    } finally {
      bridge.admin.listUsers.mockImplementation(real);
    }
  });
});
