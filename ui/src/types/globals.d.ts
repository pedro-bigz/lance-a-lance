import type { LanceDesktop } from './api';

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
    // TODO(etapa2): tipar o objeto de atalhos se ele virar API de teste de verdade
    LanceALance?: unknown;
    webkitAudioContext?: typeof AudioContext;
  }
}
