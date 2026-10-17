// @vitest-environment jsdom
import { appRoot } from './setup';
import { describe, expect, it } from 'vitest';
import { mountIslands } from '../../src/desktop/islands';

describe('ilhas', () => {
  it('montam dentro das sections e põem os modais em #appRoot na ordem de antes', () => {
    const root = appRoot();
    root.insertAdjacentHTML(
      'beforeend',
      ['inicio', 'historico', 'admin', 'estatisticas'].map((v) => `<section class="view" data-view="${v}" hidden></section>`).join('') +
        '<div class="modal" id="historyModal" hidden></div>',
    );
    mountIslands();
    mountIslands(); // uma vez só
    expect([...root.querySelectorAll(':scope > .modal')].map((m) => m.id)).toEqual([
      'historyModal',
      'profileModal',
      'adminUserModal',
      'adminConfirmModal',
      'gameConfirmModal',
    ]);
    expect(root.querySelector('section[data-view=inicio] #homeHello')!.textContent).toBe('Olá');
    expect(root.querySelector('section[data-view=historico] #hpList')).toBeTruthy();
    expect(root.querySelector('section[data-view=admin] #adminRows')).toBeTruthy();
    expect(root.querySelector('section[data-view=estatisticas] #ratingChart')).toBeTruthy();
  });
});
