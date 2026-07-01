# GarageOS developer tasks.
#
# Prerequisites: Docker, and a Python venv at backend/.venv with requirements installed.
# PYTHON defaults to the Windows venv path; on Linux/CI/mac override it:
#     make demo PYTHON=.venv/bin/python
#
# NOTE: `make` is not installed on stock Windows. On Windows/git-bash use the
# equivalent one-command script:  bash scripts/demo.sh

PYTHON ?= .venv/Scripts/python.exe
COMPOSE = docker compose
BACKEND = cd backend &&

.PHONY: help up down reset migrate seed seed-fresh demo dev verify health ps logs

help:  ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

up:  ## Start Postgres + Redis and wait until healthy
	$(COMPOSE) up -d --wait postgres redis

down:  ## Stop all services (keep data)
	$(COMPOSE) down

reset:  ## Destroy volumes and recreate DB + Redis (DATA LOSS)
	$(COMPOSE) down -v
	$(COMPOSE) up -d --wait postgres redis

migrate:  ## Apply database migrations
	$(BACKEND) $(PYTHON) -m alembic upgrade head

seed:  ## Seed demo data (idempotent)
	$(BACKEND) $(PYTHON) -m app.seeds.demo

seed-fresh:  ## Wipe tenant demo data and reseed
	$(BACKEND) $(PYTHON) -m app.seeds.demo --fresh

demo: reset migrate seed-fresh  ## One command: fresh, fully-populated GarageOS
	@echo ""
	@echo "GarageOS demo ready. Start the API with:  make dev"

dev:  ## Run the API with autoreload
	$(BACKEND) $(PYTHON) -m uvicorn app.main:app --reload

verify:  ## Verify multi-tenant data isolation
	$(BACKEND) $(PYTHON) -m scripts.verify_tenant_isolation

health:  ## Probe the running API's readiness endpoint
	curl -s localhost:8000/ready

ps:  ## Show container status
	$(COMPOSE) ps

logs:  ## Tail service logs
	$(COMPOSE) logs -f
