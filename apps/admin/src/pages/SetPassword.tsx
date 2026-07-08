import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

/**
 * Landing page for the invitation email link (§7.6). Supabase puts the invite
 * tokens in the URL and the client establishes a session automatically; here the
 * invited staff member sets their password, then continues to the app.
 */
export function SetPassword() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // Give supabase a moment to parse the invite tokens from the URL into a session.
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    if (!loading) setChecked(true);
  }, [loading]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError('Could not set your password. Please open the invite link again.');
      setBusy(false);
      return;
    }
    setDone(true);
    setTimeout(() => navigate('/', { replace: true }), 1200);
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={onSubmit}>
        <img className="login-logo" src="/logo-horizontal.webp" alt="Vertex Digital Marketing" />
        <h1 style={{ fontSize: 18, margin: 0 }}>Set your password</h1>

        {checked && !session ? (
          <div className="state error" style={{ padding: 0 }} role="alert">
            This invite link is invalid or has expired. Ask an administrator to resend the invitation.
          </div>
        ) : done ? (
          <div className="state" style={{ padding: 0 }}>Password set. Taking you in…</div>
        ) : (
          <>
            <div className="field">
              <label htmlFor="pw">New password</label>
              <input
                id="pw"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="pw2">Confirm password</label>
              <input
                id="pw2"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
            {error ? (
              <div className="state error" style={{ padding: 0 }} role="alert">
                {error}
              </div>
            ) : null}
            <button className="btn btn-primary" type="submit" disabled={busy || (checked && !session)}>
              {busy ? 'Saving…' : 'Set password'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
