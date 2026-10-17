import type { LanceDesktop } from './api';
import type { RatingRecord } from '../core/rating';
import type { GameStoreApi, ListResult } from '../store/game-store';
import type { GameRecord } from '../store/types';

/** Atalhos de teste no console (game/mocks.ts): LanceALance.mocks.load(), await LanceALance.games(), LanceALance.store() */
export interface LanceALanceDebug {
  rating: { get(): RatingRecord; reset(): void };
  mocks: { load(): GameRecord[]; clear(): void; list: readonly object[] };
  games(): Promise<ListResult>;
  store(): GameStoreApi | null;
  save(): boolean;
  open(id: string): Promise<void>;
}

/** Mensagem para o Claude do artifact (capacidade "sample" do claude.ai). */
export interface SampleMessage {
  role: 'user' | 'assistant';
  content: string;
}
export interface SampleTool {
  name: string;
  description: string;
  inputSchema?: object;
  execute(input: Record<string, unknown>, ctx: { signal: AbortSignal }): unknown;
}
export type ClaudeSample = (
  messages: SampleMessage[],
  options: {
    cache?: boolean;
    signal?: AbortSignal;
    tools?: SampleTool[];
    modelTier?: string;
    onText?: (chunk: { text: string }) => void;
  },
) => Promise<{ text: string }>;

/** Runtime do artifact no claude.ai (ausente no app desktop e no "pnpm dev"). */
export interface ClaudeRuntime {
  use?: (capability: 'sample') => Promise<ClaudeSample | null>;
}

declare global {
  interface Window {
    /** Ponte do app desktop (desktop/preload.js); ausente no artifact. */
    lanceDesktop?: LanceDesktop;
    claude?: ClaudeRuntime;
    /** Atalhos para testes no console (veja game/mocks.ts). */
    LanceALance?: LanceALanceDebug;
    webkitAudioContext?: typeof AudioContext;
  }
}
