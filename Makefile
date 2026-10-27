.PHONY: help lint test build clean setup doctor

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
	awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

setup: ## Install required tools
	@bash scripts/setup.sh

doctor: ## Run platform diagnostics
	@bash scripts/doctor.sh

lint: ## Run ShellCheck on all scripts
	@find . -type f -name "*.sh" -not -path '*/node_modules/*' -exec shellcheck {} +

test: ## Run tests for all services
	@for dir in services/*/; do \
		service=$$(basename $$dir); \
		if [ -f "$$dir/package.json" ]; then \
			echo "Testing $$service..."; \
			cd "$$dir" && npm test && cd ../..; \
		fi; \
	done

build: ## Build all service Docker images
	@echo "=== Docker Build ==="
	@for dir in services/*/; do \
		service=$$(basename $$dir); \
		if [ -f "$$dir/Dockerfile" ]; then \
			echo "Building $$service..."; \
			DOCKER_BUILDKIT=1 REGISTRY=local ci/build.sh "$$service" dev; \
		fi; \
	done

buildx: ## Build all services with BuildKit
	@echo "=== Docker Buildx ==="
	@for dir in services/*/; do \
		service=$$(basename $$dir); \
		if [ -f "$$dir/Dockerfile" ]; then \
			echo "Building $$service (buildx)..."; \
			ci/docker-buildx.sh "$$service" load; \
		fi; \
	done

sbom: ## Generate SBOM for all services
	@echo "=== SBOM Generation ==="
	@for dir in services/*/; do \
		service=$$(basename $$dir); \
		if [ -f "$$dir/Dockerfile" ]; then \
			echo "SBOM for $$service..."; \
			ci/sbom.sh "$$service"; \
		fi; \
	done

clean: ## Clean build artifacts
	@rm -rf build/ artifacts/
	@echo "Cleaned build/ and artifacts/"

validate: ## Validate all services
	@for dir in services/*/; do \
		service=$$(basename $$dir); \
		if [ -f "$$dir/service.yml" ]; then \
			echo "Validating $$service..."; \
			ci/validate-service.sh "$$service"; \
		fi; \
	done

format: ## Format Terraform files
	@terraform fmt -recursive

env-check: ## Validate environment configuration
	@bash platform/validate-profile.sh
