#!/usr/bin/env bash
# Read-only health check for a verification instance of the game's dev server.
set -u
PORT="${PORT:-5173}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
fail() { echo "DOCTOR FAIL: $*"; exit 1; }

[ -d "$ROOT/node_modules" ] || fail "node_modules missing; run npm install in $ROOT"
PID="$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | head -1)"
[ -n "$PID" ] || fail "nothing is listening on port $PORT; launch the dev server first"
CMD="$(ps -o command= -p "$PID")"
case "$CMD" in *vite*) ;; *) fail "port $PORT is owned by pid $PID ($CMD), not vite" ;; esac
CWD="$(lsof -a -p "$PID" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')"
[ "$CWD" = "$ROOT" ] || fail "vite on port $PORT serves $CWD, not this checkout ($ROOT)"
TITLE="$(curl -fsS "http://localhost:$PORT/" | sed -n 's:.*<title>\(.*\)</title>.*:\1:p')"
[ "$TITLE" = 'Axis &amp; Allies 1942' ] || fail "unexpected page title '$TITLE'"
REV="$(git -C "$ROOT" rev-parse --short HEAD)$(git -C "$ROOT" diff --quiet || echo '+dirty')"
SCEN="$(ls "$ROOT/.verify/scenarios" 2>/dev/null | tr '\n' ' ')"
echo "DOCTOR OK: vite pid $PID on http://localhost:$PORT serving $ROOT at $REV; scenarios: ${SCEN:-none}"
