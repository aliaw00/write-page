# Build stage
FROM golang:1.21-bookworm AS builder

WORKDIR /app

# Copy go.mod and go.sum files
COPY go.mod ./
# Note: we will download packages during build since go.sum might not be fully populated yet

# Copy the source code
COPY . .

# Build the application with CGO enabled (required for sqlite3)
RUN CGO_ENABLED=1 GOOS=linux go build -o main .

# Run stage
FROM debian:bookworm-slim

WORKDIR /app

# Install sqlite runtime dependencies if needed (usually libc6 is enough)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy binary from builder
COPY --from=builder /app/main .

EXPOSE 8080

ENV PORT=8080
ENV DB_PATH=/app/data/minimal_write.db

# Run the binary
CMD ["./main"]
