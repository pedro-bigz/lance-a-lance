// Escape de texto para montar HTML em template strings (aspas simples não são usadas em atributos).
export const esc = (s: unknown): string =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
// texto do tutor: escapa e depois aceita só **negrito** e quebras de linha
export function tutorEsc(t: string): string {
  return esc(t)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\n/g, '<br>');
}
