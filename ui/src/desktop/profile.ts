/* Perfil: nome, sobrenome, e-mail e troca de senha */
import { $, target } from '../ui/dom';
import { busy, clearInvalid, formMsg, invalid } from '../ui/forms';
import { ACCOUNT, EMAIL_RE, authError, renderAccount, setUserPop } from './account';
import { DESKTOP_AUTH } from './bridge';

let profileReturnFocus: HTMLElement | null = null;
function openProfile(): void {
  const u = ACCOUNT.user;
  if (!u) return;
  setUserPop(false);
  profileReturnFocus = $('#openUser');
  const form = $<HTMLFormElement>('#profileForm');
  form.reset();
  clearInvalid(form);
  $<HTMLInputElement>('#pfFirst').value = u.first_name;
  $<HTMLInputElement>('#pfLast').value = u.last_name;
  $<HTMLInputElement>('#pfEmail').value = u.email;
  formMsg($('#profileMsg'), '');
  $('#profileModal').hidden = false;
  $('#pfFirst').focus();
}
function closeProfile(): void {
  if ($('#profileModal').hidden) return;
  $('#profileModal').hidden = true;
  if (profileReturnFocus) profileReturnFocus.focus();
}
export function initProfile(): void {
  $('#openProfile').onclick = openProfile;
  $('#profileClose').onclick = closeProfile;
  $('#profileCancel').onclick = closeProfile;
  $('#profileModal').addEventListener('pointerdown', (e) => {
    if (target(e).id === 'profileModal') closeProfile();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#profileModal').hidden) {
      e.preventDefault();
      closeProfile();
    }
  });
  $<HTMLFormElement>('#profileForm').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement,
      msg = $('#profileMsg'),
      btn = $<HTMLButtonElement>('#profileSave'),
      u = ACCOUNT.user!;
    clearInvalid(form);
    const val = (s: string) => $<HTMLInputElement>(s).value;
    const first = val('#pfFirst').trim(),
      last = val('#pfLast').trim(),
      email = val('#pfEmail').trim();
    const cur = val('#pfCur'),
      nw = val('#pfNew'),
      nw2 = val('#pfNew2');
    if (!first) return invalid(msg, $('#pfFirst'), 'Informe o nome.');
    if (!last) return invalid(msg, $('#pfLast'), 'Informe o sobrenome.');
    if (!EMAIL_RE.test(email)) return invalid(msg, $('#pfEmail'), 'Esse e-mail não parece válido.');
    const data: Record<string, string> = {};
    if (first !== u.first_name) data.first_name = first;
    if (last !== u.last_name) data.last_name = last;
    if (email.toLowerCase() !== u.email) data.email = email;
    if (cur || nw || nw2) {
      if (!cur) return invalid(msg, $('#pfCur'), 'Para trocar a senha, informe a senha atual.');
      if (nw.length < 8) return invalid(msg, $('#pfNew'), 'A nova senha precisa ter pelo menos 8 caracteres.');
      if (nw !== nw2) return invalid(msg, $('#pfNew2'), 'As novas senhas não conferem.');
      data.password = nw;
      data.current_password = cur;
    }
    if (!Object.keys(data).length) {
      formMsg(msg, 'Nada mudou no seu perfil.', 'info');
      return;
    }
    formMsg(msg, '');
    busy(btn, true, 'Salvando…');
    const r = await DESKTOP_AUTH!.updateMe(data).catch(() => null);
    busy(btn, false);
    if (!r || !r.ok) {
      formMsg(msg, authError(r));
      if (r && r.status === 409) $('#pfEmail').setAttribute('aria-invalid', 'true');
      if (r && /senha atual/i.test(r.error || '')) {
        $('#pfCur').setAttribute('aria-invalid', 'true');
        $('#pfCur').focus();
      }
      return;
    }
    ACCOUNT.user = r.user;
    renderAccount();
    for (const id of ['#pfCur', '#pfNew', '#pfNew2']) $<HTMLInputElement>(id).value = '';
    formMsg(msg, r.passwordChanged ? 'Perfil salvo e senha trocada.' : 'Perfil salvo.', 'ok');
  };
}
