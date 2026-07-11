package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

func setupTestDB(t *testing.T) *sql.DB {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("failed to open in-memory db: %v", err)
	}

	if err := initSchema(db); err != nil {
		db.Close()
		t.Fatalf("failed to init schema: %v", err)
	}

	return db
}

func TestSignupAndLoginFlow(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	env := &Env{db: db}

	// 1. Test Signup success
	signupPayload := AuthRequest{
		Username: "testuser",
		Password: "password123",
	}
	body, _ := json.Marshal(signupPayload)

	req, _ := http.NewRequest(http.MethodPost, "/api/auth/signup", bytes.NewBuffer(body))
	w := httptest.NewRecorder()

	env.HandleSignup(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected signup status OK, got %d, body: %s", w.Code, w.Body.String())
	}

	var signupRes AuthResponse
	if err := json.NewDecoder(w.Body).Decode(&signupRes); err != nil {
		t.Fatalf("failed to decode signup response: %v", err)
	}

	if signupRes.Token == "" {
		t.Error("expected JWT token in signup response, got empty string")
	}

	if signupRes.User.Username != "testuser" {
		t.Errorf("expected username testuser, got %s", signupRes.User.Username)
	}

	// 2. Test Signup duplicate conflict
	wDuplicate := httptest.NewRecorder()
	reqDuplicate, _ := http.NewRequest(http.MethodPost, "/api/auth/signup", bytes.NewBuffer(body))
	env.HandleSignup(wDuplicate, reqDuplicate)

	if wDuplicate.Code != http.StatusConflict {
		t.Errorf("expected signup duplicate conflict status 409, got %d", wDuplicate.Code)
	}

	// 3. Test Login Success
	loginPayload := AuthRequest{
		Username: "testuser",
		Password: "password123",
	}
	loginBody, _ := json.Marshal(loginPayload)

	reqLogin, _ := http.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBuffer(loginBody))
	wLogin := httptest.NewRecorder()

	env.HandleLogin(wLogin, reqLogin)

	if wLogin.Code != http.StatusOK {
		t.Errorf("expected login status OK, got %d, body: %s", wLogin.Code, wLogin.Body.String())
	}

	var loginRes AuthResponse
	if err := json.NewDecoder(wLogin.Body).Decode(&loginRes); err != nil {
		t.Fatalf("failed to decode login response: %v", err)
	}

	if loginRes.Token == "" {
		t.Error("expected JWT token in login response, got empty string")
	}

	// 4. Test Login Failure (wrong password)
	badLoginPayload := AuthRequest{
		Username: "testuser",
		Password: "wrongpassword",
	}
	badLoginBody, _ := json.Marshal(badLoginPayload)

	reqBadLogin, _ := http.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBuffer(badLoginBody))
	wBadLogin := httptest.NewRecorder()

	env.HandleLogin(wBadLogin, reqBadLogin)

	if wBadLogin.Code != http.StatusUnauthorized {
		t.Errorf("expected login failure status 401, got %d", wBadLogin.Code)
	}
}
