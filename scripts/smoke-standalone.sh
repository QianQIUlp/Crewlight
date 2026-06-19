#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(node -p "JSON.parse(require('node:fs').readFileSync('$ROOT/package.json', 'utf8')).version")"
NODE_VERSION="$(node --version)"
ARTIFACT="agentpulse-v${VERSION}-linux-x64"
ARCHIVE="$ROOT/release/${ARTIFACT}.tar.gz"
CHECKSUM="$ARCHIVE.sha256"
PORT="${AGENTPULSE_SMOKE_PORT:-43768}"

CURL="$(command -v curl)"
ENV_COMMAND="$(command -v env)"
GREP="$(command -v grep)"
MKTEMP="$(command -v mktemp)"
SHA256SUM="$(command -v sha256sum)"
SLEEP="$(command -v sleep)"
TAR="$(command -v tar)"

WORK="$("$MKTEMP" -d)"
DAEMON_PID=""

cleanup() {
  if [[ -n "$DAEMON_PID" ]] && kill -0 "$DAEMON_PID" 2>/dev/null; then
    kill -TERM "$DAEMON_PID" 2>/dev/null || true
    wait "$DAEMON_PID" 2>/dev/null || true
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

(
  cd "$ROOT/release"
  "$SHA256SUM" --check "$(basename "$CHECKSUM")"
)
"$TAR" -xzf "$ARCHIVE" -C "$WORK"

BIN_DIR="$WORK/$ARTIFACT"
BIN="$BIN_DIR/agentpulse"
HOME_DIR="$WORK/home"
mkdir -p "$HOME_DIR"

test -x "$BIN"
"$GREP" -qF "AgentPulse version: $VERSION" "$BIN_DIR/BUILD-INFO.txt"
"$GREP" -qF "Node version: $NODE_VERSION" "$BIN_DIR/BUILD-INFO.txt"
"$GREP" -qF "Platform: linux" "$BIN_DIR/BUILD-INFO.txt"
"$GREP" -qF "Architecture: x64" "$BIN_DIR/BUILD-INFO.txt"

hash -r
for command_name in node npm pnpm; do
  if PATH="$BIN_DIR" command -v "$command_name" >/dev/null 2>&1; then
    echo "Unexpected runtime dependency available in restricted PATH: $command_name" >&2
    exit 1
  fi
done
echo "Confirmed node, npm, and pnpm are unavailable in the artifact PATH"

run_binary() {
  "$ENV_COMMAND" -i \
    PATH="$BIN_DIR" \
    HOME="$HOME_DIR" \
    AGENTPULSE_HOST="127.0.0.1" \
    AGENTPULSE_PORT="$PORT" \
    "$BIN" "$@"
}

run_binary --help >"$WORK/help.txt"
"$GREP" -qF "AgentPulse v$VERSION" "$WORK/help.txt"
run_binary setup claude-code --print >"$WORK/claude-setup.txt" 2>"$WORK/claude-guidance.txt"
"$GREP" -qF '"hooks"' "$WORK/claude-setup.txt"
run_binary setup codex --print >"$WORK/codex-setup.txt" 2>"$WORK/codex-guidance.txt"
"$GREP" -qF 'notify = ["agentpulse", "ingest", "codex"]' "$WORK/codex-setup.txt"

"$ENV_COMMAND" -i \
  PATH="$BIN_DIR" \
  HOME="$HOME_DIR" \
  AGENTPULSE_HOST="127.0.0.1" \
  AGENTPULSE_PORT="$PORT" \
  "$BIN" daemon \
  --host 127.0.0.1 \
  --port "$PORT" \
  --notifier none \
  --dashboard >"$WORK/daemon.log" 2>&1 &
DAEMON_PID=$!

for _ in {1..50}; do
  if "$CURL" --fail --silent "http://127.0.0.1:${PORT}/dashboard" >"$WORK/dashboard.html"; then
    break
  fi
  "$SLEEP" 0.1
done

"$CURL" --fail --silent "http://127.0.0.1:${PORT}/dashboard" >"$WORK/dashboard.html"
"$GREP" -qF "AgentPulse Dashboard" "$WORK/dashboard.html"
"$CURL" \
  --dump-header "$WORK/dashboard.headers" \
  --fail \
  --silent \
  "http://127.0.0.1:${PORT}/dashboard/api" >"$WORK/dashboard-before.json"
"$GREP" -qi '^cache-control: no-store' "$WORK/dashboard.headers"
"$GREP" -qF '"status":"ok"' "$WORK/dashboard-before.json"

run_binary doctor --json --notifier none >"$WORK/doctor.json"
"$GREP" -qF '"ok": true' "$WORK/doctor.json"
"$GREP" -qF '"status": "skipped"' "$WORK/doctor.json"

run_binary emit \
  --source custom \
  --surface manual \
  --status completed \
  --session-id standalone-smoke \
  --message done >"$WORK/emit.txt"
run_binary status --json >"$WORK/status.json"
"$GREP" -qF '"sessionId": "standalone-smoke"' "$WORK/status.json"

"$CURL" --fail --silent "http://127.0.0.1:${PORT}/dashboard/api" >"$WORK/dashboard-after.json"
"$GREP" -qF '"sessionId":"standalone-smoke"' "$WORK/dashboard-after.json"

kill -TERM "$DAEMON_PID"
wait "$DAEMON_PID"
DAEMON_PID=""
"$GREP" -qF "AgentPulse daemon stopped" "$WORK/daemon.log"

echo "Standalone binary smoke test passed with restricted PATH=$BIN_DIR"
