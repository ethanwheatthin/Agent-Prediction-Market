#!/usr/bin/env bash
# AgentArena — All-in-one startup script
# Starts: PostgreSQL, Redis (via Docker), Backend, Frontend
#
# Usage:
#   ./start.sh           # start everything
#   ./start.sh --stop    # stop Docker services and kill bg processes
#   ./start.sh --reset   # stop + wipe DB volumes, then start fresh

set -euo pipefail

# ─── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
LOG_DIR="$SCRIPT_DIR/.logs"
PID_FILE="$SCRIPT_DIR/.pids"

log()  { echo -e "${BLUE}[$(date +%H:%M:%S)]${RESET} $*"; }
ok()   { echo -e "${GREEN}[$(date +%H:%M:%S)] ✓${RESET} $*"; }
warn() { echo -e "${YELLOW}[$(date +%H:%M:%S)] ⚠${RESET}  $*"; }
err()  { echo -e "${RED}[$(date +%H:%M:%S)] ✗${RESET} $*"; }
section() { echo -e "\n${BOLD}${CYAN}━━━ $* ━━━${RESET}"; }

# ─── Cleanup / Stop ──────────────────────────────────────────────────────────
stop_services() {
  section "Stopping Services"

  # Kill background Node processes we started
  if [[ -f "$PID_FILE" ]]; then
    while IFS= read -r pid; do
      if kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null && log "Killed process $pid"
      fi
    done < "$PID_FILE"
    rm -f "$PID_FILE"
  fi

  # Stop Docker services
  log "Stopping Docker containers..."
  docker compose -f "$SCRIPT_DIR/docker-compose.yml" stop postgres redis 2>/dev/null || true
  ok "Services stopped"
}

reset_services() {
  section "Resetting (wiping volumes)"
  docker compose -f "$SCRIPT_DIR/docker-compose.yml" down -v 2>/dev/null || true
  rm -f "$PID_FILE"
  ok "Volumes wiped"
}

# ─── Ctrl+C handler ──────────────────────────────────────────────────────────
cleanup() {
  echo ""
  warn "Caught interrupt — shutting down..."
  stop_services
  exit 0
}
trap cleanup INT TERM

# ─── Argument handling ────────────────────────────────────────────────────────
case "${1:-}" in
  --stop)  stop_services; exit 0 ;;
  --reset) reset_services; exec "$0" ;;  # wipe then restart
esac

# ─── Dependency checks ────────────────────────────────────────────────────────
section "Checking Dependencies"

check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    err "Required command not found: $1"
    echo "  Install it and re-run this script."
    exit 1
  fi
  ok "$1 found ($(command -v "$1"))"
}

check_cmd docker
check_cmd node
check_cmd npm

NODE_VERSION=$(node --version | sed 's/v//' | cut -d. -f1)
if (( NODE_VERSION < 18 )); then
  err "Node.js 18+ required (found v${NODE_VERSION})"
  exit 1
fi
ok "Node.js v$(node --version | sed 's/v//')"

if ! docker info &>/dev/null; then
  err "Docker daemon is not running. Start Docker and retry."
  exit 1
fi
ok "Docker daemon running"

# ─── Prepare log directory ────────────────────────────────────────────────────
mkdir -p "$LOG_DIR"
> "$PID_FILE"  # clear old PIDs

# ─── Setup .env files ─────────────────────────────────────────────────────────
section "Environment Setup"

if [[ ! -f "$BACKEND_DIR/.env" ]]; then
  cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
  ok "Created backend/.env from example"
else
  ok "backend/.env already exists"
fi

if [[ ! -f "$FRONTEND_DIR/.env" ]]; then
  cp "$FRONTEND_DIR/.env.example" "$FRONTEND_DIR/.env" 2>/dev/null || true
  ok "Created frontend/.env from example"
else
  ok "frontend/.env already exists"
fi

# ─── Install dependencies ─────────────────────────────────────────────────────
section "Installing Dependencies"

install_if_needed() {
  local dir="$1"
  local name="$2"
  if [[ ! -d "$dir/node_modules" ]]; then
    log "Installing $name dependencies..."
    npm install --prefix "$dir" --silent
    ok "$name dependencies installed"
  else
    ok "$name dependencies already installed"
  fi
}

install_if_needed "$BACKEND_DIR" "backend"
install_if_needed "$FRONTEND_DIR" "frontend"

# ─── Start Docker infra (Postgres + Redis only) ───────────────────────────────
section "Starting Infrastructure (PostgreSQL + Redis)"

log "Starting postgres and redis via Docker Compose..."
docker compose -f "$SCRIPT_DIR/docker-compose.yml" up -d postgres redis \
  --remove-orphans 2>&1 | grep -v "^$" | sed 's/^/  /'

# Wait for Postgres to be healthy
log "Waiting for PostgreSQL to be ready..."
MAX_WAIT=30
WAITED=0
until docker compose -f "$SCRIPT_DIR/docker-compose.yml" exec -T postgres \
    pg_isready -U agentarena -q 2>/dev/null; do
  sleep 1
  WAITED=$((WAITED + 1))
  if (( WAITED >= MAX_WAIT )); then
    err "PostgreSQL did not become ready within ${MAX_WAIT}s"
    exit 1
  fi
  echo -ne "  Waiting... ${WAITED}s\r"
done
ok "PostgreSQL is ready"

# Wait for Redis
log "Waiting for Redis to be ready..."
WAITED=0
until docker compose -f "$SCRIPT_DIR/docker-compose.yml" exec -T redis \
    redis-cli ping 2>/dev/null | grep -q PONG; do
  sleep 1
  WAITED=$((WAITED + 1))
  if (( WAITED >= MAX_WAIT )); then
    err "Redis did not become ready within ${MAX_WAIT}s"
    exit 1
  fi
  echo -ne "  Waiting... ${WAITED}s\r"
done
ok "Redis is ready"

# ─── Run Prisma migrations ────────────────────────────────────────────────────
section "Running Database Migrations"

log "Running Prisma migrate deploy..."
(
  cd "$BACKEND_DIR"
  npx prisma generate --silent 2>&1 | tail -1
  npx prisma migrate deploy 2>&1 | grep -E "(Applying|already applied|No pending|Error)" || true
)
ok "Migrations complete"

# ─── Start Backend ────────────────────────────────────────────────────────────
section "Starting Backend (port 4000)"

BACKEND_LOG="$LOG_DIR/backend.log"
log "Starting backend dev server... (log: .logs/backend.log)"
(
  cd "$BACKEND_DIR"
  export $(grep -v '^#' .env | xargs -d '\n') 2>/dev/null || true
  npm run dev
) > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!
echo "$BACKEND_PID" >> "$PID_FILE"

# Wait for backend to be accepting connections
log "Waiting for backend to be ready..."
WAITED=0
until curl -sf http://localhost:4000/health >/dev/null 2>&1; do
  sleep 1
  WAITED=$((WAITED + 1))
  if (( WAITED >= 30 )); then
    err "Backend did not start within 30s. Check .logs/backend.log"
    tail -20 "$BACKEND_LOG" | sed 's/^/  /'
    exit 1
  fi
  # Check process is still alive
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    err "Backend process died. Check .logs/backend.log"
    tail -20 "$BACKEND_LOG" | sed 's/^/  /'
    exit 1
  fi
  echo -ne "  Waiting... ${WAITED}s\r"
done
ok "Backend is ready at http://localhost:4000"

# ─── Start Frontend ───────────────────────────────────────────────────────────
section "Starting Frontend (port 5173)"

FRONTEND_LOG="$LOG_DIR/frontend.log"
log "Starting frontend dev server... (log: .logs/frontend.log)"
(
  cd "$FRONTEND_DIR"
  npm run dev
) > "$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!
echo "$FRONTEND_PID" >> "$PID_FILE"

# Wait for frontend to be ready
log "Waiting for frontend to be ready..."
WAITED=0
until curl -sf http://localhost:5173 >/dev/null 2>&1; do
  sleep 1
  WAITED=$((WAITED + 1))
  if (( WAITED >= 30 )); then
    err "Frontend did not start within 30s. Check .logs/frontend.log"
    tail -20 "$FRONTEND_LOG" | sed 's/^/  /'
    exit 1
  fi
  if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
    err "Frontend process died. Check .logs/frontend.log"
    tail -20 "$FRONTEND_LOG" | sed 's/^/  /'
    exit 1
  fi
  echo -ne "  Waiting... ${WAITED}s\r"
done
ok "Frontend is ready at http://localhost:5173"

# ─── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}${GREEN}  AgentArena is running!${RESET}"
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
echo -e "  ${CYAN}Frontend${RESET}    →  http://localhost:5173"
echo -e "  ${CYAN}Backend API${RESET} →  http://localhost:4000"
echo -e "  ${CYAN}Health${RESET}      →  http://localhost:4000/health"
echo -e "  ${CYAN}Agent guide${RESET} →  http://localhost:4000/agent.md"
echo ""
echo -e "  ${YELLOW}PostgreSQL${RESET}  →  localhost:5433  (agentarena/agentarena)"
echo -e "  ${YELLOW}Redis${RESET}       →  localhost:6379"
echo ""
echo -e "  Logs:  ${BLUE}.logs/backend.log${RESET}  |  ${BLUE}.logs/frontend.log${RESET}"
echo ""
echo -e "  ${BOLD}To register an agent:${RESET}"
echo -e "  ${BLUE}curl -s -X POST http://localhost:4000/agents/register \\${RESET}"
echo -e "  ${BLUE}  -H 'Content-Type: application/json' \\${RESET}"
echo -e "  ${BLUE}  -d '{\"name\":\"MyAgent\",\"persona\":\"Momentum trader\"}' | jq${RESET}"
echo ""
echo -e "  Press ${BOLD}Ctrl+C${RESET} to stop all services"
echo ""

# ─── Tail logs ───────────────────────────────────────────────────────────────
# Stream both logs to the terminal so the user can see activity
tail -f "$BACKEND_LOG" "$FRONTEND_LOG" 2>/dev/null | \
  awk '/==> .*backend/ { src="[backend]" } /==> .*frontend/ { src="[frontend]" } !/==>/ { print src " " $0 }'
