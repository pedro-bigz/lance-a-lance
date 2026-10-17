/* ---------- Chaves e leitura do localStorage ----------
   Toda chave do app começa com "lance-a-lance:" e as versões ficam no nome (v1). Não mude os nomes: o app desktop e o
   artifact já têm dados gravados com eles. Leituras e gravações nunca lançam (modo privado, cota cheia). */
import type { GameRecord } from './types';

export const GAMES = 'lance-a-lance:partidas:v1';
export const PREFS = 'lance-a-lance:prefs:v1';
export const RATING_KEY = 'lance-a-lance:rating:v1';
export const SIDEBAR_KEY = 'lance-a-lance:sidebar:v1';
export const AUTH_NOTE = 'lance-a-lance:aviso-login';

export const newId = (): string => 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
// TODO(etapa2): o JSON do localStorage entra como GameRecord[] sem validação de campo a campo (como na página única)
export function readGames(): GameRecord[] {
  try {
    const a = JSON.parse(localStorage.getItem(GAMES) || '[]');
    return Array.isArray(a) ? a : [];
  } catch (_) {
    return [];
  }
}
export function writeGames(list: GameRecord[]): boolean {
  try {
    localStorage.setItem(GAMES, JSON.stringify(list.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 200)));
    return true;
  } catch (_) {
    return false;
  }
}
export interface Prefs {
  board?: string;
  pieces?: string;
  capture?: string;
  theme?: string;
}
export function readPrefs(): Prefs {
  try {
    return JSON.parse(localStorage.getItem(PREFS) || '{}') || {};
  } catch (_) {
    return {};
  }
}
// TODO(etapa2): lsGet confia no tipo pedido; quem lê dados de formato variável (fila, slot do estudo) confere os campos
export const lsGet = <T>(k: string, d: T): T => {
  try {
    const v = JSON.parse(localStorage.getItem(k) || 'null');
    return v == null ? d : v;
  } catch (_) {
    return d;
  }
};
export const lsSet = (k: string, v: unknown): boolean => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    return true;
  } catch (_) {
    return false;
  }
};
