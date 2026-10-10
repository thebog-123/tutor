import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { formatPence, parsePounds, penceToInput } from './lib/money';
import { errorMessage } from './errors';

export function Money({ pence, sign, className = '' }: { pence: number; sign?: boolean; className?: string }) {
  const tone = sign ? (pence > 0 ? 'pos' : pence < 0 ? 'neg' : 'muted') : '';
  return <span className={`num ${tone} ${className}`}>{formatPence(pence, { sign })}</span>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="row" role="status">
      <span className="spinner" aria-hidden />
      {label && <span className="muted">{label}</span>}
    </span>
  );
}

export function PageLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="page-loading" role="status">
      <span className="spinner" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export function Skeleton({ height = 72, count = 3 }: { height?: number; count?: number }) {
  return (
    <div className="stack" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton" style={{ height }} />
      ))}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty card">
      <div className="suits" aria-hidden>
        ♠<span className="r">♥</span>♣<span className="r">♦</span>
      </div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Banner({ tone = 'info', children }: { tone?: 'info' | 'error' | 'warn' | 'ok'; children: ReactNode }) {
  return (
    <div className={`banner ${tone}`} role={tone === 'error' ? 'alert' : undefined}>
      <div>{children}</div>
    </div>
  );
}

export function ErrorBanner({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <Banner tone="error">
      <div className="stack-sm">
        <span>{errorMessage(error)}</span>
        {onRetry && (
          <button className="btn small" onClick={onRetry} style={{ alignSelf: 'flex-start' }}>
            Try again
          </button>
        )}
      </div>
    </Banner>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      {action}
    </div>
  );
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

export function Avatar({ name }: { name: string }) {
  return (
    <span className="avatar" aria-hidden>
      {initials(name)}
    </span>
  );
}

/** Text input for pounds and pence. Reports integer pennies (or null when empty/invalid). */
export function MoneyInput({
  value,
  onChange,
  label,
  id,
  invalid,
  placeholder = '0.00',
  autoFocus,
}: {
  value: number | null;
  onChange: (pence: number | null) => void;
  label: string;
  id: string;
  invalid?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(value === null ? '' : penceToInput(value));
  const [bad, setBad] = useState(false);
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      if (parsePounds(text) !== value) setText(value === null ? '' : penceToInput(value));
    }
  }, [value, text]);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="money-input">
        <span className="prefix">£</span>
        <input
          id={id}
          className={`input ${bad || invalid ? 'invalid' : ''}`}
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="next"
          placeholder={placeholder}
          value={text}
          autoFocus={autoFocus}
          onChange={(e) => {
            const t = e.target.value;
            setText(t);
            const p = parsePounds(t);
            setBad(t.trim() !== '' && p === null);
            last.current = p;
            onChange(p);
          }}
          onBlur={() => {
            const p = parsePounds(text);
            if (p !== null) setText(penceToInput(p));
          }}
          aria-invalid={bad || invalid}
        />
      </div>
      {bad && <span className="field-error">Enter an amount like 20 or 12.50</span>}
    </div>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="row-between" style={{ marginBottom: 12 }}>
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Confirmation sheet. `onConfirm` may throw; the error is shown in the sheet
 * and the button is disabled while it runs, so a double tap can't submit twice.
 */
export function Confirm({
  title,
  children,
  confirmLabel,
  tone = 'primary',
  onConfirm,
  onClose,
  requireText,
  reasonLabel,
}: {
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  tone?: 'primary' | 'danger' | 'green';
  onConfirm: (reason: string) => Promise<void> | void;
  onClose: () => void;
  requireText?: string;
  reasonLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const blocked = (requireText !== undefined && typed.trim().toUpperCase() !== requireText) || (reasonLabel !== undefined && !reason.trim());
  return (
    <Sheet title={title} onClose={busy ? () => undefined : onClose}>
      <div className="stack">
        {children}
        {reasonLabel && (
          <div className="field">
            <label htmlFor="confirm-reason">{reasonLabel}</label>
            <input id="confirm-reason" className="input" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
          </div>
        )}
        {requireText && (
          <div className="field">
            <label htmlFor="confirm-type">Type {requireText} to confirm</label>
            <input id="confirm-type" className="input" autoCapitalize="characters" value={typed} onChange={(e) => setTyped(e.target.value)} />
          </div>
        )}
        <ErrorBanner error={error} />
        <div className="btn-row">
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className={`btn ${tone}`}
            disabled={busy || blocked}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onConfirm(reason.trim());
                onClose();
              } catch (e) {
                setError(e);
                setBusy(false);
              }
            }}
          >
            {busy ? <span className="spinner" aria-label="Working" /> : confirmLabel}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

interface ToastValue {
  show: (message: string, tone?: 'ok' | 'error') => void;
}
const ToastCtx = createContext<ToastValue>({ show: () => undefined });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; tone: 'ok' | 'error'; id: number } | null>(null);
  const show = useCallback((message: string, tone: 'ok' | 'error' = 'ok') => setToast({ message, tone, id: Date.now() }), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      <div className="toast-wrap" aria-live="polite">
        {toast && (
          <div key={toast.id} className={`toast ${toast.tone}`}>
            {toast.message}
          </div>
        )}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
  return d.toLocaleDateString('en-GB', opts);
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
