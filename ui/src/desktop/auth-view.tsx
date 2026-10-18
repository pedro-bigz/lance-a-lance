// Tela de entrada do app desktop: "Entrar" e "Criar conta". Campos não controlados (o valor não vira atributo e a
// senha não passa pelo estado); mensagens, campo inválido e botão ocupado vêm de AUTH (desktop/account.ts).
// No artifact a section existe, escondida, como antes.
import { FormMsg } from '../react/modal';
import { useShellView } from '../react/hooks';
import { AUTH, submitLogin, submitRegister, switchAuth, type AuthField } from './account';

const inv = (id: AuthField) => (AUTH.invalid.includes(id) ? true : undefined);

export function AuthScreen() {
  useShellView();
  const login = AUTH.view === 'login';
  return (
    <section className="auth" id="authScreen" hidden={!AUTH.visible} aria-label="Entrar no Lance a Lance">
      <div className="card auth-card">
        <div className="brand auth-brand">
          <span className="logo" aria-hidden="true">
            ♞
          </span>
          <h1>Lance a Lance</h1>
        </div>
        <form
          className="auth-form"
          id="loginForm"
          noValidate
          hidden={!login}
          onSubmit={(e) => {
            e.preventDefault();
            submitLogin();
          }}
        >
          <h2>Entrar</h2>
          <p className="auth-sub">Use seu e-mail e senha para jogar e conversar com o tutor.</p>
          <FormMsg id="loginMsg" msg={AUTH.loginMsg} role="alert" />
          <label className="auth-field">
            <span>E-mail</span>
            <input id="loginEmail" type="email" autoComplete="username" inputMode="email" maxLength={255} required aria-invalid={inv('loginEmail')} />
          </label>
          <label className="auth-field">
            <span>Senha</span>
            <input id="loginPass" type="password" autoComplete="current-password" maxLength={200} required aria-invalid={inv('loginPass')} />
          </label>
          <button
            className="btn primary auth-submit"
            type="submit"
            id="loginBtn"
            disabled={AUTH.busy === 'login'}
            aria-busy={AUTH.busy === 'login' || undefined}
          >
            {AUTH.busy === 'login' ? 'Entrando…' : 'Entrar'}
          </button>
          <p className="auth-switch">
            Ainda não tem conta?{' '}
            <button type="button" className="link-btn" id="toRegister" onClick={() => switchAuth('register')}>
              Criar conta
            </button>
          </p>
        </form>
        <form
          className="auth-form"
          id="registerForm"
          hidden={login}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submitRegister();
          }}
        >
          <h2>Criar conta</h2>
          <p className="auth-sub">Leva um minuto. Depois é só entrar com o e-mail e a senha.</p>
          <FormMsg id="registerMsg" msg={AUTH.registerMsg} role="alert" />
          <div className="form-grid">
            <label className="auth-field">
              <span>Nome</span>
              <input id="regFirst" autoComplete="given-name" maxLength={100} required aria-invalid={inv('regFirst')} />
            </label>
            <label className="auth-field">
              <span>Sobrenome</span>
              <input id="regLast" autoComplete="family-name" maxLength={100} required aria-invalid={inv('regLast')} />
            </label>
            <label className="auth-field wide">
              <span>E-mail</span>
              <input id="regEmail" type="email" autoComplete="email" inputMode="email" maxLength={255} required aria-invalid={inv('regEmail')} />
            </label>
            <label className="auth-field">
              <span>Senha</span>
              <input id="regPass" type="password" autoComplete="new-password" minLength={8} maxLength={200} required aria-invalid={inv('regPass')} />
              <small>Mínimo de 8 caracteres</small>
            </label>
            <label className="auth-field">
              <span>Confirmar senha</span>
              <input
                id="regPass2"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={200}
                required
                aria-invalid={inv('regPass2')}
              />
            </label>
          </div>
          <button
            className="btn primary auth-submit"
            type="submit"
            id="registerBtn"
            disabled={AUTH.busy === 'register'}
            aria-busy={AUTH.busy === 'register' || undefined}
          >
            {AUTH.busy === 'register' ? 'Criando conta…' : 'Criar conta'}
          </button>
          <p className="auth-switch">
            Já tem conta?{' '}
            <button type="button" className="link-btn" id="toLogin" onClick={() => switchAuth('login')}>
              Entrar
            </button>
          </p>
        </form>
      </div>
    </section>
  );
}
