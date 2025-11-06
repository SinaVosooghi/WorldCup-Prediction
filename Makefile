.PHONY: help build up down restart logs clean migration seed test

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build: ## Build Docker images
	docker-compose build

up: ## Start all services
	docker-compose up -d

up-dev: ## Start all services in development mode
	docker-compose -f docker-compose.dev.yml up

up-infra: ## Start only infrastructure services (for local debugging)
	docker-compose -f docker-compose.infra.yml up -d

down: ## Stop all services
	docker-compose down

down-infra: ## Stop infrastructure services
	docker-compose -f docker-compose.infra.yml down

restart: ## Restart all services
	docker-compose restart

logs: ## Show logs for all services
	docker-compose logs -f

logs-app: ## Show logs for app service
	docker-compose logs -f app

clean: ## Stop and remove all containers, volumes, and networks
	docker-compose down -v
	docker system prune -f

migration: ## Run database migrations
	docker-compose --profile migration up migration

seed: ## Run database seeder
	docker-compose --profile seed up seed

setup: build migration seed ## Complete setup: build, migrate, and seed
	@echo "Setup complete!"

test: ## Run tests
	docker-compose exec app npm test

test-e2e: ## Run e2e tests
	docker-compose exec app npm run test:e2e

shell: ## Access app container shell
	docker-compose exec app sh

db-shell: ## Access PostgreSQL shell
	docker-compose exec postgres psql -U postgres -d worldcup_predictions

db-shell-infra: ## Access PostgreSQL shell (infra-only setup)
	docker-compose -f docker-compose.infra.yml exec postgres psql -U postgres -d worldcup_predictions

redis-cli: ## Access Redis CLI
	docker-compose exec redis redis-cli

redis-cli-infra: ## Access Redis CLI (infra-only setup)
	docker-compose -f docker-compose.infra.yml exec redis redis-cli

install: ## Install dependencies locally
	npm install

dev: ## Run in development mode locally
	npm run start:dev

dev-debug: ## Run in debug mode locally (port 9229)
	npm run start:debug

local-setup: up-infra install ## Complete local setup: start infra, install deps
	@echo "Waiting for services to be ready..."
	@sleep 5
	@echo "Running migrations..."
	@npm run migration:run
	@echo "Seeding database..."
	@npm run seed
	@echo "Local setup complete! Run 'make dev' to start the app locally."

ps: ## Show running containers
	docker-compose ps

health: ## Check health status of all services
	@echo "Checking health status..."
	@docker-compose ps

