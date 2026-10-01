import { useState, type FormEvent } from 'react';
import { authErrorMessage, resetPassword, signInEmail, signInGoogle, signUpEmail } from '../../services/auth';
import { useUi } from '../../state/uiStore';
import { Modal } from './Modal';

type Tab = 'login' | 'signup' | 'reset';

/** Entrar, criar conta ou recuperar a senha. Depois do login abre o modal pendente (ex.: compra). */
export function AuthModal() {
  const modal = useUi((s) => s.modal);
  const open = useUi((s) => s.open);
  const close = useUi((s) => s.close);
  const toast = useUi((s) => s.toast);
  const [tab, setTab] = useState<Tab>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const after = () => {
    if (modal?.then) open(modal.then);
    else close();
  };

  const run = async (fn: () => Promise<void>, onOk: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onOk();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (tab === 'login') {
      void run(
        () => signInEmail(email, password),
        () => {
          toast('Bem-vindo de volta!', 'ok');
          after();
        },
      );
    } else if (tab === 'signup') {
      void run(
        () => signUpEmail(name, email, password),
        () => {
          toast('Conta criada. Enviamos um link de confirmação para o seu e-mail.', 'ok');
          after();
        },
      );
    } else {
      void run(
        () => resetPassword(email),
        () =>
          setInfo('Se houver uma conta com este e-mail, você vai receber um link para criar uma nova senha.'),
      );
    }
  };

  const google = () =>
    void run(signInGoogle, () => {
      toast('Login com Google concluído.', 'ok');
      after();
    });

  const title = tab === 'login' ? 'Entrar' : tab === 'signup' ? 'Criar conta' : 'Recuperar senha';

  return (
    <Modal title={title}>
      {modal?.then && <p className="muted">Entre na sua conta para continuar.</p>}
      {tab !== 'reset' && (
        <>
          <button className="btn google" onClick={google} disabled={busy}>
            <GoogleIcon /> Continuar com Google
          </button>
          <div className="divider">
            <span>ou com e-mail</span>
          </div>
        </>
      )}
      <form className="form" onSubmit={submit}>
        {tab === 'signup' && (
          <label>
            Nome
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              autoComplete="name"
              required
            />
          </label>
        )}
        <label>
          E-mail
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        {tab !== 'reset' && (
          <label>
            Senha
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              minLength={6}
              required
            />
          </label>
        )}
        {error && <p className="form-error">{error}</p>}
        {info && <p className="form-info">{info}</p>}
        {tab === 'signup' && (
          <p className="muted small">
            Ao criar a conta você aceita os{' '}
            <a href="/termos" target="_blank" rel="noopener">
              Termos de Uso
            </a>{' '}
            e a{' '}
            <a href="/privacidade" target="_blank" rel="noopener">
              Política de Privacidade
            </a>
            .
          </p>
        )}
        <button className="btn primary" type="submit" disabled={busy}>
          {busy
            ? 'Aguarde...'
            : tab === 'login'
              ? 'Entrar'
              : tab === 'signup'
                ? 'Criar conta'
                : 'Enviar link'}
        </button>
      </form>
      <div className="auth-links">
        {tab !== 'login' && (
          <button className="link" onClick={() => setTab('login')}>
            Já tenho conta
          </button>
        )}
        {tab !== 'signup' && (
          <button className="link" onClick={() => setTab('signup')}>
            Criar uma conta
          </button>
        )}
        {tab === 'login' && (
          <button className="link" onClick={() => setTab('reset')}>
            Esqueci a senha
          </button>
        )}
      </div>
    </Modal>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.2 5.6c4.2-3.9 7.1-9.6 7.1-17z"
      />
      <path
        fill="#FBBC05"
        d="M10.6 28.3c-.5-1.4-.8-2.8-.8-4.3s.3-2.9.8-4.3l-7.9-6.1C1 16.9 0 20.3 0 24s1 7.1 2.7 10.4l7.9-6.1z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.2-5.6c-2 1.4-4.7 2.3-8.7 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z"
      />
    </svg>
  );
}
