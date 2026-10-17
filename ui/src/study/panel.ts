/* ---------- Estudo de aberturas (sem IA) ----------
   Painel #study, independente do tutor: funciona offline, no artifact e no desktop, só com o livro embutido e o Stockfish.
   1. Escolher (study/pick.ts)  2. Prática guiada (study/practice.ts)  3. Explorador (study/explorer.ts). */
import { renderBoard } from '../board/render';
import { S } from '../core/state';
import { reducedMotion } from '../board/animations';
import { renderViewNav } from '../desktop/views';
import { setTutor } from '../tutor/tutor';
import { $, target } from '../ui/dom';
import { renderStudyExplorer, studyExpClick } from './explorer';
import { renderStudyPick, studySelect, studyWatch } from './pick';
import { renderStudyPractice, studyAgain, studyContinue, studyEnd, studyHint, studyPractice, studyRetry, studyStart, studySync } from './practice';
import { STUDY } from './state';

const STUDY_NARROW = window.matchMedia('(max-width: 920px)'); // mesma quebra da coluna única: o painel entra no fluxo

export function renderStudy(): void {
  studySync();
  if ($('#study').hidden) return;
  renderStudyPractice();
  renderStudyExplorer();
}
export function setStudy(open: boolean, focusBtn?: boolean): void {
  const el = $('#study'),
    was = !el.hidden;
  if (open && !$('#tutor').hidden) setTutor(false);
  el.hidden = !open;
  $('#openStudy').setAttribute('aria-expanded', String(open));
  if (open) {
    STUDY.expKey = STUDY.pracKey = null;
    renderStudyPick();
    renderStudy();
    if (!was) {
      if (STUDY_NARROW.matches) el.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
      (studyPractice() || !$<HTMLDetailsElement>('#studyPickBox').open ? el : $('#studyQ')).focus({ preventScroll: true });
    }
  } else if (was) {
    STUDY.expTok++; // cancela as avaliações do explorador que ainda não começaram
    if (S.studyMark) {
      S.studyMark = null;
      renderBoard();
    }
    if (focusBtn) $('#openStudy').focus();
  }
  renderViewNav();
}
export function initStudy(): void {
  $('#openStudy').onclick = () => setStudy($('#study').hidden);
  $('#studyClose').onclick = () => setStudy(false, true);
  let studyQTimer: ReturnType<typeof setTimeout> | 0 = 0;
  $('#studyQ').addEventListener('input', (e) => {
    clearTimeout(studyQTimer);
    studyQTimer = setTimeout(() => {
      STUDY.q = (e.target as HTMLInputElement).value;
      renderStudyPick();
    }, 150);
  });
  $('#studyExpBox').addEventListener('toggle', () => renderStudyExplorer(true));
  $('#study').addEventListener('click', (e) => {
    const t = target(e);
    const chip = t.closest<HTMLElement>('[data-q]');
    if (chip) {
      $<HTMLInputElement>('#studyQ').value = STUDY.q = chip.dataset.q as string;
      renderStudyPick();
      return;
    }
    const g = t.closest<HTMLElement>('[data-g]');
    if (g) {
      const grp = STUDY.groups[+(g.dataset.g as string)];
      if (!grp) return;
      if (g.dataset.v != null) {
        const vg = grp.vars[+g.dataset.v];
        if (vg) studySelect(grp.fam, vg.lines, vg.v);
      } else studySelect(grp.fam, grp.lines);
      return;
    }
    const row = t.closest<HTMLElement>('.xp-row');
    if (row) {
      studyExpClick(+(row.dataset.i as string));
      return;
    }
    const b = t.closest<HTMLButtonElement>('[data-act]');
    if (!b || b.disabled) return;
    const act = b.dataset.act;
    if (act === 'unsel') {
      STUDY.sel = null;
      renderStudyPick();
      $('#studyQ').focus();
    } else if (act === 'watch') studyWatch(b);
    else if (act === 'prac-w' || act === 'prac-b') studyStart(act === 'prac-w' ? 'w' : 'b');
    else if (act === 'hint') studyHint();
    else if (act === 'retry') studyRetry();
    else if (act === 'cont') studyContinue();
    else if (act === 'again') studyAgain();
    else if (act === 'end') studyEnd();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented || $('#study').hidden || document.querySelector('.modal:not([hidden])')) return;
    // Esc na busca com texto só limpa a busca
    const t = e.target as HTMLInputElement;
    if (t.id === 'studyQ' && t.value) {
      e.preventDefault();
      t.value = STUDY.q = '';
      renderStudyPick();
      return;
    }
    e.preventDefault();
    setStudy(false, true);
  });
}
