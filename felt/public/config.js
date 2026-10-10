// Felt connection settings: the Supabase project URL and its publishable
// (anon) key. Both are public by design. The data is protected by the
// database's row-level security, not by keeping these secret. Never put the
// secret / service_role key here.
// The deploy workflow overwrites this file if the repository variables
// FELT_SUPABASE_URL and FELT_SUPABASE_ANON_KEY are set.
window.FELT_CONFIG = {
  supabaseUrl: 'https://ayakqjlrbamvkvilqjmt.supabase.co',
  supabaseAnonKey: 'sb_publishable_bU7xPXLNgAtoxEoSvqfmSQ_e_AeoNY3',
};
