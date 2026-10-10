// Points a local build (dist/) at the local test stack from scripts/local-stack.sh.
import { writeFileSync } from 'node:fs';
import jwt from 'jsonwebtoken';

const key = jwt.sign({ role: 'anon', iss: 'supabase' }, 'super-secret-jwt-token-with-at-least-32-characters-long', { expiresIn: '1d' });
writeFileSync(
  new URL('../dist/config.js', import.meta.url),
  `window.FELT_CONFIG = ${JSON.stringify({ supabaseUrl: 'http://127.0.0.1:54321', supabaseAnonKey: key })};\n`,
);
console.log('dist/config.js now points at the local stack');
