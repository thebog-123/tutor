#!/usr/bin/env bash
# Starts a throwaway Supabase-like backend for tests and local development:
#   Postgres 16 (host binaries) on :54322
#   GoTrue (Supabase Auth) on :9999 and PostgREST on :3001 (Docker)
#   a tiny gateway on :54321 that serves /auth/v1 and /rest/v1 like Supabase.
# Usage: scripts/local-stack.sh start|stop
# Needs: postgres 16 binaries, docker, node. Linux only. Data lives in $FELT_STACK_DIR.
set -euo pipefail

DIR="${FELT_STACK_DIR:-/tmp/felt-stack}"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PORT=54322
JWT_SECRET="super-secret-jwt-token-with-at-least-32-characters-long"
HERE="$(cd "$(dirname "$0")" && pwd)"

stop() {
  docker rm -f felt-gotrue felt-postgrest >/dev/null 2>&1 || true
  [ -f "$DIR/gateway.pid" ] && kill "$(cat "$DIR/gateway.pid")" 2>/dev/null || true
  [ -d "$DIR/pg" ] && su postgres -c "$PGBIN/pg_ctl -D $DIR/pg -m fast stop" >/dev/null 2>&1 || true
  rm -rf "$DIR"
}

psql_su() { su postgres -c "psql -v ON_ERROR_STOP=1 -q -h 127.0.0.1 -p $PORT -d postgres $*"; }

start() {
  stop
  mkdir -p "$DIR" && chown postgres "$DIR"
  su postgres -c "$PGBIN/initdb -D $DIR/pg -A trust -U postgres >/dev/null"
  echo "wal_level = logical" >> "$DIR/pg/postgresql.conf"
  su postgres -c "$PGBIN/pg_ctl -D $DIR/pg -o '-p $PORT -k /tmp' -l $DIR/pg.log start >/dev/null"
  until su postgres -c "$PGBIN/pg_isready -h 127.0.0.1 -p $PORT" >/dev/null 2>&1; do sleep 0.3; done

  cat > "$DIR/roles.sql" <<SQL
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator login password 'postgres' noinherit;
grant anon, authenticated, service_role to authenticator;
create role supabase_auth_admin login password 'postgres' createrole;
create schema auth authorization supabase_auth_admin;
grant create on database postgres to supabase_auth_admin;
alter role supabase_auth_admin set search_path = auth;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
create publication supabase_realtime;
-- Like Supabase: extensions live in their own schema, outside function search paths.
create schema extensions;
create extension pgcrypto schema extensions;
SQL
  chmod 644 "$DIR/roles.sql"
  psql_su "-f $DIR/roles.sql"

  docker run -d --name felt-gotrue --network host \
    -e GOTRUE_API_HOST=127.0.0.1 -e PORT=9999 -e API_EXTERNAL_URL=http://127.0.0.1:54321/auth/v1 \
    -e GOTRUE_DB_DRIVER=postgres \
    -e "GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:postgres@127.0.0.1:$PORT/postgres?search_path=auth" \
    -e GOTRUE_SITE_URL=http://127.0.0.1:5173 -e GOTRUE_JWT_SECRET="$JWT_SECRET" -e GOTRUE_JWT_EXP=3600 \
    -e GOTRUE_JWT_AUD=authenticated -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated \
    -e GOTRUE_JWT_ADMIN_ROLES=service_role \
    -e GOTRUE_DISABLE_SIGNUP=false -e GOTRUE_EXTERNAL_EMAIL_ENABLED=true -e GOTRUE_MAILER_AUTOCONFIRM=true \
    -e GOTRUE_RATE_LIMIT_EMAIL_SENT=1000 -e GOTRUE_RATE_LIMIT_TOKEN_REFRESH=1000 \
    -e GOTRUE_SMTP_ADMIN_EMAIL=admin@example.com \
    supabase/gotrue:v2.170.0 >/dev/null
  until curl -sf http://127.0.0.1:9999/health >/dev/null 2>&1; do sleep 0.5; done

  chmod 644 "$HERE/../supabase/schema.sql"
  cp "$HERE/../supabase/schema.sql" "$DIR/schema.sql" && chmod 644 "$DIR/schema.sql"
  psql_su "-f $DIR/schema.sql"

  docker run -d --name felt-postgrest --network host \
    -e "PGRST_DB_URI=postgres://authenticator:postgres@127.0.0.1:$PORT/postgres" \
    -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET="$JWT_SECRET" \
    -e PGRST_SERVER_PORT=3001 -e PGRST_DB_USE_LEGACY_GUCS=false \
    postgrest/postgrest:v12.2.3 >/dev/null
  until curl -sf http://127.0.0.1:3001/ >/dev/null 2>&1; do sleep 0.5; done

  nohup node "$HERE/local-gateway.mjs" > "$DIR/gateway.log" 2>&1 &
  echo $! > "$DIR/gateway.pid"
  until curl -sf http://127.0.0.1:54321/auth/v1/health >/dev/null 2>&1; do sleep 0.3; done
  echo "Local stack ready at http://127.0.0.1:54321"
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  *) echo "usage: $0 start|stop"; exit 1 ;;
esac
