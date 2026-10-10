export class FeltError extends Error {
  code: string;
  constructor(message: string, code = 'unknown') {
    super(message);
    this.code = code;
  }
  get isConflict() {
    return this.code === 'FT409';
  }
}

const OFFLINE =
  "Couldn't reach the Felt server. Check your connection and try again. If nobody has used Felt for a week, the free database may be paused: a group admin can restore it from the Supabase dashboard.";

export function toFeltError(e: unknown): FeltError {
  if (e instanceof FeltError) return e;
  const err = (e ?? {}) as { code?: string; message?: string; status?: number; name?: string };
  const message = err.message ?? String(e);
  const code = err.code ?? '';
  if (code.startsWith('FT')) return new FeltError(message, code);
  if (/Failed to fetch|NetworkError|Load failed|fetch failed|network/i.test(message)) return new FeltError(OFFLINE, 'offline');
  if (code === '42501' || code === 'PGRST301' || /JWT|permission denied/i.test(message)) {
    return new FeltError('Your session has expired or you do not have access. Please sign in again.', 'FT401');
  }
  if (/Invalid login credentials/i.test(message)) return new FeltError('That email and password do not match.', 'auth');
  if (/User already registered/i.test(message)) return new FeltError('There is already an account with that email. Sign in instead.', 'auth');
  if (/Email not confirmed/i.test(message)) return new FeltError('Confirm your email first: check your inbox for the link.', 'auth');
  if (/rate limit/i.test(message)) return new FeltError('Too many emails have been sent recently. Wait a while and try again.', 'auth');
  if (/Password should be/i.test(message)) return new FeltError(message, 'auth');
  return new FeltError(message || 'Something went wrong. Please try again.', code || 'unknown');
}

export function errorMessage(e: unknown): string {
  return toFeltError(e).message;
}
