// Formulários: mensagem do formulário, botão ocupado e marcação de campo inválido
export function formMsg(el: HTMLElement, text: string | null | undefined, kind = 'err'): void {
  el.hidden = !text;
  el.textContent = text || '';
  el.className = 'form-msg ' + kind;
}
export function busy(btn: HTMLButtonElement, on: boolean, label?: string): void {
  if (on) {
    btn.dataset.label = btn.textContent as string;
    btn.textContent = label as string;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
  } else {
    btn.textContent = btn.dataset.label || btn.textContent;
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
  }
}
// marca o primeiro campo com problema e mostra a mensagem
export function invalid(msgEl: HTMLElement, input: HTMLElement | null, text: string): false {
  formMsg(msgEl, text);
  if (input) {
    input.setAttribute('aria-invalid', 'true');
    input.focus();
  }
  return false;
}
export function clearInvalid(form: HTMLElement): void {
  for (const i of form.querySelectorAll('[aria-invalid]')) i.removeAttribute('aria-invalid');
}
