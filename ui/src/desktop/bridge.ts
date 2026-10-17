// Ponte com o app desktop (desktop/preload.js). No artifact e no "pnpm dev" não existe: tudo fica undefined e a
// página roda sem login, com o localStorage e o tutor pelo Claude do claude.ai.
import type { LanceDesktop } from '../types/api';

export const LD: LanceDesktop | undefined = typeof window !== 'undefined' ? window.lanceDesktop : undefined;
export const DESKTOP_AUTH = LD && LD.auth;
export const DESKTOP_AI = LD && LD.ai;
export const DESKTOP_ADMIN = LD && LD.admin;
export const DESKTOP_STATS = LD && LD.stats;
export const API_GAMES_STORE = LD && LD.games;
/** No desktop as partidas e a pontuação vêm da API; no artifact, do localStorage. */
export const API_GAMES = !!(LD && LD.games);
