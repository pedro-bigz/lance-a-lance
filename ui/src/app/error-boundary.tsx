// Barreira de erro de renderização: em vez de a página travar em branco, mostra uma mensagem genérica com a opção de
// recarregar. O detalhe vai só para o console (nunca para a tela).
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  /** desenho do aviso (recebe a ação de recarregar) */
  fallback: (reload: () => void) => ReactNode;
  children: ReactNode;
}
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('Erro ao desenhar a tela', error, info.componentStack);
  }
  override render(): ReactNode {
    return this.state.failed ? this.props.fallback(() => location.reload()) : this.props.children;
  }
}
/** aviso no lugar da tela de entrada */
export const authFallback = (reload: () => void) => (
  <section className="auth" id="authScreen" aria-label="Entrar no Lance a Lance">
    <div className="card auth-card">
      <div className="brand auth-brand">
        <span className="logo" aria-hidden="true">
          ♞
        </span>
        <h1>Lance a Lance</h1>
      </div>
      <div className="auth-form">
        <h2>Algo deu errado</h2>
        <p className="form-msg err" role="alert">
          Não foi possível mostrar a tela de entrada. Recarregue para tentar de novo.
        </p>
        <button className="btn primary auth-submit" type="button" onClick={reload}>
          Recarregar
        </button>
      </div>
    </div>
  </section>
);
/** aviso no lugar da área do app */
export const appFallback = (reload: () => void) => (
  <div className="card" role="alert" style={{ maxWidth: 520, margin: '40px auto' }}>
    <h2>Algo deu errado</h2>
    <p className="note">Não foi possível mostrar esta parte do Lance a Lance. Recarregue para tentar de novo.</p>
    <div className="row">
      <button className="btn primary" type="button" onClick={reload}>
        Recarregar
      </button>
    </div>
  </div>
);
