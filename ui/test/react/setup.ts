// Ambiente dos testes de componente (jsdom): #appRoot para os portais dos modais, os elementos de fora das ilhas, matchMedia (usado pela sidebar no
// carregamento) e limpeza entre os testes.
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

if (!window.matchMedia)
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;

export function appRoot(): HTMLElement {
  let root = document.getElementById('appRoot');
  if (!root) {
    root = document.createElement('div');
    root.id = 'appRoot';
    document.body.appendChild(root);
    // partes da página fora das ilhas que elas atualizam: contador do histórico do tabuleiro (renderHistCount),
    // rating do topo (renderRating) e a conta na sidebar (renderAccount, depois de salvar o perfil)
    const rest = document.createElement('div');
    rest.innerHTML =
      '<span id="histCount"></span><b id="ratingVal"></b><nav id="sideNav"></nav>' +
      '<div id="userWrap" hidden><button id="openUser"><span id="userInitials"></span><b id="sideUserName"></b><small id="sideUserRole"></small></button>' +
      '<span id="userInitialsBig"></span><b id="userName"></b><small id="userEmail"></small><a id="openAdmin" hidden></a></div>';
    document.body.appendChild(rest);
  }
  return root;
}
appRoot();
afterEach(() => cleanup());
