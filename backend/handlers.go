package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

type Env struct {
	db *sql.DB
}

func (env *Env) HandleSignup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var req AuthRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Username == "" || req.Password == "" {
		http.Error(w, `{"error":"username and password are required"}`, http.StatusBadRequest)
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, `{"error":"failed to hash password"}`, http.StatusInternalServerError)
		return
	}

	res, err := env.db.Exec("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
		req.Username, string(hash), time.Now().Unix())
	if err != nil {
		// SQLite unique constraint error
		http.Error(w, `{"error":"username already exists"}`, http.StatusConflict)
		return
	}

	userID, err := res.LastInsertId()
	if err != nil {
		http.Error(w, `{"error":"failed to register user"}`, http.StatusInternalServerError)
		return
	}

	// Generate JWT
	tokenStr, err := generateToken(userID, req.Username)
	if err != nil {
		http.Error(w, `{"error":"failed to generate token"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(AuthResponse{
		Token: tokenStr,
		User: User{
			ID:       userID,
			Username: req.Username,
		},
	})
}

func (env *Env) HandleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var req AuthRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	var user User
	err := env.db.QueryRow("SELECT id, username, password_hash FROM users WHERE username = ?", req.Username).
		Scan(&user.ID, &user.Username, &user.PasswordHash)
	if err == sql.ErrNoRows {
		http.Error(w, `{"error":"invalid username or password"}`, http.StatusUnauthorized)
		return
	} else if err != nil {
		http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		http.Error(w, `{"error":"invalid username or password"}`, http.StatusUnauthorized)
		return
	}

	tokenStr, err := generateToken(user.ID, user.Username)
	if err != nil {
		http.Error(w, `{"error":"failed to generate token"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(AuthResponse{
		Token: tokenStr,
		User: User{
			ID:       user.ID,
			Username: user.Username,
		},
	})
}

func (env *Env) HandleSync(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	userID, err := GetUserID(r.Context())
	if err != nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	// Read last sync time from query param (optional, defaults to 0)
	lastSyncTimeStr := r.URL.Query().Get("last_sync_time")
	var clientLastSync int64 = 0
	if lastSyncTimeStr != "" {
		if val, err := strconv.ParseInt(lastSyncTimeStr, 10, 64); err == nil {
			clientLastSync = val
		}
	}

	var req SyncRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	serverTime := time.Now().UnixNano() / int64(time.Millisecond)

	tx, err := env.db.Begin()
	if err != nil {
		http.Error(w, `{"error":"failed to start transaction"}`, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	for _, doc := range req.Documents {
		var dbUpdatedAt int64
		var dbUserID int64
		var exists bool

		err := tx.QueryRow("SELECT user_id, updated_at FROM documents WHERE id = ?", doc.ID).
			Scan(&dbUserID, &dbUpdatedAt)
		if err == sql.ErrNoRows {
			exists = false
		} else if err != nil {
			http.Error(w, `{"error":"database error during check"}`, http.StatusInternalServerError)
			return
		} else {
			exists = true
		}

		if exists {
			if dbUserID != userID {
				// Document belongs to someone else! Skip it.
				continue
			}
			// Compare updated_at
			if doc.UpdatedAt > dbUpdatedAt {
				// Client has newer version, update server
				_, err = tx.Exec(
					"UPDATE documents SET title = ?, content = ?, updated_at = ?, is_deleted = ? WHERE id = ?",
					doc.Title, doc.Content, doc.UpdatedAt, doc.IsDeleted, doc.ID,
				)
				if err != nil {
					log.Printf("Sync error updating document: %v", err)
					http.Error(w, `{"error":"database error during update"}`, http.StatusInternalServerError)
					return
				}
			}
		} else {
			// Insert new document
			_, err = tx.Exec(
				"INSERT INTO documents (id, user_id, title, content, updated_at, created_at, is_deleted, share_id) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)",
				doc.ID, userID, doc.Title, doc.Content, doc.UpdatedAt, doc.CreatedAt, doc.IsDeleted,
			)
			if err != nil {
				log.Printf("Sync error inserting document: %v", err)
				http.Error(w, `{"error":"database error during insert"}`, http.StatusInternalServerError)
				return
			}
		}
	}

	if err := tx.Commit(); err != nil {
		http.Error(w, `{"error":"failed to commit transaction"}`, http.StatusInternalServerError)
		return
	}

	// Fetch all documents updated since clientLastSync (excluding the ones the client already sent if they have the same or older timestamp,
	// but the simplest rule: fetch all user documents where updated_at > clientLastSync).
	rows, err := env.db.Query(
		"SELECT id, title, content, updated_at, created_at, is_deleted, COALESCE(share_id, '') FROM documents WHERE user_id = ? AND updated_at > ?",
		userID, clientLastSync,
	)
	if err != nil {
		http.Error(w, `{"error":"database error during fetch"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var updates []Document
	for rows.Next() {
		var doc Document
		err := rows.Scan(&doc.ID, &doc.Title, &doc.Content, &doc.UpdatedAt, &doc.CreatedAt, &doc.IsDeleted, &doc.ShareID)
		if err != nil {
			http.Error(w, `{"error":"database error during scan"}`, http.StatusInternalServerError)
			return
		}
		updates = append(updates, doc)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(SyncResponse{
		Updates:    updates,
		ServerTime: serverTime,
	})
}

func (env *Env) HandleShare(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	userID, err := GetUserID(r.Context())
	if err != nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req struct {
		DocumentID string `json:"document_id"`
		Share      bool   `json:"share"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	var dbUserID int64
	var currentShareID sql.NullString
	err = env.db.QueryRow("SELECT user_id, share_id FROM documents WHERE id = ?", req.DocumentID).
		Scan(&dbUserID, &currentShareID)
	if err == sql.ErrNoRows {
		http.Error(w, `{"error":"document not found"}`, http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
		return
	}

	if dbUserID != userID {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	var nextShareID interface{} = nil
	if req.Share {
		if currentShareID.Valid && currentShareID.String != "" {
			nextShareID = currentShareID.String
		} else {
			// Generate share ID
			bytes := make([]byte, 16)
			if _, err := rand.Read(bytes); err != nil {
				http.Error(w, `{"error":"failed to generate share link"}`, http.StatusInternalServerError)
				return
			}
			nextShareID = hex.EncodeToString(bytes)
		}
	}

	now := time.Now().UnixNano() / int64(time.Millisecond)
	_, err = env.db.Exec("UPDATE documents SET share_id = ?, updated_at = ? WHERE id = ?", nextShareID, now, req.DocumentID)
	if err != nil {
		http.Error(w, `{"error":"failed to update share status"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	var shareIDStr string
	if s, ok := nextShareID.(string); ok {
		shareIDStr = s
	}
	json.NewEncoder(w).Encode(ShareResponse{
		ShareID: shareIDStr,
	})
}

func (env *Env) HandleGetShared(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	shareID := r.URL.Query().Get("share_id")
	if shareID == "" {
		http.Error(w, `{"error":"share_id is required"}`, http.StatusBadRequest)
		return
	}

	var doc Document
	err := env.db.QueryRow(
		"SELECT id, title, content, updated_at, created_at FROM documents WHERE share_id = ? AND is_deleted = 0",
		shareID,
	).Scan(&doc.ID, &doc.Title, &doc.Content, &doc.UpdatedAt, &doc.CreatedAt)

	if err == sql.ErrNoRows {
		http.Error(w, `{"error":"shared document not found or sharing disabled"}`, http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(doc)
}

func generateToken(userID int64, username string) (string, error) {
	expirationTime := time.Now().Add(72 * time.Hour)
	claims := &Claims{
		UserID:   userID,
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtKey)
}


