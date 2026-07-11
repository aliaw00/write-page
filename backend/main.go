package main

import (
	"database/sql"
	"log"
	"net/http"
	"os"
	"path/filepath"

	_ "github.com/mattn/go-sqlite3"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret != "" {
		jwtKey = []byte(jwtSecret)
	} else {
		log.Println("WARNING: JWT_SECRET environment variable is not set. Using default development key.")
	}


	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "./minimal_write.db"
	}

	// Ensure DB directory exists
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		log.Fatalf("Failed to create database directory: %v", err)
	}

	// Open DB connection
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	// Initialize schema
	if err := initSchema(db); err != nil {
		log.Fatalf("Failed to initialize schema: %v", err)
	}

	env := &Env{db: db}

	// Set up router
	mux := http.NewServeMux()
	
	// Public routes
	mux.HandleFunc("/api/auth/signup", env.HandleSignup)
	mux.HandleFunc("/api/auth/login", env.HandleLogin)
	mux.HandleFunc("/api/shared", env.HandleGetShared)

	// Protected routes
	mux.Handle("/api/sync", AuthMiddleware(http.HandlerFunc(env.HandleSync)))
	mux.Handle("/api/share", AuthMiddleware(http.HandlerFunc(env.HandleShare)))

	// Wrap in global middlewares
	handler := CORSMiddleware(LoggingMiddleware(mux))

	log.Printf("Server starting on port %s...", port)
	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}

func initSchema(db *sql.DB) error {
	usersTable := `
	CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		username TEXT UNIQUE NOT NULL,
		password_hash TEXT NOT NULL,
		created_at INTEGER NOT NULL
	);`

	documentsTable := `
	CREATE TABLE IF NOT EXISTS documents (
		id TEXT PRIMARY KEY,
		user_id INTEGER NOT NULL,
		title TEXT NOT NULL,
		content TEXT NOT NULL,
		updated_at INTEGER NOT NULL,
		created_at INTEGER NOT NULL,
		is_deleted INTEGER DEFAULT 0,
		share_id TEXT UNIQUE,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
	);`

	indices := []string{
		`CREATE INDEX IF NOT EXISTS idx_documents_user_updated ON documents(user_id, updated_at);`,
		`CREATE INDEX IF NOT EXISTS idx_documents_share ON documents(share_id);`,
	}

	if _, err := db.Exec(usersTable); err != nil {
		return err
	}
	if _, err := db.Exec(documentsTable); err != nil {
		return err
	}
	for _, index := range indices {
		if _, err := db.Exec(index); err != nil {
			return err
		}
	}

	return nil
}
