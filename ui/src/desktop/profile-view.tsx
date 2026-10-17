/* Modal "Seu perfil" (ilha React sem section: abre pelo menu da conta, em qualquer tela). Campos não controlados
   (refs), como no painel de administração. Ao fechar, o foco volta para o avatar (#openUser). */
import { useLayoutEffect, useRef, useState } from 'react';
import { ACCOUNT, authError, renderAccount } from './account';
import { DESKTOP_AUTH } from './bridge';
import { PROFILE_OPEN, checkProfile, type ProfileField } from './profile';
import { useStore } from './react/hooks';
import { FormMsg, Modal, msgOf, type Msg } from './react/modal';

export function ProfileView() {
  const open = useStore(PROFILE_OPEN);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [invalidFields, setInvalid] = useState<ProfileField[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  const lastRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const curRef = useRef<HTMLInputElement>(null);
  const newRef = useRef<HTMLInputElement>(null);
  const new2Ref = useRef<HTMLInputElement>(null);
  /** campo pelo id (só em efeitos e eventos) */
  const field = (f: ProfileField): HTMLInputElement =>
    ({ pfFirst: firstRef, pfLast: lastRef, pfEmail: emailRef, pfCur: curRef, pfNew: newRef, pfNew2: new2Ref })[f].current as HTMLInputElement;
  const returnRef = useRef<HTMLElement | null>(null);
  const close = () => PROFILE_OPEN.set(false);
  // ao abrir: limpa o formulário e preenche com a conta (antes de pintar e antes do foco ir para o nome)
  useLayoutEffect(() => {
    const u = ACCOUNT.user;
    if (!open || !u) return;
    returnRef.current = document.getElementById('openUser');
    formRef.current!.reset();
    field('pfFirst').value = u.first_name;
    field('pfLast').value = u.last_name;
    field('pfEmail').value = u.email;
    /* eslint-disable react-hooks/set-state-in-effect */
    setInvalid([]);
    setMsg(msgOf(''));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open]);
  const val = (f: ProfileField) => field(f).value;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const u = ACCOUNT.user!;
    setInvalid([]);
    const check = checkProfile(
      { first: val('pfFirst'), last: val('pfLast'), email: val('pfEmail'), cur: val('pfCur'), nw: val('pfNew'), nw2: val('pfNew2') },
      u,
    );
    if ('error' in check) {
      setMsg(msgOf(check.error));
      setInvalid([check.field]);
      field(check.field).focus();
      return;
    }
    if ('info' in check) {
      setMsg(msgOf(check.info, 'info'));
      return;
    }
    setMsg(msgOf(''));
    setBusy(true);
    const r = await DESKTOP_AUTH!.updateMe(check.data as Record<string, string>).catch(() => null);
    setBusy(false);
    if (!r || !r.ok) {
      setMsg(msgOf(authError(r)));
      const bad: ProfileField[] = [];
      if (r && r.status === 409) bad.push('pfEmail');
      if (r && /senha atual/i.test(r.error || '')) {
        bad.push('pfCur');
        field('pfCur').focus();
      }
      if (bad.length) setInvalid(bad);
      return;
    }
    ACCOUNT.user = r.user;
    renderAccount();
    for (const f of ['pfCur', 'pfNew', 'pfNew2'] as const) field(f).value = '';
    setMsg(msgOf(r.passwordChanged ? 'Perfil salvo e senha trocada.' : 'Perfil salvo.', 'ok'));
  }
  const inv = (f: ProfileField) => (invalidFields.includes(f) ? 'true' : undefined);
  return (
    <Modal id="profileModal" open={open} onClose={close} initialFocus={firstRef} returnFocus={returnRef}>
      <form
        className="card modal-card profile-card"
        id="profileForm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profileTtl"
        tabIndex={-1}
        noValidate
        ref={formRef}
        onSubmit={submit}
      >
        <div className="drawer-h">
          <h2 id="profileTtl">Seu perfil</h2>
          <button type="button" className="btn icon" id="profileClose" aria-label="Fechar" onClick={close}>
            {'✕'}
          </button>
        </div>
        <div className="form-grid">
          <label className="auth-field">
            <span>Nome</span>
            <input id="pfFirst" ref={firstRef} autoComplete="given-name" maxLength={100} required aria-invalid={inv('pfFirst')} />
          </label>
          <label className="auth-field">
            <span>Sobrenome</span>
            <input id="pfLast" ref={lastRef} autoComplete="family-name" maxLength={100} required aria-invalid={inv('pfLast')} />
          </label>
          <label className="auth-field wide">
            <span>E-mail</span>
            <input
              id="pfEmail"
              ref={emailRef}
              type="email"
              autoComplete="email"
              inputMode="email"
              maxLength={255}
              required
              aria-invalid={inv('pfEmail')}
            />
          </label>
        </div>
        <fieldset className="pw-box">
          <legend>
            Trocar senha <small>(opcional)</small>
          </legend>
          <label className="auth-field">
            <span>Senha atual</span>
            <input id="pfCur" ref={curRef} type="password" autoComplete="current-password" maxLength={200} aria-invalid={inv('pfCur')} />
          </label>
          <div className="form-grid">
            <label className="auth-field">
              <span>Nova senha</span>
              <input id="pfNew" ref={newRef} type="password" autoComplete="new-password" minLength={8} maxLength={200} aria-invalid={inv('pfNew')} />
              <small>Mínimo de 8 caracteres</small>
            </label>
            <label className="auth-field">
              <span>Confirmar nova senha</span>
              <input
                id="pfNew2"
                ref={new2Ref}
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={200}
                aria-invalid={inv('pfNew2')}
              />
            </label>
          </div>
        </fieldset>
        <FormMsg id="profileMsg" msg={msg} role="alert" />
        <div className="row">
          <button type="button" className="btn" id="profileCancel" onClick={close}>
            Fechar
          </button>
          <button className="btn primary" type="submit" id="profileSave" disabled={busy} aria-busy={busy ? 'true' : undefined}>
            {busy ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
