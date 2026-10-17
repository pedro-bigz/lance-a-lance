// Utilitários de DOM para os atalhos e efeitos fora do React.
/** Alvo de um evento como elemento (para closest/dataset). */
export const target = (e: Event): HTMLElement => e.target as HTMLElement;
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
