import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const GATE_PASSWORD = import.meta.env.VITE_GUEST_PASSWORD as string | undefined;
const STORAGE_KEY = 'penny-gate-unlocked';

function readStorage(): boolean {
  try { return sessionStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}
function writeStorage() {
  try {
    sessionStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // With storage blocked the gate still unlocks, and asks again on the next page load.
  }
}

export function GateLock({ children }: { children: ReactNode }) {
  const { isOwner } = useAuth();
  const location = useLocation();

  const [unlocked, setUnlocked] = useState(() => !GATE_PASSWORD || readStorage());
  const [password, setPassword] = useState('');
  const [shaking, setShaking] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  const isLoginPage = location.pathname === '/login';
  const showGate = !unlocked && !isOwner && !!GATE_PASSWORD && !isLoginPage;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (password === GATE_PASSWORD) {
      setUnlocking(true);
      setTimeout(() => {
        writeStorage();
        setUnlocked(true);
      }, 520);
    } else {
      setPassword('');
      setShaking(true);
      setTimeout(() => setShaking(false), 650);
    }
  };

  // Nothing under the gate mounts while it shows, so a locked page starts no query and loads no photo. See ADR 0005.
  if (!showGate) return children;

  return (
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
        <form className="gate-form" onSubmit={handleSubmit} noValidate>
          <div className={`gate-input-wrap${shaking ? ' has-error' : ''}`}>
            <input
              className="gate-input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              autoComplete="current-password"
              aria-invalid={shaking}
              aria-describedby={shaking ? 'gate-error' : undefined}
            />
            {shaking && (
              <p className="gate-error" id="gate-error" role="alert">
                Incorrect password
              </p>
            )}
          </div>
          <button type="submit" className="gate-submit">
            Enter
          </button>
        </form>
        <Link to="/login" className="gate-owner-link">
          Owner login
        </Link>
      </div>
    </div>
  );
}
