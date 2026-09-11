.PHONY: setup install up down build build-ssr dev logs shell console migrate import vapid-keys ranked-day

# First-time setup: install deps, build images, start containers
setup: install build up

install:
	cd backend && composer install
	cd frontend && npm install

# Start containers without rebuild (daily use)
up:
	docker compose up -d

down:
	docker compose down

# Rebuild Docker images (only needed when Dockerfiles or base deps change)
build:
	docker compose build

# Rebuild Vite SSR bundle and restart ssr container
build-ssr:
	cd frontend && npm run build:ssr
	docker compose restart ssr

# Start Vite dev server with HMR (run alongside `make up`)
dev:
	cd frontend && npm run dev

logs:
	docker compose logs -f

# Open shell in php container
shell:
	docker compose exec php bash

# Run Symfony console command: make console cmd="cache:clear"
console:
	docker compose exec php php bin/console $(cmd)

# Apply database migrations
migrate:
	docker compose exec php php bin/console doctrine:migrations:migrate --no-interaction

# Trigger the start.gg import manually in the foreground (background import is
# started from /admin). Requires start.gg to be connected first.
import:
	docker compose exec php php bin/console app:import

# Generate the VAPID keypair for web push. Copy the output into the root
# .env (local) or the server environment (production) — one time only.
vapid-keys:
	docker compose exec php php bin/console app:push:vapid-keys

# Show the current Slippi Free Ranked Day window without sending anything
# (the cron job runs the same command without --dry-run).
ranked-day:
	docker compose exec php php bin/console app:push:ranked-day --dry-run
