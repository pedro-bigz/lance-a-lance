/* ---------- Estudo de aberturas (sem IA) ----------
   Painel #study (StudyPanel em study-panel.tsx), independente do tutor: funciona offline, no artifact e no desktop,
   só com o livro embutido e o Stockfish.
   1. Escolher (study/pick.ts)  2. Prática guiada (study/practice.ts)  3. Explorador (study/explorer.ts).
   Aqui ficam abrir/fechar (com o foco), a busca e o Esc do document. */
import { S } from '../core/state';
import { reducedMotion } from '../board/animations';
import { REFS, UI, focusId } from '../game/ui-state';
import { onBeforeGameRender, publish, publishShell } from '../store/view-store';
import { setTutor } from '../tutor/tutor';
import { studyBeforeRender, studyPractice } from './practice';
import { STUDY } from './state';

const STUDY_NARROW = window.matchMedia('(max-width: 920px)'); // mesma quebra da coluna única: o painel entra no fluxo

export function setStudy(open: boolean, focusBtn?: boolean): void {
  const was = UI.study;
  if (open && UI.tutor) setTutor(false);
  UI.study = open;
  if (!open && was) {
    STUDY.expTok++; // cancela as avaliações do explorador que ainda não começaram
    S.studyMark = null;
  }
  publish('board');
  publishShell(); // o item ativo da sidebar
  if (open && !was) {
    const el = document.getElementById('study');
    if (el && STUDY_NARROW.matches) el.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
    if (studyPractice() || !STUDY.pickOpen) focusId('study', { preventScroll: true });
    else if (REFS.studyQ) REFS.studyQ.focus({ preventScroll: true });
  } else if (!open && was && focusBtn) focusId('openStudy');
}
export const toggleStudy = (): void => setStudy(!UI.study);
let studyQTimer: ReturnType<typeof setTimeout> | 0 = 0;
/** digitação na busca (com espera curta) */
export function studyQInput(value: string): void {
  clearTimeout(studyQTimer);
  studyQTimer = setTimeout(() => {
    STUDY.q = value;
    publish('board');
  }, 150);
}
export function initStudy(): void {
  onBeforeGameRender(studyBeforeRender);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented || !UI.study || document.querySelector('.modal:not([hidden])')) return;
    // Esc na busca com texto só limpa a busca
    const t = e.target as HTMLInputElement;
    if (t.id === 'studyQ' && t.value) {
      e.preventDefault();
      t.value = STUDY.q = '';
      publish('board');
      return;
    }
    e.preventDefault();
    setStudy(false, true);
  });
}
