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
/* Checagem de forma do que vem do localStorage (o JSON pode ter sido gravado por outra versão ou editado à mão).
   É uma conferência simples dos campos que a página usa para decidir algo, sem biblioteca. */
export type Check<T> = (v: unknown) => v is T;
export const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const isStr = (v: unknown): v is string => typeof v === 'string';
export const arrayOf =
  <T>(item: Check<T>): Check<T[]> =>
  (v: unknown): v is T[] =>
    Array.isArray(v) && v.every(item);
/** partida do histórico local: id, data, situação e lances (UCI) no formato esperado */
export function isGameRecord(v: unknown): v is GameRecord {
  if (!isObj(v)) return false;
  return (
    isStr(v.id) &&
    typeof v.updatedAt === 'number' &&
    (v.status === 'andamento' || v.status === 'concluida') &&
    (v.mode === 'play' || v.mode === 'review') &&
    (v.moves == null || arrayOf(isStr)(v.moves)) &&
    (v.start == null || isStr(v.start))
  );
}
/** partidas do artifact; itens fora do formato ficam de fora (o resto da lista continua valendo) */
export function readGames(): GameRecord[] {
  try {
    const a: unknown = JSON.parse(localStorage.getItem(GAMES) || '[]');
    return Array.isArray(a) ? a.filter(isGameRecord) : [];
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
/** lê um JSON do localStorage; com check, um valor fora do formato vira o padrão d */
export const lsGet = <T>(k: string, d: T, check?: Check<T>): T => {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(k) || 'null');
    if (v == null) return d;
    return !check || check(v) ? (v as T) : d;
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
