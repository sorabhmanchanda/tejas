import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { LOGIN_ID_HINT, normalizeLoginIdInput, setLoginId } from '../lib/session.js';

/** First screen: login ID only. Existing users skip straight to the dashboard after Continue. */
export default function Login({ onLoggedIn, appVersion }) {
  const [loginId, setLoginIdField] = useState('');
  const [knownUsers, setKnownUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.listUsers().then((d) => setKnownUsers(d.users || [])).catch(() => {});
  }, []);

  async function submit(e, pickId) {
    e?.preventDefault();
    const id = normalizeLoginIdInput(pickId ?? loginId);
    if (!id) {
      setError(`Enter a valid login ID. ${LOGIN_ID_HINT}`);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const session = await api.startSession(id);
      setLoginId(id);
      onLoggedIn(session);
    } catch (err) {
      setError(err.message || 'Could not continue');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-line bg-card/80 p-8 shadow-glow">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl border border-saffron/30 bg-saffron/10 text-saffron shadow-glow">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2c1.5 3 4 4.5 4 8a4 4 0 1 1-8 0c0-1.2.4-2.2 1-3-.2 2 1 3 1.5 3 .8 0 1-1 .5-2 .8.6 1.5 1.6 1.5 3a2.5 2.5 0 1 1-5 0c0-3.5 3-5 4.5-9z" />
            </svg>
          </div>
          <h1 className="font-head text-3xl font-extrabold tracking-tight text-zinc-50">TEJAS</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Enter your <strong className="font-medium text-zinc-200">login ID</strong> — no password.
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Already set up? You&apos;ll go straight to your dashboard.
            <br />
            New ID? Fleet setup comes next.
          </p>
          {appVersion && (
            <p className="mt-2 font-mono text-[10px] text-zinc-600">build {appVersion}</p>
          )}
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="loginId" className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
              Login ID
            </label>
            <input
              id="loginId"
              type="text"
              autoComplete="username"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="e.g. sorabh"
              value={loginId}
              onChange={(e) => setLoginIdField(e.target.value)}
              className="w-full rounded-xl border border-line bg-base px-4 py-3 text-zinc-100 placeholder:text-zinc-600 focus:border-saffron/50 focus:outline-none focus:ring-1 focus:ring-saffron/30"
              autoFocus
            />
            <p className="mt-1 text-[11px] text-zinc-600">{LOGIN_ID_HINT} · no password</p>
          </div>

          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full py-3"
          >
            {loading ? 'Checking…' : 'Continue →'}
          </button>
        </form>

        {knownUsers.length > 0 && (
          <div className="mt-6 border-t border-line pt-5">
            <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Recent on this device</p>
            <div className="flex flex-wrap gap-2">
              {knownUsers.map((u) => (
                <button
                  key={u.login_id}
                  type="button"
                  onClick={(e) => submit(e, u.login_id)}
                  className="pill border-line bg-base/80 text-zinc-300 hover:border-saffron/40 hover:text-saffron"
                >
                  {u.login_id}
                  {u.has_profile ? '' : ' · setup needed'}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
