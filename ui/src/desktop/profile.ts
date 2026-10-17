/* Perfil: nome, sobrenome, e-mail e troca de senha. O modal é a ilha React de profile-view.tsx; aqui ficam a abertura
   (pelo menu da conta) e a validação. */
import { createStore } from '../store/data-events';
import type { ApiUser } from '../types/api';
import { $ } from '../ui/dom';
import { EMAIL_RE, setUserPop } from './account';
import type { FormCheck } from './admin';

/** modal de perfil aberto (a ilha assina) */
export const PROFILE_OPEN = createStore(false);
export function openProfile(): void {
  setUserPop(false);
  PROFILE_OPEN.set(true);
}

export type ProfileField = 'pfFirst' | 'pfLast' | 'pfEmail' | 'pfCur' | 'pfNew' | 'pfNew2';
export interface ProfileValues {
  first: string;
  last: string;
  email: string;
  cur: string;
  nw: string;
  nw2: string;
}
/** confere o formulário e monta o corpo de users:update-me (só o que mudou; senha só com a atual) */
export function checkProfile(v: ProfileValues, u: ApiUser): FormCheck<ProfileField> {
  const first = v.first.trim(),
    last = v.last.trim(),
    email = v.email.trim();
  if (!first) return { error: 'Informe o nome.', field: 'pfFirst' };
  if (!last) return { error: 'Informe o sobrenome.', field: 'pfLast' };
  if (!EMAIL_RE.test(email)) return { error: 'Esse e-mail não parece válido.', field: 'pfEmail' };
  const data: Record<string, string> = {};
  if (first !== u.first_name) data.first_name = first;
  if (last !== u.last_name) data.last_name = last;
  if (email.toLowerCase() !== u.email) data.email = email;
  if (v.cur || v.nw || v.nw2) {
    if (!v.cur) return { error: 'Para trocar a senha, informe a senha atual.', field: 'pfCur' };
    if (v.nw.length < 8) return { error: 'A nova senha precisa ter pelo menos 8 caracteres.', field: 'pfNew' };
    if (v.nw !== v.nw2) return { error: 'As novas senhas não conferem.', field: 'pfNew2' };
    data.password = v.nw;
    data.current_password = v.cur;
  }
  if (!Object.keys(data).length) return { info: 'Nada mudou no seu perfil.' };
  return { data };
}
export function initProfile(): void {
  $('#openProfile').onclick = openProfile;
}
