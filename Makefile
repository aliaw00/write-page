.PHONY: build-frontend build-backend test-backend docker-up docker-down clean help

help:
	@echo "Available commands:"
	@echo "  make build-frontend - Compile the React production assets"
	@echo "  make build-backend  - Compile the Go backend binary"
	@echo "  make test-backend   - Run the Go backend unit/integration tests"
	@echo "  make docker-up      - Build and spin up the Docker container ecosystem"
	@echo "  make docker-down    - Spin down the Docker container ecosystem"
	@echo "  make clean          - Remove built binaries and cached files"

build-frontend:
	cd frontend && npm run build

build-backend:
	cd backend && go build -o main .

test-backend:
	cd backend && go test -v ./...

docker-up:
	docker-compose up --build -d

docker-down:
	docker-compose down

clean:
	rm -f backend/main
	rm -rf frontend/dist
	rm -f backend/minimal_write.db
