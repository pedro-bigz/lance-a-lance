/* ---------- Painel de administração (view admin): ilha React ----------
   Tabela de usuários com busca e paginação, ativar/desativar, bloquear, modal de novo usuário / editar usuário e o
   diálogo de exclusão. Ao abrir a tela carrega os papéis (uma vez) e a página atual de usuários.
   Os campos dos formulários não são controlados pelo React (refs, como os outros formulários da página): o valor fica
   só na propriedade value, sem virar atributo no HTML. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ApiUser } from '../types/api';
import { fmtDay } from '../ui/format';
import { ACCOUNT, authError } from './account';
import {
  ADMIN_ROLES,
  adminCountText,
  adminDenied,
  checkUserForm,
  fullName,
  refreshSelf,
  roleList,
  roleName,
  toggleMsg,
  type AdminField,
} from './admin';
import { DESKTOP_ADMIN } from './bridge';
import { useLatest, useViewRefresh } from './react/hooks';
import { FormMsg, Modal, msgOf, type Msg } from './react/modal';

const LIMIT = 20;
type Rows = 'loading' | 'error' | 'ok';

function StatusSelos({ u }: { u: ApiUser }) {
  return (
    <span className="selos">
      {u.forbidden ? <span className="selo bloqueado">Bloqueado</span> : null}
      {u.active ? <span className="selo ativo">Ativo</span> : <span className="selo inativo">Inativo</span>}
    </span>
  );
}

export function AdminView() {
  const refresh = useViewRefresh('admin');
  const begin = useLatest();
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [rows, setRows] = useState<Rows | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [roles, setRoles] = useState(roleList());
  const [busyAct, setBusyAct] = useState<string | null>(null); // "<id>:<ação>"
  // rodapé (contagem e Anterior/Próxima): muda só quando chega uma página, como antes
  const [foot, setFoot] = useState<{ count: string; prev: boolean; next: boolean } | null>(null);

  const loadUsers = useCallback(
    async (query: string, off: number): Promise<void> => {
      const admin = DESKTOP_ADMIN;
      if (!admin) return;
      const isCurrent = begin();
      setRows('loading');
      for (;;) {
        const r = await admin.listUsers({ q: query, limit: LIMIT, offset: off }).catch(() => null);
        if (!isCurrent()) return;
        if (!r || !r.ok) {
          if (await adminDenied(r)) return;
          setRows('error');
          setMsg(msgOf(authError(r)));
          return;
        }
        // a página ficou vazia (excluiu o último dela): volta uma
        if (!r.users.length && off > 0 && r.total > 0) {
          off = Math.max(0, off - LIMIT);
          setOffset(off);
          continue;
        }
        setUsers(r.users);
        setRows('ok');
        setFoot({ count: adminCountText(off, r.users.length, r.total), prev: off <= 0, next: off + r.users.length >= r.total });
        return;
      }
    },
    [begin],
  );
  // abrir a tela: papéis (uma vez) e a página atual
  const state = useRef({ q, offset });
  useEffect(() => {
    state.current = { q, offset };
  }, [q, offset]);
  useEffect(() => {
    if (!refresh || !DESKTOP_ADMIN) return;
    const admin = DESKTOP_ADMIN;
    (async () => {
      if (!ADMIN_ROLES.list.length) {
        const r = await admin.listRoles().catch(() => null);
        if (r && r.ok) {
          ADMIN_ROLES.list = r.roles;
          setRoles(r.roles);
        } else if (await adminDenied(r)) return;
      }
      loadUsers(state.current.q, state.current.offset);
    })();
  }, [refresh, loadUsers]);

  // busca com espera de 300 ms
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    [],
  );
  const onSearch = (value: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      const nq = value.trim();
      setQ(nq);
      setOffset(0);
      loadUsers(nq, 0);
    }, 300);
  };
  const go = (off: number) => {
    setOffset(off);
    loadUsers(q, off);
  };
  const replaceUser = (u: ApiUser) => setUsers((list) => list.map((x) => (x.id === u.id ? u : x)));

  async function toggleUser(u: ApiUser, field: 'active' | 'forbidden') {
    const value = field === 'active' ? !u.active : !u.forbidden;
    setBusyAct(`${u.id}:${field}`);
    const r = await DESKTOP_ADMIN!.updateUser(u.id, { [field]: value }).catch(() => null);
    setBusyAct(null);
    if (!r || !r.ok) {
      if (!(await adminDenied(r))) setMsg(msgOf(authError(r)));
      return;
    }
    replaceUser(r.user);
    refreshSelf(r.user);
    setMsg(msgOf(toggleMsg(r.user, field, value), 'ok'));
  }

  /* Novo usuário / editar usuário (mesmo modal) */
  const [userOpen, setUserOpen] = useState(false);
  const [editing, setEditing] = useState<ApiUser | null>(null);
  const [userMsg, setUserMsg] = useState<Msg>(null);
  const [userBusy, setUserBusy] = useState(false);
  const [invalidFields, setInvalid] = useState<AdminField[]>([]);
  const returnRef = useRef<HTMLElement | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  const lastRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);
  const roleRef = useRef<HTMLSelectElement>(null);
  const activeRef = useRef<HTMLInputElement>(null);
  const forbiddenRef = useRef<HTMLInputElement>(null);
  const fieldRef: Record<AdminField, React.RefObject<HTMLInputElement | null>> = {
    auFirst: firstRef,
    auLast: lastRef,
    auEmail: emailRef,
    auPass: passRef,
  };
  const openUserModal = (u: ApiUser | null) => {
    returnRef.current = document.activeElement as HTMLElement | null;
    setEditing(u);
    setInvalid([]);
    setUserMsg(msgOf(''));
    setUserOpen(true);
  };
  // preenche os campos ao abrir (antes de pintar e antes do foco ir para o nome)
  useLayoutEffect(() => {
    if (!userOpen) return;
    const u = editing;
    formRef.current!.reset();
    roleRef.current!.value = u ? u.role : 'jogador';
    firstRef.current!.value = u ? u.first_name : '';
    lastRef.current!.value = u ? u.last_name : '';
    emailRef.current!.value = u ? u.email : '';
    activeRef.current!.checked = u ? u.active : true;
    forbiddenRef.current!.checked = u ? u.forbidden : false;
  }, [userOpen, editing]);
  const closeUserModal = () => setUserOpen(false);
  const markInvalid = (fields: AdminField[], focus?: AdminField) => {
    setInvalid(fields);
    if (focus) fieldRef[focus].current!.focus();
  };
  async function submitUser(e: React.FormEvent) {
    e.preventDefault();
    const u = editing;
    setInvalid([]);
    const check = checkUserForm(
      {
        first: firstRef.current!.value,
        last: lastRef.current!.value,
        email: emailRef.current!.value,
        pass: passRef.current!.value,
        role: roleRef.current!.value,
        active: activeRef.current!.checked,
        forbidden: forbiddenRef.current!.checked,
      },
      u,
    );
    if ('error' in check) {
      setUserMsg(msgOf(check.error));
      markInvalid([check.field], check.field);
      return;
    }
    if ('info' in check) {
      setUserMsg(msgOf(check.info, 'info'));
      return;
    }
    setUserMsg(msgOf(''));
    setUserBusy(true);
    const r = await (u ? DESKTOP_ADMIN!.updateUser(u.id, check.data) : DESKTOP_ADMIN!.createUser(check.data)).catch(() => null);
    setUserBusy(false);
    if (!r || !r.ok) {
      if (await adminDenied(r)) {
        closeUserModal();
        return;
      }
      setUserMsg(msgOf(authError(r)));
      const bad: AdminField[] = [];
      if (r && /e-mail/i.test(r.error || '')) bad.push('auEmail');
      if (r && /senha/i.test(r.error || '')) bad.push('auPass');
      if (bad.length) setInvalid(bad);
      return;
    }
    closeUserModal();
    const nm = fullName(r.user);
    if (u) {
      replaceUser(r.user);
      refreshSelf(r.user);
      setMsg(msgOf(`${nm}: alterações salvas.`, 'ok'));
    } else {
      setMsg(msgOf(`${nm} foi criado como ${roleName(r.user.role).toLowerCase()}.`, 'ok'));
      loadUsers(q, offset);
    }
  }

  /* Excluir: confirmação dentro da página (confirm() não funciona no artifact) */
  const [deleting, setDeleting] = useState<ApiUser | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [delMsg, setDelMsg] = useState<Msg>(null);
  const [delBusy, setDelBusy] = useState(false);
  const noRef = useRef<HTMLButtonElement>(null);
  const openConfirm = (u: ApiUser, btn: HTMLElement) => {
    returnRef.current = btn;
    setDeleting(u);
    setDelMsg(msgOf(''));
    setConfirmOpen(true);
  };
  const closeConfirm = () => setConfirmOpen(false);
  async function confirmDelete() {
    const u = deleting;
    if (!u || !confirmOpen) return;
    setDelBusy(true);
    const r = await DESKTOP_ADMIN!.deleteUser(u.id).catch(() => null);
    setDelBusy(false);
    if (!r || !r.ok) {
      if (await adminDenied(r)) {
        closeConfirm();
        return;
      }
      setDelMsg(msgOf(authError(r)));
      return;
    }
    closeConfirm();
    setMsg(msgOf(`A conta de ${fullName(u)} foi excluída.`, 'ok'));
    loadUsers(q, offset);
  }

  const me = ACCOUNT.user && ACCOUNT.user.id;
  const inv = (f: AdminField) => (invalidFields.includes(f) ? 'true' : undefined);
  return (
    <>
      <div className="admin-h">
        <div>
          <h2 id="adminTtl">Painel de administração</h2>
          <p>Contas, papéis e acesso ao Lance a Lance.</p>
        </div>
        <button
          className="btn primary"
          id="adminNew"
          onClick={() => {
            setMsg(msgOf(''));
            openUserModal(null);
          }}
        >
          Novo usuário
        </button>
      </div>
      <div className="admin-tools">
        <input
          className="admin-search"
          id="adminSearch"
          type="search"
          placeholder="Buscar por nome ou e-mail"
          aria-label="Buscar usuários"
          maxLength={100}
          autoComplete="off"
          onChange={(e) => onSearch(e.target.value)}
        />
        <button
          className="btn"
          id="adminReload"
          onClick={() => {
            setMsg(msgOf(''));
            loadUsers(q, offset);
          }}
        >
          Atualizar
        </button>
      </div>
      <FormMsg id="adminMsg" msg={msg} role="status" />
      <div className="card admin-card">
        <div className="admin-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Papel</th>
                <th>Status</th>
                <th className="u-date">Criado em</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody id="adminRows">
              {rows === 'loading' ? (
                <tr>
                  <td colSpan={6} className="admin-empty">
                    Carregando…
                  </td>
                </tr>
              ) : rows === 'error' ? (
                <tr>
                  <td colSpan={6} className="admin-empty">
                    Não foi possível carregar os usuários.
                  </td>
                </tr>
              ) : rows === 'ok' && !users.length ? (
                <tr>
                  <td colSpan={6} className="admin-empty">
                    {q ? 'Nenhum usuário encontrado para essa busca.' : 'Nenhum usuário cadastrado.'}
                  </td>
                </tr>
              ) : rows === 'ok' ? (
                users.map((u) => (
                  <tr key={u.id} data-id={u.id}>
                    <td className="u-name">
                      {fullName(u)}
                      {u.id === me ? <span className="you-tag">você</span> : null}
                    </td>
                    <td className="u-mail">{u.email}</td>
                    <td>
                      <span className={`selo papel ${u.role}`}>{u.role_name || roleName(u.role)}</span>
                    </td>
                    <td>
                      <StatusSelos u={u} />
                    </td>
                    <td className="u-date">{fmtDay(u.created_at)}</td>
                    <td>
                      <span className="u-acts">
                        <button
                          className="btn"
                          data-act="edit"
                          onClick={() => {
                            setMsg(msgOf(''));
                            openUserModal(u);
                          }}
                        >
                          Editar
                        </button>
                        {(['active', 'forbidden'] as const).map((f) => {
                          const busy = busyAct === `${u.id}:${f}`;
                          const label = f === 'active' ? (u.active ? 'Desativar' : 'Ativar') : u.forbidden ? 'Desbloquear' : 'Bloquear';
                          return (
                            <button
                              key={f}
                              className="btn"
                              data-act={f}
                              disabled={busy}
                              aria-busy={busy ? 'true' : undefined}
                              onClick={() => {
                                setMsg(msgOf(''));
                                toggleUser(u, f);
                              }}
                            >
                              {busy ? '…' : label}
                            </button>
                          );
                        })}
                        <button
                          className="btn danger"
                          data-act="delete"
                          onClick={(e) => {
                            setMsg(msgOf(''));
                            openConfirm(u, e.currentTarget);
                          }}
                        >
                          Excluir
                        </button>
                      </span>
                    </td>
                  </tr>
                ))
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="admin-foot">
          <span id="adminCount">{foot ? foot.count : ''}</span>
          <span className="row">
            <button className="btn" id="adminPrev" disabled={!!foot && foot.prev} onClick={() => go(Math.max(0, offset - LIMIT))}>
              Anterior
            </button>
            <button className="btn" id="adminNext" disabled={!!foot && foot.next} onClick={() => go(offset + LIMIT)}>
              Próxima
            </button>
          </span>
        </div>
      </div>

      <Modal id="adminUserModal" open={userOpen} onClose={closeUserModal} initialFocus={firstRef} returnFocus={returnRef}>
        <form
          className="card modal-card admin-modal-card"
          id="adminUserForm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="adminUserTtl"
          tabIndex={-1}
          noValidate
          ref={formRef}
          onSubmit={submitUser}
        >
          <div className="drawer-h">
            <h2 id="adminUserTtl">{editing ? 'Editar usuário' : 'Novo usuário'}</h2>
            <button type="button" className="btn icon" id="adminUserClose" aria-label="Fechar" onClick={closeUserModal}>
              {'✕'}
            </button>
          </div>
          <div className="form-grid">
            <label className="auth-field">
              <span>Nome</span>
              <input id="auFirst" ref={firstRef} autoComplete="off" maxLength={100} required aria-invalid={inv('auFirst')} />
            </label>
            <label className="auth-field">
              <span>Sobrenome</span>
              <input id="auLast" ref={lastRef} autoComplete="off" maxLength={100} required aria-invalid={inv('auLast')} />
            </label>
            <label className="auth-field wide">
              <span>E-mail</span>
              <input
                id="auEmail"
                ref={emailRef}
                type="email"
                autoComplete="off"
                inputMode="email"
                maxLength={255}
                required
                aria-invalid={inv('auEmail')}
              />
            </label>
            <label className="auth-field">
              <span>Senha</span>
              <input
                id="auPass"
                ref={passRef}
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={200}
                aria-invalid={inv('auPass')}
              />
              <small id="auPassHint">{editing ? 'Deixe em branco para manter a senha atual' : 'Mínimo de 8 caracteres'}</small>
            </label>
            <label className="auth-field">
              <span>Papel</span>
              <select id="auRole" ref={roleRef}>
                {roles.map((r) => (
                  <option key={r.slug} value={r.slug}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="admin-flags" id="auFlags" hidden={!editing}>
            <label className="switch" htmlFor="auActive">
              <input type="checkbox" id="auActive" ref={activeRef} role="switch" />
              <span className="track" aria-hidden="true"></span>
              <span>Conta ativa</span>
            </label>
            <label className="switch" htmlFor="auForbidden">
              <input type="checkbox" id="auForbidden" ref={forbiddenRef} role="switch" />
              <span className="track" aria-hidden="true"></span>
              <span>Bloqueada</span>
            </label>
          </div>
          <FormMsg id="adminUserMsg" msg={userMsg} role="alert" />
          <div className="row">
            <button type="button" className="btn" id="adminUserCancel" onClick={closeUserModal}>
              Cancelar
            </button>
            <button className="btn primary" type="submit" id="adminUserSave" disabled={userBusy} aria-busy={userBusy ? 'true' : undefined}>
              {userBusy ? 'Salvando…' : editing ? 'Salvar alterações' : 'Criar usuário'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal id="adminConfirmModal" open={confirmOpen} onClose={closeConfirm} initialFocus={noRef} returnFocus={returnRef}>
        <div
          className="card modal-card confirm-card"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="adminConfirmTtl"
          aria-describedby="adminConfirmTxt"
          tabIndex={-1}
        >
          <h2 id="adminConfirmTtl">Excluir usuário</h2>
          <p id="adminConfirmTxt">
            {deleting ? `Excluir a conta de ${fullName(deleting)} (${deleting.email})? Esta ação é definitiva e não pode ser desfeita.` : ''}
          </p>
          <FormMsg id="adminConfirmMsg" msg={delMsg} role="alert" />
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 0 }}>
            <button className="btn" id="adminConfirmNo" ref={noRef} onClick={closeConfirm}>
              Cancelar
            </button>
            <button
              className="btn danger-solid"
              id="adminConfirmYes"
              disabled={delBusy}
              aria-busy={delBusy ? 'true' : undefined}
              onClick={confirmDelete}
            >
              {delBusy ? 'Excluindo…' : 'Excluir definitivamente'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
