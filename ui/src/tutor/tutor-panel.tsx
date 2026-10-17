// Painel do tutor de IA: conversa (com **negrito** e quebras de linha), sugestões, estado, campo de mensagem e o aviso
// de tutor indisponível (desktop). O log rola até o fim quando chega mensagem ou texto novo.
import { Fragment, useLayoutEffect, useRef, type ReactNode } from 'react';
import { REFS, UI } from '../game/ui-state';
import { useGameView } from '../react/hooks';
import { TUTOR, setTutor, tutorChip, tutorRetry, tutorStop, tutorSubmit, type TutorMsg } from './tutor';

const CHIPS: [string, string][] = [
  ['Quero aprender a Abertura Italiana jogando de brancas.', 'Aprender a Italiana'],
  ['Mostre duas partidas de exemplo da Defesa Siciliana com variantes diferentes.', 'Exemplos da Siciliana'],
  ['Quero treinar a me defender contra o Gambito da Dama: o bot joga a abertura.', 'Defender o Gambito da Dama'],
  ['Comente a partida que está no tabuleiro: qual abertura foi e qual o plano daqui em diante?', 'Comentar esta partida'],
];
/** texto do tutor: só **negrito** e quebras de linha; o resto é texto (o React escapa) */
export function richText(t: string): ReactNode[] {
  return t.split('\n').map((line, li) => {
    const parts: ReactNode[] = [];
    const re = /\*\*(.+?)\*\*/g;
    let at = 0,
      m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      if (m.index > at) parts.push(line.slice(at, m.index));
      parts.push(<b key={m.index}>{m[1]}</b>);
      at = m.index + m[0].length;
    }
    if (at < line.length) parts.push(line.slice(at));
    return (
      <Fragment key={li}>
        {li ? <br /> : null}
        {parts}
      </Fragment>
    );
  });
}
function Msg({ m }: { m: TutorMsg }) {
  return (
    <div className={'tmsg ' + m.role + (m.pending ? ' pending' : '') + (m.unavail ? ' unavail' : '')}>
      {m.role === 'note' ? m.text : richText(m.text)}
    </div>
  );
}
export function TutorPanel() {
  useGameView();
  const logRef = useRef<HTMLDivElement>(null);
  const scroll = TUTOR.scroll;
  useLayoutEffect(() => {
    if (logRef.current) logRef.current.scrollTop = 1e9;
  }, [scroll]);
  const down = TUTOR.ready === false;
  return (
    <section className="tutor card" id="tutor" hidden={!UI.tutor} aria-label="Tutor de aberturas">
      <div className="tutor-h">
        <div>
          <h2>Tutor de aberturas</h2>
          <small id="tutorSub">{TUTOR.sub}</small>
        </div>
        <div className="tutor-hb">
          <button className="btn icon" id="tutorClose" aria-label="Fechar" onClick={() => setTutor(false)}>
            ✕
          </button>
        </div>
      </div>
      <form
        className="tutor-key"
        id="tutorKeyForm"
        hidden={!down}
        onSubmit={(e) => {
          e.preventDefault();
          tutorRetry();
        }}
      >
        <label>Tutor indisponível</label>
        <p className="note" id="tutorApiMsg">
          {TUTOR.apiMsg}
        </p>
        <div className="row">
          <button className="btn primary" type="submit">
            Tentar de novo
          </button>
        </div>
      </form>
      <div className="tutor-log" id="tutorLog" aria-live="polite" ref={logRef}>
        {TUTOR.log.map((m) => (
          <Msg key={m.id} m={m} />
        ))}
      </div>
      <div className="tutor-chips" id="tutorChips" hidden={down}>
        {CHIPS.map(([q, label]) => (
          <button key={label} data-q={q} disabled={TUTOR.busy} onClick={() => tutorChip(q)}>
            {label}
          </button>
        ))}
      </div>
      <p className="tutor-status" id="tutorStatus" aria-live="polite">
        {TUTOR.status}
      </p>
      <form
        className="tutor-form"
        id="tutorForm"
        hidden={down}
        onSubmit={(e) => {
          e.preventDefault();
          tutorSubmit();
        }}
      >
        <textarea
          id="tutorIn"
          rows={2}
          placeholder="Ex.: quero aprender a Caro-Kann; o bot joga e eu respondo…"
          aria-label="Mensagem para o tutor"
          disabled={TUTOR.busy}
          ref={(el) => {
            REFS.tutorIn = el;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form!.requestSubmit();
            }
          }}
        ></textarea>
        <button className="btn primary" id="tutorSend" type="submit" hidden={TUTOR.busy}>
          Enviar
        </button>
        <button className="btn" id="tutorStop" type="button" hidden={!TUTOR.busy} onClick={tutorStop}>
          Parar
        </button>
      </form>
    </section>
  );
}
