/* Modal e mensagem de formulário das ilhas React, com o mesmo HTML e o mesmo comportamento dos modais da página:
   <div class="modal" id hidden> fica sempre no DOM (só troca o hidden), dentro de #appRoot ao lado dos outros modais
   (createPortal); ao abrir, o foco vai para initialFocus; Esc e clique no fundo fecham; ao fechar, o foco volta para
   returnFocus (se o elemento ainda estiver na página). */
import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

export interface ModalProps {
  id: string;
  open: boolean;
  onClose: () => void;
  initialFocus: RefObject<HTMLElement | null>;
  returnFocus: RefObject<HTMLElement | null>;
  children: ReactNode;
}
export function Modal({ id, open, onClose, initialFocus, returnFocus, children }: ModalProps) {
  const wasOpen = useRef(false);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useLayoutEffect(() => {
    if (open && !wasOpen.current && initialFocus.current) initialFocus.current.focus();
    if (!open && wasOpen.current) {
      const back = returnFocus.current;
      if (back && back.isConnected) back.focus();
    }
    wasOpen.current = open;
  }, [open, initialFocus, returnFocus]);
  // Esc fecha (como os outros modais, no document: vale com o foco em qualquer lugar)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  const root = document.getElementById('appRoot') || document.body;
  return createPortal(
    <div
      className="modal"
      id={id}
      hidden={!open}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {children}
    </div>,
    root,
  );
}

/** texto e tipo da mensagem; null = nunca mostrada (class "form-msg"), {text:''} = escondida */
export type Msg = { text: string; kind?: 'err' | 'ok' | 'info' } | null;
export const msgOf = (text: string | null | undefined, kind: 'err' | 'ok' | 'info' = 'err'): Msg => ({ text: text || '', kind });
export function FormMsg({ id, msg, role }: { id: string; msg: Msg; role: 'status' | 'alert' }) {
  return (
    <p className={msg ? 'form-msg ' + (msg.kind || 'err') : 'form-msg'} id={id} role={role} hidden={!msg || !msg.text}>
      {msg ? msg.text : ''}
    </p>
  );
}
