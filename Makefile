SHELL := /bin/bash
.DEFAULT_GOAL := help

.PHONY: help setup dev update

help:
	@echo "Operator Helper commands:"
	@echo "  make setup"
	@echo "    Install backend/frontend dependencies."
	@echo "  make dev"
	@echo "    Run backend + frontend with defaults."
	@echo "  make dev -- --backend-port 9000 --frontend-port 5174"
	@echo "    Run with custom ports/flags."
	@echo "  make update"
	@echo "    Fast update from git + clean local frontend artifacts."
	@echo ""
	@echo "Also available directly:"
	@echo "  ./scripts/dev.sh --help"

setup:
	@./scripts/dev.sh --setup-only

dev:
	@./scripts/dev.sh $(filter-out $@,$(MAKECMDGOALS))

update:
	@echo "[update] Cleaning local frontend/build artifacts..."
	@rm -rf frontend/node_modules frontend/dist frontend/.vite
	@rm -f frontend/package-lock.json frontend/npm-shrinkwrap.json
	@find service -type d -name "__pycache__" -prune -exec rm -rf {} +
	@git fetch --all --prune
	@git pull --rebase --autostash $(filter-out $@,$(MAKECMDGOALS))

# Allows passing extra args after `--`, e.g.:
# make dev -- --backend-port 9000 --frontend-port 5174
%:
	@:
