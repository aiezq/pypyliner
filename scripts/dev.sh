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
NODE_INSTALL_DIR="${NODE_INSTALL_DIR:-$HOME/.local/operator-helper/node}"
NODE_FALLBACK_VERSION="${NODE_FALLBACK_VERSION:-22.12.0}"

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

node_version_is_supported() {
  if ! command -v node >/dev/null 2>&1; then
    return 1
  fi

  local version_raw
  version_raw="$(node -v 2>/dev/null || true)"
  version_raw="${version_raw#v}"
  if [[ -z "$version_raw" ]]; then
    return 1
  fi

  local major minor patch
  IFS='.' read -r major minor patch <<<"$version_raw"
  major="${major:-0}"
  minor="${minor:-0}"
  patch="${patch:-0}"

  if (( major > 22 )); then
    return 0
  fi
  if (( major == 22 )); then
    (( minor >= 12 )) && return 0 || return 1
  fi
  if (( major == 20 )); then
    (( minor >= 19 )) && return 0 || return 1
  fi
  return 1
}

print_node_version_mismatch() {
  local detected
  detected="$(node -v 2>/dev/null || echo "not found")"
  echo "[setup] Node.js version is too old: ${detected}" >&2
  echo "[setup] Vite requires Node.js >=20.19 or >=22.12." >&2
}

prepend_local_node_path() {
  if [[ -d "$NODE_INSTALL_DIR/current/bin" ]]; then
    case ":$PATH:" in
      *":$NODE_INSTALL_DIR/current/bin:"*) ;;
      *) PATH="$NODE_INSTALL_DIR/current/bin:$PATH" ;;
    esac
  fi
}

detect_node_archive_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo "x64" ;;
    aarch64|arm64) echo "arm64" ;;
    armv7l) echo "armv7l" ;;
    *)
      echo "Unsupported CPU architecture for auto node binary install: $(uname -m)" >&2
      return 1
      ;;
  esac
}

download_file() {
  local url="$1"
  local output="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$output"
    return
  fi
  if command -v wget >/dev/null 2>&1; then
    wget -qO "$output" "$url"
    return
  fi
  echo "Need curl or wget to download Node.js binary archive." >&2
  exit 1
}

install_node_from_binary_archive() {
  local os_name
  os_name="$(uname -s)"
  local platform
  case "$os_name" in
    Linux) platform="linux" ;;
    Darwin) platform="darwin" ;;
    *)
      echo "Unsupported OS for binary Node.js bootstrap: $os_name" >&2
      return 1
      ;;
  esac

  local arch
  arch="$(detect_node_archive_arch)" || return 1

  local archive_name="node-v${NODE_FALLBACK_VERSION}-${platform}-${arch}.tar.xz"
  local download_url="https://nodejs.org/download/release/v${NODE_FALLBACK_VERSION}/${archive_name}"

  echo "[setup] Installing Node.js v${NODE_FALLBACK_VERSION} to ${NODE_INSTALL_DIR} (no apt-get update)"
  mkdir -p "$NODE_INSTALL_DIR"

  local temp_dir
  temp_dir="$(mktemp -d)"
  local archive_path="$temp_dir/$archive_name"

  download_file "$download_url" "$archive_path"
  tar -xJf "$archive_path" -C "$temp_dir"

  local extracted_dir="$temp_dir/node-v${NODE_FALLBACK_VERSION}-${platform}-${arch}"
  if [[ ! -d "$extracted_dir/bin" ]]; then
    echo "Downloaded archive has unexpected layout: $archive_name" >&2
    rm -rf "$temp_dir"
    return 1
  fi

  local target_dir="$NODE_INSTALL_DIR/node-v${NODE_FALLBACK_VERSION}-${platform}-${arch}"
  rm -rf "$target_dir"
  mkdir -p "$NODE_INSTALL_DIR"
  mv "$extracted_dir" "$target_dir"
  ln -sfn "$target_dir" "$NODE_INSTALL_DIR/current"
  rm -rf "$temp_dir"

  prepend_local_node_path
  if command -v node >/dev/null 2>&1; then
    echo "[setup] Node.js installed: $(node -v)"
  fi
}

install_node_macos() {
  if command -v brew >/dev/null 2>&1; then
    echo "[setup] Installing/upgrading Node.js via Homebrew"
    brew install node
    return
  fi
  echo "Automatic Node.js install on macOS requires Homebrew." >&2
  echo "Install Homebrew first, or install Node.js manually: https://nodejs.org/" >&2
  exit 1
}

install_node_linux_apt() {
  echo "[setup] Installing/upgrading Node.js via apt (without apt-get update)"
  run_privileged apt-get -f install -y || true
  run_privileged apt-get install -y nodejs npm || true
}

install_node_linux_dnf() {
  echo "[setup] Installing/upgrading Node.js 22.x via NodeSource (dnf)"
  curl -fsSL https://rpm.nodesource.com/setup_22.x | run_privileged bash -
  run_privileged dnf install -y nodejs
}

install_node_linux_yum() {
  echo "[setup] Installing/upgrading Node.js 22.x via NodeSource (yum)"
  curl -fsSL https://rpm.nodesource.com/setup_22.x | run_privileged bash -
  run_privileged yum install -y nodejs
}

install_node_linux() {
  if install_node_from_binary_archive; then
    return
  fi

  if command -v apt-get >/dev/null 2>&1; then
    install_node_linux_apt
    return
  fi
  if command -v dnf >/dev/null 2>&1; then
    install_node_linux_dnf
    return
  fi
  if command -v yum >/dev/null 2>&1; then
    install_node_linux_yum
    return
  fi
  if command -v pacman >/dev/null 2>&1; then
    echo "[setup] Installing/upgrading Node.js via pacman"
    run_privileged pacman -Sy --noconfirm nodejs npm
    return
  fi
  if command -v zypper >/dev/null 2>&1; then
    echo "[setup] Installing/upgrading Node.js via zypper"
    run_privileged zypper --non-interactive install nodejs npm
    return
  fi
  echo "Could not detect supported package manager to install Node.js automatically." >&2
  echo "Install Node.js manually: https://nodejs.org/" >&2
  exit 1
}

ensure_node_toolchain() {
  prepend_local_node_path
  if node_version_is_supported && \
    (command -v pnpm >/dev/null 2>&1 || command -v npm >/dev/null 2>&1); then
    return
  fi

  if command -v node >/dev/null 2>&1; then
    print_node_version_mismatch
  else
    echo "[setup] Node.js toolchain is missing. Attempting automatic install..."
  fi

  case "$(uname -s)" in
    Darwin)
      install_node_macos || true
      ;;
    Linux)
      install_node_linux || true
      ;;
    *)
      echo "Unsupported OS for automatic Node.js installation: $(uname -s)" >&2
      echo "Install Node.js manually: https://nodejs.org/" >&2
      exit 1
      ;;
  esac

  prepend_local_node_path

  if ! node_version_is_supported; then
    install_node_from_binary_archive || true
  fi

  if ! node_version_is_supported; then
    print_node_version_mismatch
    echo "Automatic install did not provide required Node.js version." >&2
    echo "Please install Node.js 22 LTS manually and re-run make dev." >&2
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
