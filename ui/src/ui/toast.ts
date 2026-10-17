// Aviso curto no rodapé da tela (some sozinho)
let toastTimer: ReturnType<typeof setTimeout> | null = null;
export function viewToast(text: string): void {
  let el = document.getElementById('viewToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'viewToast';
    el.className = 'view-toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  const toast = el;
  toast.textContent = text;
  toast.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 3500);
}
