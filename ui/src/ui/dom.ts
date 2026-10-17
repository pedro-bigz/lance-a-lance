// Acesso ao DOM. A marcação fica em index.html; os elementos que a página usa sempre existem, então $ devolve o
// elemento sem null (como o querySelector da versão em página única, que falharia no acesso). Quando o elemento
// pode faltar de propósito (toast criado sob demanda, ponto do gráfico), use $opt e confira.
export function $(selector: string): HTMLElement;
export function $<T extends Element>(selector: string): T;
export function $(selector: string): Element {
  return document.querySelector(selector) as Element;
}
export function $opt(selector: string): HTMLElement | null;
export function $opt<T extends Element>(selector: string): T | null;
export function $opt(selector: string): Element | null {
  return document.querySelector(selector);
}
/** Alvo de um evento como elemento (para closest/dataset). */
export const target = (e: Event): HTMLElement => e.target as HTMLElement;
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
