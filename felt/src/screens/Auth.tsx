import { useState } from 'react';
import { supabase } from '../supabase';
import { errorMessage } from '../errors';
import { Banner } from '../ui';
import { useSession } from '../session';

type Mode = 'signin' | 'signup' | 'forgot';

function redirectUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}

export function AuthScreen({ invited }: { invited?: boolean }) {
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError('');
    setNotice('');
    if (mode === 'signup' && !name.trim()) return setError('Enter your name so your friends know who you are.');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address.');
    if (mode !== 'forgot' && password.length < 8) return setError('Passwords must be at least 8 characters.');
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: name.trim() }, emailRedirectTo: redirectUrl() },
        });
        if (error) throw error;
        if (!data.session) setNotice('Account created. Check your email for a confirmation link, then come back and sign in.');
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirectUrl() });
        if (error) throw error;
        setNotice('If that email has an account, a reset link is on its way. Open it on this device.');
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="stack-sm">
        <div className="hero-mark">
          <span className="suit">♠</span>Felt
        </div>
        <p className="muted">Results, rankings and who-owes-whom for your home poker games.</p>
      </div>

      {invited && (
        <Banner tone="ok">You've been invited to a poker group. Create an account (or sign in) to accept. Everyone has their own login.</Banner>
      )}

      <form className="card stack" onSubmit={submit} noValidate>
        {mode !== 'forgot' && (
          <div className="segmented" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'signin'} className={mode === 'signin' ? 'on' : ''} onClick={() => setMode('signin')}>
              Sign in
            </button>
            <button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'on' : ''} onClick={() => setMode('signup')}>
              Create account
            </button>
          </div>
        )}
        {mode === 'forgot' && <h2>Reset your password</h2>}

        {mode === 'signup' && (
          <div className="field">
            <label htmlFor="name">Your name</label>
            <input id="name" className="input" autoComplete="name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        )}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" className="input" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {mode !== 'forgot' && (
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === 'signup' && <span className="hint">At least 8 characters.</span>}
          </div>
        )}

        {error && <Banner tone="error">{error}</Banner>}
        {notice && <Banner tone="ok">{notice}</Banner>}

        <button className="btn primary block" type="submit" disabled={busy}>
          {busy ? <span className="spinner" aria-label="Working" /> : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
        </button>
        {mode === 'signin' && (
          <button type="button" className="btn ghost" onClick={() => setMode('forgot')}>
            Forgot password?
          </button>
        )}
        {mode === 'forgot' && (
          <button type="button" className="btn ghost" onClick={() => setMode('signin')}>
            Back to sign in
          </button>
        )}
      </form>
      <p className="faint small center">Felt only records results. It never moves real money.</p>
    </div>
  );
}

export function NewPasswordScreen() {
  const { endRecovery } = useSession();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="auth-wrap">
      <div className="hero-mark">
        <span className="suit">♠</span>Felt
      </div>
      <form
        className="card stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (password.length < 8) return setError('Passwords must be at least 8 characters.');
          setBusy(true);
          const { error } = await supabase.auth.updateUser({ password });
          setBusy(false);
          if (error) setError(errorMessage(error));
          else endRecovery();
        }}
      >
        <h2>Choose a new password</h2>
        <div className="field">
          <label htmlFor="newpw">New password</label>
          <input id="newpw" className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <Banner tone="error">{error}</Banner>}
        <button className="btn primary block" disabled={busy}>
          {busy ? <span className="spinner" /> : 'Save password'}
        </button>
      </form>
    </div>
  );
}
