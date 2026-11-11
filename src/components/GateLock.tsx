import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useGateBackdrop } from '../hooks/useGateBackdrop';

type GateError = 'wrong' | 'error' | null;

export function GateLock({ children }: { children: ReactNode }) {
  const { isOwner, isGuest, isLoading, unlockAsGuest } = useAuth();
  const location = useLocation();

  const [password, setPassword] = useState('');
  const [error, setError] = useState<GateError>(null);
  const [shaking, setShaking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  const isLoginPage = location.pathname === '/login';
  // isGuest turns true inside unlockAsGuest, before the submit sees the result, so the overlay
  // stays up through the submit and its unlock animation.
  const showGate = !isOwner && !isLoginPage && (!isGuest || submitting || unlocking);
  const backdrop = useGateBackdrop(!isLoading && showGate);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await unlockAsGuest(password);
    setSubmitting(false);

    if (result === 'guest') {
      setUnlocking(true);
      setTimeout(() => setUnlocking(false), 520);
      return;
    }
    setError(result);
    if (result === 'wrong') {
      setPassword('');
      setShaking(true);
      setTimeout(() => {
        setShaking(false);
        setError(null);
      }, 650);
    }
  };

  // A returning guest sees neither the gate nor the page until the guest check answers, so the gate does not flash.
  if (isLoading && !isLoginPage) return null;

  // Nothing under the gate mounts while it shows, so a locked page starts no query and loads no photo.
  // The backdrop is a 96-pixel copy of one cover, held in the database. See ADR 0005 and ADR 0006.
  if (!showGate) return children;

  return (
    <>
      {backdrop && (
        <div
          className={`gate-backdrop${unlocking ? ' is-unlocking' : ''}`}
          style={{ backgroundImage: `url("${backdrop}")` }}
          aria-hidden="true"
          data-testid="gate-backdrop"
        />
      )}
      <div
        className={`gate-overlay${unlocking ? ' is-unlocking' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Password gate"
      >
        <div className={`gate-card${shaking ? ' is-shaking' : ''}`}>
          <div className="gate-accent-bar" />
          <p className="gate-eyebrow">Private Archive</p>
          <h1 className="gate-heading">Enter to view</h1>
          <p className="gate-sub">
            This collection is private. Enter the access password to continue.
          </p>
          <form className="gate-form" onSubmit={(e) => void handleSubmit(e)} noValidate>
            <div className={`gate-input-wrap${error ? ' has-error' : ''}`}>
              <input
                className="gate-input"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                autoComplete="current-password"
                aria-invalid={error === 'wrong'}
                aria-describedby={error ? 'gate-error' : undefined}
              />
              {error && (
                <p className="gate-error" id="gate-error" role="alert">
                  {error === 'wrong' ? 'Incorrect password' : 'Something went wrong. Try again.'}
                </p>
              )}
            </div>
            <button type="submit" className="gate-submit" disabled={submitting || unlocking}>
              Enter
            </button>
          </form>
          <Link to="/login" className="gate-owner-link">
            Owner login
          </Link>
        </div>
      </div>
    </>
  );
}
