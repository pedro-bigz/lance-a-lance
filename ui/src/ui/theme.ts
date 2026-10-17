/* ---------- Tema (claro, escuro ou seguir o sistema) e preferências salvas ----------
   O tema salvo já é aplicado antes de desenhar a página (script inline em index.html); aqui fica a escolha do menu
   da conta (app desktop, desenhada na sidebar) e a gravação das preferências junto com o estilo do tabuleiro. */
import { STYLE } from '../board/pieces';
import { PREFS, readPrefs } from '../store/local';
import { publishShell } from '../store/view-store';

export type ThemeChoice = 'light' | 'dark' | 'system';
/** preferências lidas ao abrir a página (estilo e tema) */
export const prefs = readPrefs();
/** claro, escuro ou seguir o sistema (menu da conta, no app desktop) */
export const THEME: { choice: ThemeChoice } = { choice: 'system' };
export function writePrefs(): void {
  try {
    localStorage.setItem(PREFS, JSON.stringify({ board: STYLE.board, pieces: STYLE.pieces, capture: STYLE.capture, theme: THEME.choice }));
  } catch (_) {}
}
function applyTheme(): void {
  const root = document.documentElement;
  if (THEME.choice === 'system') delete root.dataset.theme;
  else root.dataset.theme = THEME.choice;
  publishShell();
}
export function setTheme(v: ThemeChoice): void {
  THEME.choice = v;
  applyTheme();
  writePrefs();
}
export function initTheme(): void {
  THEME.choice = prefs.theme === 'light' || prefs.theme === 'dark' ? prefs.theme : 'system';
  applyTheme();
}
