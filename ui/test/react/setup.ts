// Ambiente dos testes de componente (jsdom): #appRoot para os portais dos modais, matchMedia (sidebar e estudo no
// carregamento), Web Animations, scrollIntoView e scrollTo (o jsdom não tem) e limpeza entre os testes.
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
// animações do tabuleiro: terminam na hora
if (!Element.prototype.animate)
  Element.prototype.animate = function () {
    return { finished: Promise.resolve(), cancel() {}, playState: 'finished' } as unknown as Animation;
  };
if (!document.getAnimations) document.getAnimations = () => [];
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {};
window.scrollTo = () => {}; // o jsdom avisa "Not implemented"

export function appRoot(): HTMLElement {
  let root = document.getElementById('appRoot');
  if (!root) {
    root = document.createElement('div');
    root.id = 'appRoot';
    document.body.appendChild(root);
  }
  return root;
}
appRoot();
afterEach(() => cleanup());
