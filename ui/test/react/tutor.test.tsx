// @vitest-environment jsdom
// Tutor de IA no app desktop com a API do tutor falsa: saudação, conversa com ferramenta, erro genérico e tutor fora
// do ar. Nenhuma IA de verdade é chamada.
import './setup';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ai = vi.hoisted(() => ({
  status: vi.fn(),
  chat: vi.fn(),
}));
vi.mock('../../src/desktop/bridge', () => ({
  LD: {},
  DESKTOP_AUTH: undefined,
  DESKTOP_ADMIN: undefined,
  DESKTOP_AI: ai,
  DESKTOP_STATS: undefined,
  API_GAMES_STORE: undefined,
  API_GAMES: false,
}));
const { TutorPanel, richText } = await import('../../src/tutor/tutor-panel');
const { TUTOR, setTutor } = await import('../../src/tutor/tutor');
const { resetBoard } = await import('../../src/core/game');

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const msgs = () => [...document.querySelectorAll('#tutorLog .tmsg')].map((m) => [m.className, m.textContent]);

beforeEach(() => {
  vi.clearAllMocks();
  ai.status.mockResolvedValue({ reachable: true, ai: { ready: true } });
  resetBoard();
});

describe('Tutor', () => {
  it('abre com a saudação e o campo focado', async () => {
    render(<TutorPanel />);
    act(() => setTutor(true));
    expect($('tutor').hidden).toBe(false);
    expect($('tutorSub').textContent).toBe('com IA · treinos, exemplos e explicações');
    expect(msgs()[0]![0]).toBe('tmsg assistant');
    expect(document.querySelector('#tutorLog .tmsg b')!.textContent).toBe('"quero aprender a Abertura Italiana"');
    await waitFor(() => expect(document.activeElement).toBe($('tutorIn')));
    expect($('tutorKeyForm').hidden).toBe(true);
    expect($('tutorForm').hidden).toBe(false);
  });
  it('conversa: busca no livro pela ferramenta e mostra a resposta (com negrito)', async () => {
    const u = userEvent.setup();
    let release!: () => void;
    ai.chat
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            release = () =>
              r({
                ok: true,
                providerName: 'Gemini',
                message: {
                  role: 'assistant',
                  content: '',
                  tool_calls: [{ id: 't1', type: 'function', function: { name: 'buscar_aberturas', arguments: '{"consulta":"italiana"}' } }],
                },
              });
          }),
      )
      .mockResolvedValueOnce({
        ok: true,
        providerName: 'Gemini',
        message: { role: 'assistant', content: 'Vamos **treinar** a Italiana.\nBoa sorte!' },
      });
    render(<TutorPanel />);
    await u.type($('tutorIn'), 'Quero aprender a Italiana{Enter}');
    expect(($('tutorIn') as HTMLTextAreaElement).value).toBe('');
    await waitFor(() => expect(ai.chat).toHaveBeenCalledTimes(1));
    // enquanto pensa: Parar no lugar de Enviar, campo e sugestões desligados
    expect($('tutorSend').hidden).toBe(true);
    expect($('tutorStop').hidden).toBe(false);
    expect(($('tutorIn') as HTMLTextAreaElement).disabled).toBe(true);
    expect(document.querySelector<HTMLButtonElement>('#tutorChips button')!.disabled).toBe(true);
    expect(msgs().slice(-2)).toEqual([
      ['tmsg user', 'Quero aprender a Italiana'],
      ['tmsg assistant pending', 'Pensando…'],
    ]);
    await act(async () => release());
    await waitFor(() => expect(ai.chat).toHaveBeenCalledTimes(2));
    const second = ai.chat.mock.calls[1]![0] as { messages: { role: string; content: string }[] };
    const tool = second.messages.find((m) => m.role === 'tool')!;
    expect(JSON.parse(tool.content)[0].nome).toMatch(/Italiana/);
    expect(second.messages[0]!.content).toMatch(/Estado atual do app \(JSON\)/);
    await waitFor(() => expect($('tutorSend').hidden).toBe(false));
    const last = document.querySelector('#tutorLog .tmsg:last-child')!;
    expect(last.className).toBe('tmsg assistant');
    expect(last.innerHTML).toBe('Vamos <b>treinar</b> a Italiana.<br>Boa sorte!');
    expect($('tutorSub').textContent).toBe('respondido por Gemini · treinos, exemplos e explicações');
    expect($('tutorStatus').textContent).toBe('');
    expect(TUTOR.turns.at(-1)).toEqual({ role: 'assistant', content: 'Vamos **treinar** a Italiana.\nBoa sorte!' });
  });
  it('erro da API: aviso genérico (sem detalhes de servidor) e o pedido sai do log', async () => {
    ai.chat.mockResolvedValueOnce({ ok: false, status: 503, error: 'connect ECONNREFUSED 127.0.0.1:8787' });
    render(<TutorPanel />);
    const before = msgs().length;
    fireEvent.click(screen.getByText('Comentar esta partida'));
    await waitFor(() => expect(msgs().at(-1)).toEqual(['tmsg note', 'O tutor está indisponível no momento. Tente de novo mais tarde.']));
    expect(msgs().length).toBe(before + 2); // a pergunta e o aviso (o "Pensando…" sumiu)
    expect(document.getElementById('tutorLog')!.textContent).not.toMatch(/ECONNREFUSED|8787/);
  });
  it('tutor fora do ar: formulário de tentar de novo com mensagem genérica', async () => {
    ai.status.mockResolvedValue({ reachable: false, ai: null });
    render(<TutorPanel />);
    act(() => setTutor(false));
    act(() => setTutor(true));
    await waitFor(() => expect($('tutorKeyForm').hidden).toBe(false));
    expect($('tutorApiMsg').textContent).toBe('Não foi possível conectar ao tutor. Confira sua internet e tente de novo.');
    expect($('tutorForm').hidden).toBe(true);
    expect($('tutorChips').hidden).toBe(true);
    ai.status.mockResolvedValue({ reachable: true, ai: { ready: true } });
    fireEvent.click(screen.getByText('Tentar de novo'));
    await waitFor(() => expect($('tutorForm').hidden).toBe(false));
    expect(msgs().at(-1)).toEqual(['tmsg note', 'Tutor conectado.']);
  });
});

describe('texto do tutor', () => {
  it('só **negrito** e quebras de linha; HTML vira texto', () => {
    const { container } = render(<div>{richText('**Italiana**\n<script>x</script> e **mais**')}</div>);
    expect(container.firstElementChild!.innerHTML).toBe('<b>Italiana</b><br>&lt;script&gt;x&lt;/script&gt; e <b>mais</b>');
  });
});
