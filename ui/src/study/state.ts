// Estado do estudo de aberturas sem IA (painel #study): abertura escolhida, prática em andamento, avaliações e explorador
import type { BookLine } from '../book/index';
import type { NextMove } from '../book/tree';
import type { Trainer } from '../core/state';

/** Avaliação do estudo: w = centipeões do ponto de vista das brancas, m = mate em N (com sinal) ou null. */
export interface StudyEval {
  w: number;
  m: number | null;
  best: string | null;
  err?: boolean;
}
/** Abertura escolhida no painel. */
export interface StudySel {
  title: string;
  lines: BookLine[];
  main: BookLine;
  names: number;
}
export interface StudyGroup {
  fam: string;
  lines: BookLine[];
  vars: { v: string; lines: BookLine[] }[];
}
export type PracticeState = 'on' | 'dev' | 'done' | 'free';
export type PracticeLast = { kind: 'hit'; i: number; san: string; name: string | null } | { kind: 'hint'; i: number; sq: string };
/** Desvio da teoria no último lance do usuário. */
export interface Deviation {
  i: number;
  san: string;
  before: string;
  after: string;
  book: NextMove[];
  other: string | null;
}
/** Prática guiada em andamento. */
export interface Practice {
  trainer: Trainer;
  sel: StudySel;
  name: string;
  color: 'w' | 'b';
  hits: number;
  devs: number;
  hints: number;
  state: PracticeState;
  last: PracticeLast | null;
  dev: Deviation | null;
  /** índices das linhas em BOOK_LINES (para guardar a escolha no localStorage) */
  lineIdx: (number | undefined)[];
}
export interface StudyState {
  q: string;
  groups: StudyGroup[];
  sel: StudySel | null;
  practice: Practice | null;
  evals: Map<string, StudyEval>;
  pending: Map<string, Promise<StudyEval | null>>;
  expKey: string | null;
  expTok: number;
  pracKey: string | null;
  /** a prática recolheu a escolha e o explorador (reabrem quando ela acaba) */
  autoClosed?: boolean;
  expMoves?: NextMove[];
}
export const STUDY: StudyState = {
  q: '',
  groups: [],
  sel: null,
  practice: null,
  evals: new Map(),
  pending: new Map(),
  expKey: null,
  expTok: 0,
  pracKey: null,
};
