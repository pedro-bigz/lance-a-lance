import { describe, expect, it } from 'vitest';
import { Engine } from '../src/engine/engine';

/** worker falso que responde ao handshake UCI do Stockfish */
function fakeWorker(): Worker {
  const w = {
    onmessage: null as ((e: { data: string }) => void) | null,
    onerror: null as unknown,
    terminated: false,
    postMessage(cmd: string) {
      const reply = cmd === 'uci' ? 'uciok' : cmd === 'isready' ? 'readyok' : null;
      if (reply) queueMicrotask(() => w.onmessage && w.onmessage({ data: reply }));
    },
    terminate() {
      w.terminated = true;
    },
  };
  return w as unknown as Worker;
}

describe('Engine.boot', () => {
  it('new Worker() que lança na hora passa para o próximo candidato (sem ReferenceError do timer)', async () => {
    const e = new Engine();
    let tried = 0;
    const throwing = () => {
      tried++;
      throw new Error('Worker bloqueado');
    };
    await expect(e.boot([throwing, fakeWorker])).resolves.toBeUndefined();
    expect(tried).toBe(1);
    expect(e.w).not.toBeNull();
  });
  it('todos os candidatos lançando: rejeita com "Stockfish indisponível"', async () => {
    const e = new Engine();
    const throwing = () => {
      throw new Error('Worker bloqueado');
    };
    await expect(e.boot([throwing, throwing])).rejects.toThrow('Stockfish indisponível');
  });
});
