#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_DIR="$ROOT_DIR/service"
FRONTEND_DIR="$ROOT_DIR/frontend"

BACKEND_HOST="${BACKEND_HOST:-0.0.0.0}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_HOST="${FRONTEND_HOST:-0.0.0.0}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
API_BASE_URL="${API_BASE_URL:-}"

SETUP_ONLY=0
SKIP_SETUP=0

BACKEND_PID=""
FRONTEND_PID=""
FRONTEND_PM=""

usage() {
  cat <<'EOF'
Run Operator Helper backend + frontend with one command.

Usage:
  ./scripts/dev.sh [flags]

Flags:
  --backend-port <port>   Backend port (default: 8000)
  --frontend-port <port>  Frontend port (default: 5173)
  --backend-host <host>   Backend host (default: 0.0.0.0)
  --frontend-host <host>  Frontend host (default: 0.0.0.0)
  --api-base-url <url>    Override VITE_API_BASE_URL for frontend
  --setup-only            Install dependencies only, do not run dev servers
  --skip-setup            Skip dependency checks/installation
  -h, --help              Show this help

Examples:
  ./scripts/dev.sh
  ./scripts/dev.sh --backend-port 9000 --frontend-port 5174
  ./scripts/dev.sh --api-base-url http://127.0.0.1:9000
EOF
}

run_privileged() {
  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    "$@"
    return
  fi
  if command -v sudo >/dev/null 2>&1; then
    sudo "$@"
    return
  fi
  echo "Need elevated privileges to install system packages, but sudo is not available." >&2
  exit 1
}

install_node_macos() {
  if command -v brew >/dev/null 2>&1; then
    echo "[setup] Installing Node.js via Homebrew"
    brew install node
    return
  fi
  echo "Automatic Node.js install on macOS requires Homebrew." >&2
  echo "Install Homebrew first, or install Node.js manually: https://nodejs.org/" >&2
  exit 1
}

install_node_linux() {
  if command -v apt-get >/dev/null 2>&1; then
    echo "[setup] Installing Node.js via apt-get"
    run_privileged apt-get update
    run_privileged apt-get install -y nodejs npm
    return
  fi
  if command -v dnf >/dev/null 2>&1; then
    echo "[setup] Installing Node.js via dnf"
    run_privileged dnf install -y nodejs npm
    return
  fi
  if command -v yum >/dev/null 2>&1; then
    echo "[setup] Installing Node.js via yum"
    run_privileged yum install -y nodejs npm
    return
  fi
  if command -v pacman >/dev/null 2>&1; then
    echo "[setup] Installing Node.js via pacman"
    run_privileged pacman -Sy --noconfirm nodejs npm
    return
  fi
  if command -v zypper >/dev/null 2>&1; then
    echo "[setup] Installing Node.js via zypper"
    run_privileged zypper --non-interactive install nodejs npm
    return
  fi
  echo "Could not detect supported package manager to install Node.js automatically." >&2
  echo "Install Node.js manually: https://nodejs.org/" >&2
  exit 1
}

ensure_node_toolchain() {
  if command -v node >/dev/null 2>&1 && \
    (command -v pnpm >/dev/null 2>&1 || command -v npm >/dev/null 2>&1); then
    return
  fi

  echo "[setup] Node.js toolchain is missing. Attempting automatic install..."

  case "$(uname -s)" in
    Darwin)
      install_node_macos
      ;;
    Linux)
      install_node_linux
      ;;
    *)
      echo "Unsupported OS for automatic Node.js installation: $(uname -s)" >&2
      echo "Install Node.js manually: https://nodejs.org/" >&2
      exit 1
      ;;
  esac

  if ! command -v node >/dev/null 2>&1; then
    echo "Node.js installation finished, but 'node' is still not available in PATH." >&2
    exit 1
  fi
  if ! command -v pnpm >/dev/null 2>&1 && ! command -v npm >/dev/null 2>&1; then
    echo "Node.js installation finished, but neither npm nor pnpm is available." >&2
    exit 1
  fi
}

is_valid_port() {
  local value="$1"
  if [[ ! "$value" =~ ^[0-9]+$ ]]; then
    return 1
  fi
  if (( value < 1 || value > 65535 )); then
    return 1
  fi
  return 0
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --backend-port)
        [[ $# -ge 2 ]] || { echo "Missing value for --backend-port" >&2; exit 1; }
        BACKEND_PORT="$2"
        shift 2
        ;;
      --frontend-port)
        [[ $# -ge 2 ]] || { echo "Missing value for --frontend-port" >&2; exit 1; }
        FRONTEND_PORT="$2"
        shift 2
        ;;
      --backend-host)
        [[ $# -ge 2 ]] || { echo "Missing value for --backend-host" >&2; exit 1; }
        BACKEND_HOST="$2"
        shift 2
        ;;
      --frontend-host)
        [[ $# -ge 2 ]] || { echo "Missing value for --frontend-host" >&2; exit 1; }
        FRONTEND_HOST="$2"
        shift 2
        ;;
      --api-base-url)
        [[ $# -ge 2 ]] || { echo "Missing value for --api-base-url" >&2; exit 1; }
        API_BASE_URL="$2"
        shift 2
        ;;
      --setup-only)
        SETUP_ONLY=1
        shift
        ;;
      --skip-setup)
        SKIP_SETUP=1
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        echo "Unknown argument: $1" >&2
        usage
        exit 1
        ;;
    esac
  done

  is_valid_port "$BACKEND_PORT" || {
    echo "Invalid backend port: $BACKEND_PORT" >&2
    exit 1
  }
  is_valid_port "$FRONTEND_PORT" || {
    echo "Invalid frontend port: $FRONTEND_PORT" >&2
    exit 1
  }
}

pick_frontend_pm() {
  if command -v pnpm >/dev/null 2>&1; then
    FRONTEND_PM="pnpm"
    return
  fi
  if command -v npm >/dev/null 2>&1; then
    FRONTEND_PM="npm"
    return
  fi
  echo "Neither pnpm nor npm is installed" >&2
  exit 1
}

ensure_backend_env() {
  local python_bin
  python_bin="$(command -v python3 || true)"
  if [[ -z "$python_bin" ]]; then
    echo "python3 not found" >&2
    exit 1
  fi

  if [[ ! -x "$SERVICE_DIR/.venv/bin/python" ]]; then
    echo "[setup] Creating Python virtualenv in service/.venv"
    "$python_bin" -m venv "$SERVICE_DIR/.venv"
  fi

  if ! "$SERVICE_DIR/.venv/bin/python" -c "import fastapi, uvicorn, pydantic" >/dev/null 2>&1; then
    echo "[setup] Installing backend dependencies"
    "$SERVICE_DIR/.venv/bin/python" -m pip install -r "$SERVICE_DIR/requirements.txt"
  fi
}

ensure_frontend_deps() {
  ensure_node_toolchain
  pick_frontend_pm
  if [[ -d "$FRONTEND_DIR/node_modules" ]]; then
    return
  fi

  echo "[setup] Installing frontend dependencies with $FRONTEND_PM"
  (
    cd "$FRONTEND_DIR"
    if [[ "$FRONTEND_PM" == "pnpm" ]]; then
      pnpm install
    else
      npm install
    fi
  )
}

derive_api_base_url() {
  if [[ -n "$API_BASE_URL" ]]; then
    return
  fi
  local backend_public_host="$BACKEND_HOST"
  if [[ "$backend_public_host" == "0.0.0.0" || "$backend_public_host" == "::" ]]; then
    backend_public_host="localhost"
  fi
  API_BASE_URL="http://${backend_public_host}:${BACKEND_PORT}"
}

cleanup() {
  local exit_code=$?
  trap - INT TERM EXIT

  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "$FRONTEND_PID" ]] && kill -0 "$FRONTEND_PID" >/dev/null 2>&1; then
    kill "$FRONTEND_PID" >/dev/null 2>&1 || true
  fi

  if [[ -n "$BACKEND_PID" ]]; then
    wait "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "$FRONTEND_PID" ]]; then
    wait "$FRONTEND_PID" >/dev/null 2>&1 || true
  fi

  exit "$exit_code"
}

start_backend() {
  (
    cd "$SERVICE_DIR"
    exec "$SERVICE_DIR/.venv/bin/python" -m uvicorn src.main:app \
      --host "$BACKEND_HOST" \
      --port "$BACKEND_PORT" \
      --reload
  ) &
  BACKEND_PID="$!"
}

start_frontend() {
  (
    cd "$FRONTEND_DIR"
    if [[ "$FRONTEND_PM" == "pnpm" ]]; then
      exec env VITE_API_BASE_URL="$API_BASE_URL" \
        pnpm dev --host "$FRONTEND_HOST" --port "$FRONTEND_PORT"
    fi
    exec env VITE_API_BASE_URL="$API_BASE_URL" \
      npm run dev -- --host "$FRONTEND_HOST" --port "$FRONTEND_PORT"
  ) &
  FRONTEND_PID="$!"
}

main() {
  parse_args "$@"

  if [[ "$SKIP_SETUP" -ne 1 ]]; then
    ensure_backend_env
    ensure_frontend_deps
  else
    pick_frontend_pm
  fi

  if [[ "$SETUP_ONLY" -eq 1 ]]; then
    echo "[setup] Done"
    return
  fi

  derive_api_base_url
  echo "[dev] Backend  -> http://${BACKEND_HOST}:${BACKEND_PORT}"
  echo "[dev] Frontend -> http://${FRONTEND_HOST}:${FRONTEND_PORT}"
  echo "[dev] API base  -> ${API_BASE_URL}"

  trap cleanup INT TERM EXIT
  start_backend
  start_frontend

  wait -n "$BACKEND_PID" "$FRONTEND_PID"
}

main "$@"
