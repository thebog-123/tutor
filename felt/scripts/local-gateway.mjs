// Minimal stand-in for the Supabase API gateway, used only by local tests.
// Routes /auth/v1/* to GoTrue (:9999) and /rest/v1/* to PostgREST (:3001).
import http from 'node:http';

const routes = [
  ['/auth/v1', 9999],
  ['/rest/v1', 3001],
];

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  'access-control-expose-headers': 'content-range, x-supabase-api-version',
};

http
  .createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      return res.end();
    }
    const match = routes.find(([prefix]) => req.url.startsWith(prefix));
    if (!match) {
      res.writeHead(404, cors);
      return res.end('not found');
    }
    const [prefix, port] = match;
    const headers = { ...req.headers, host: `127.0.0.1:${port}` };
    const upstream = http.request(
      { host: '127.0.0.1', port, path: req.url.slice(prefix.length) || '/', method: req.method, headers },
      (up) => {
        res.writeHead(up.statusCode, { ...up.headers, ...cors });
        up.pipe(res);
      },
    );
    upstream.on('error', (err) => {
      res.writeHead(502, cors);
      res.end(String(err));
    });
    req.pipe(upstream);
  })
  .listen(54321, '127.0.0.1');
