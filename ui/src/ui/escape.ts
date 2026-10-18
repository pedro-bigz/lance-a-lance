// Escape de texto para montar HTML em template strings (efeitos do tabuleiro; aspas simples não são usadas em atributos).
export const esc = (s: unknown): string =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
