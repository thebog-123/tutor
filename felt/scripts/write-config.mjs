// Writes dist/config.js from environment variables at deploy time.
//   FELT_SUPABASE_URL       e.g. https://abcdefgh.supabase.co
//   FELT_SUPABASE_ANON_KEY  the project's anon / publishable key (public by design)
import { writeFileSync } from 'node:fs';

const url = (process.env.FELT_SUPABASE_URL ?? '').trim();
const key = (process.env.FELT_SUPABASE_ANON_KEY ?? '').trim();
if (!url || !key) {
  console.log('FELT_SUPABASE_URL / FELT_SUPABASE_ANON_KEY not set: keeping the committed public/config.js.');
  process.exit(0);
}
if (url && !/^https?:\/\/\S+$/.test(url)) {
  throw new Error('FELT_SUPABASE_URL does not look like a URL.');
}
writeFileSync(
  new URL('../dist/config.js', import.meta.url),
  `window.FELT_CONFIG = ${JSON.stringify({ supabaseUrl: url.replace(/\/$/, ''), supabaseAnonKey: key })};\n`,
);
console.log('Wrote dist/config.js');
