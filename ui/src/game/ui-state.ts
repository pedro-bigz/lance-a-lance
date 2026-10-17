/* ---------- Estado da interface da tela do jogo ----------
   O que antes ficava no próprio DOM (hidden dos menus, aria-pressed da cor, rótulos temporários dos botões…) agora fica
   aqui; os componentes desenham a partir disto e de S. Quem muda chama publish() (store/view-store.ts).
   REFS guarda os elementos estáveis que o código imperativo usa: o tabuleiro (animações, arrastar, efeitos de
   captura) e campos não controlados (PGN, busca do estudo, mensagem do tutor). */
import type { Color } from 'chess.js';

export type Drawer = 'newGame' | 'pgnBox' | null;
export interface UiState {
  /** dropdown "Nova partida" ou gaveta do PGN */
  drawer: Drawer;
  /** menu ⋮ */
  menu: boolean;
  /** painel de estilo do tabuleiro (rodapé) */
  style: boolean;
  /** o painel de estilo já foi aberto (as opções ficam desenhadas depois disso, como antes) */
  styleOpened: boolean;
  /** modal de histórico de partidas */
  history: boolean;
  /** estudo de aberturas */
  study: boolean;
  /** tutor de IA */
  tutor: boolean;
  /** escolha da promoção aberta */
  promo: { from: string; to: string; color: Color } | null;
  /** "Suas peças" na nova partida */
  color: 'w' | 'b' | 'r';
  /** erro do PGN colado ('' = escondido) */
  pgnErr: string;
  copyLabel: string;
  styleLabel: string;
  /** desistência pede confirmação no segundo clique */
  resignArmed: boolean;
  /** o Stockfish da análise subiu */
  engineReady: boolean;
  /** contador do botão de histórico ('' até a primeira contagem) */
  histCount: string;
  /** botões de exemplos do modal de histórico (só no artifact) */
  mockBtns: boolean;
}
export const UI: UiState = {
  drawer: null,
  menu: false,
  style: false,
  styleOpened: false,
  history: false,
  study: false,
  tutor: false,
  promo: null,
  color: 'w',
  pgnErr: '',
  copyLabel: 'Copiar PGN',
  styleLabel: 'Estilo do tabuleiro e peças',
  resignArmed: false,
  engineReady: false,
  histCount: '',
  mockBtns: true,
};

export interface Refs {
  board: HTMLElement | null;
  squares: HTMLElement | null;
  pgnIn: HTMLTextAreaElement | null;
  studyQ: HTMLInputElement | null;
  tutorIn: HTMLTextAreaElement | null;
}
export const REFS: Refs = { board: null, squares: null, pgnIn: null, studyQ: null, tutorIn: null };

/** foca um elemento pelo id depois de um publish() (o DOM já está atualizado) */
export function focusId(id: string, opts?: FocusOptions): void {
  const el = document.getElementById(id);
  if (el) el.focus(opts);
}
