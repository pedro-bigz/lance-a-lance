/* ---------- Estado da tela como store observável ----------
   O estado continua em objetos TypeScript mutáveis fora do React (S da partida, UI dos menus, STUDY, TUTOR, conta,
   rota…). Quem muda esse estado chama publish() do store certo; os componentes assinam com useSyncExternalStore e
   leem os objetos na renderização. O "snapshot" é só um número de versão, que muda a cada publish.
   Dois stores: game (tela do jogo: partida, painéis, estudo, tutor, histórico em modal) e shell (rota, sidebar,
   conta e login). Assim as telas de formulário e lista não redesenham a cada lance.
   publish() redesenha na hora (flushSync): quem chama pode contar com o DOM novo logo em seguida, como acontecia
   com o renderAll de antes (as animações do tabuleiro e o foco dependem disso). Chamado dentro de outro publish
   (efeito de um componente, por exemplo), só agenda. */
import { flushSync } from 'react-dom';

type Listener = () => void;
let depth = 0;

export interface ViewStore {
  subscribe(fn: Listener): () => void;
  /** versão atual (o snapshot do useSyncExternalStore) */
  get(): number;
  publish(): void;
}
export function createViewStore(beforeNotify?: () => void): ViewStore {
  let v = 0;
  const ls = new Set<Listener>();
  return {
    subscribe(fn) {
      ls.add(fn);
      return () => {
        ls.delete(fn);
      };
    },
    get: () => v,
    publish() {
      v++;
      if (beforeNotify) beforeNotify();
      const notify = () => {
        for (const fn of [...ls]) fn();
      };
      if (depth || !ls.size) {
        notify();
        return;
      }
      depth++;
      try {
        flushSync(notify);
      } finally {
        depth--;
      }
    },
  };
}

/** acertos de estado derivado antes de redesenhar (ex.: estado da prática do estudo); registrados pelos módulos */
const beforeGame: (() => void)[] = [];
export function onBeforeGameRender(fn: () => void): void {
  beforeGame.push(fn);
}
let fullVersion = 0;
const game = createViewStore(() => {
  for (const fn of beforeGame) fn();
});
/** tela do jogo (partida, painéis, estudo, tutor, modal de histórico) */
export const gameView: ViewStore & { full(): number } = { ...game, full: () => fullVersion };
/** redesenha a tela do jogo. kind 'board' = só mudou o tabuleiro ou um detalhe (a lista de lances não rola até o
    lance atual, como no renderBoard de antes); 'all' = tudo (o renderAll de antes) */
export function publish(kind: 'all' | 'board' = 'all'): void {
  if (kind === 'all') fullVersion++;
  game.publish();
}
/** rota, sidebar, conta e login */
export const shellView = createViewStore();
export const publishShell = (): void => shellView.publish();
/** só o texto do estado do Stockfish (muda a cada pedido de análise, sem redesenhar o resto) */
export const statusView = createViewStore();
