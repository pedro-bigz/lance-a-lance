// Hooks pequenos dos componentes: versão da tela do jogo e do shell (store/view-store.ts), versão de um tópico de
// dados, valor de um store e pedidos assíncronos que ignoram respostas velhas (o "token" que as telas usavam antes).
import { useCallback, useRef, useSyncExternalStore } from 'react';
import { subscribe, version, type Store } from '../store/data-events';
import { gameView, shellView } from '../store/view-store';

/** assina a tela do jogo: o componente redesenha a cada publish() e lê S, UI, STUDY… na renderização */
export const useGameView = (): number => useSyncExternalStore(gameView.subscribe, gameView.get);
/** assina o shell (rota, sidebar, conta, login) */
export const useShellView = (): number => useSyncExternalStore(shellView.subscribe, shellView.get);

/** versão do tópico (muda a cada emit); 0 = nunca emitido */
export function useDataVersion(topic: string): number {
  const sub = useCallback((fn: () => void) => subscribe(topic, fn), [topic]);
  return useSyncExternalStore(sub, () => version(topic));
}
/** versão que muda quando a tela é aberta ou quando os dados dela mudaram (tópico 'tela:<view>') */
export const useViewRefresh = (view: string): number => useDataVersion('tela:' + view);

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get);
}

/** begin() abre um pedido e devolve isCurrent(): falso se outro pedido começou depois (resposta velha é descartada) */
export function useLatest(): () => () => boolean {
  const seq = useRef(0);
  return useCallback(() => {
    const t = ++seq.current;
    return () => t === seq.current;
  }, []);
}
