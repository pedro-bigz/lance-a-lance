/* ---------- "Dados mudaram": tópicos com contador de versão ----------
   Um EventTarget mínimo, sem biblioteca de estado. Quem muda dados chama emit(tópico); quem mostra os dados assina com
   subscribe (ou, nas ilhas React, com useDataVersion, que lê version() pelo useSyncExternalStore).
   Tópicos usados hoje (veja desktop/views.ts):
     'tela:<view>'   a tela <view> foi aberta (onShow) ou uma gravação mudou o que ela mostra (viewDataChanged):
                     a ilha da tela recarrega os dados. A versão 0 quer dizer "ainda não foi aberta".
   createStore guarda um valor simples (ex.: modal de perfil aberto ou não) com a mesma inscrição. */

const bus = new EventTarget();
const versions = new Map<string, number>();

export const version = (topic: string): number => versions.get(topic) || 0;
export function emit(topic: string): void {
  versions.set(topic, version(topic) + 1);
  bus.dispatchEvent(new Event(topic));
}
export function subscribe(topic: string, fn: () => void): () => void {
  bus.addEventListener(topic, fn);
  return () => bus.removeEventListener(topic, fn);
}

export interface Store<T> {
  get(): T;
  set(v: T): void;
  subscribe(fn: () => void): () => void;
}
export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const target = new EventTarget();
  return {
    get: () => value,
    set(v) {
      if (Object.is(v, value)) return;
      value = v;
      target.dispatchEvent(new Event('change'));
    },
    subscribe(fn) {
      target.addEventListener('change', fn);
      return () => target.removeEventListener('change', fn);
    },
  };
}
