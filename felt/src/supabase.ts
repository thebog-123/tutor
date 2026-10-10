import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, isConfigured } from './config';
import { FeltError, toFeltError } from './errors';

export const supabase = createClient(
  isConfigured ? SUPABASE_URL : 'http://localhost:54321',
  isConfigured ? SUPABASE_ANON_KEY : 'missing',
  { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);

/** Call a database function; throws a FeltError with a readable message on failure. */
export async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  let result;
  try {
    result = await supabase.rpc(fn, args);
  } catch (e) {
    throw toFeltError(e);
  }
  if (result.error) throw toFeltError(result.error);
  return result.data as T;
}

/** Run a select and throw a FeltError on failure. */
export async function select<T>(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  let result;
  try {
    result = await query;
  } catch (e) {
    throw toFeltError(e);
  }
  if (result.error) throw toFeltError(result.error);
  if (result.data === null) throw new FeltError('Not found.', 'FT404');
  return result.data as T;
}
