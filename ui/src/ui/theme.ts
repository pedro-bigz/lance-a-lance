/* ---------- Tema (claro, escuro ou seguir o sistema) e preferências salvas ----------
   O tema salvo já é aplicado antes de desenhar a página (script inline em index.html); aqui fica o seletor do menu
   da conta (app desktop) e a gravação das preferências junto com o estilo do tabuleiro. */
import { STYLE } from '../board/pieces';
import { PREFS, readPrefs } from '../store/local';
import { $, target } from './dom';

export type ThemeChoice = 'light' | 'dark' | 'system';
/** preferências lidas ao abrir a página (estilo e tema) */
export const prefs = readPrefs();
let UI_THEME: ThemeChoice = 'system'; // claro, escuro ou seguir o sistema (menu da conta, no app desktop)
export function writePrefs(): void {
  try {
    localStorage.setItem(PREFS, JSON.stringify({ board: STYLE.board, pieces: STYLE.pieces, capture: STYLE.capture, theme: UI_THEME }));
  } catch (_) {}
}
function applyTheme(): void {
  const root = document.documentElement;
  if (UI_THEME === 'system') delete root.dataset.theme;
  else root.dataset.theme = UI_THEME;
  for (const b of $('#themeSeg').children) b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.v === UI_THEME));
}
export function initTheme(): void {
  UI_THEME = prefs.theme === 'light' || prefs.theme === 'dark' ? prefs.theme : 'system';
  $('#themeSeg').onclick = (e) => {
    const b = target(e).closest<HTMLElement>('button[data-v]');
    if (!b) return;
    UI_THEME = b.dataset.v as ThemeChoice;
    applyTheme();
    writePrefs();
  };
  applyTheme();
}
