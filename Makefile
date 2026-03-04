SHELL := /bin/bash
.DEFAULT_GOAL := help

.PHONY: help setup dev

help:
	@echo "Operator Helper commands:"
	@echo "  make setup"
	@echo "    Install backend/frontend dependencies."
	@echo "  make dev"
	@echo "    Run backend + frontend with defaults."
	@echo "  make dev -- --backend-port 9000 --frontend-port 5174"
	@echo "    Run with custom ports/flags."
	@echo ""
	@echo "Also available directly:"
	@echo "  ./scripts/dev.sh --help"

setup:
	@./scripts/dev.sh --setup-only

dev:
	@./scripts/dev.sh $(filter-out $@,$(MAKECMDGOALS))

# Allows passing extra args after `--`, e.g.:
# make dev -- --backend-port 9000 --frontend-port 5174
%:
	@:
