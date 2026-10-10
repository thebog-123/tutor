// Supabase connection details. In production these come from public/config.js
// (written at deploy time); in development from VITE_SUPABASE_URL and
// VITE_SUPABASE_ANON_KEY in felt/.env.local. Both values are safe to publish:
// the anon/publishable key only grants what the database's row-level security allows.

declare global {
  interface Window {
    FELT_CONFIG?: { supabaseUrl?: string; supabaseAnonKey?: string };
  }
}

const runtime = typeof window !== 'undefined' ? window.FELT_CONFIG : undefined;

export const SUPABASE_URL = (runtime?.supabaseUrl || import.meta.env.VITE_SUPABASE_URL || '').trim();
export const SUPABASE_ANON_KEY = (runtime?.supabaseAnonKey || import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
