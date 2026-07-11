package main

import (
	"github.com/golang-jwt/jwt/v5"
)

type User struct {
	ID           int64  `json:"id"`
	Username     string `json:"username"`
	PasswordHash string `json:"-"`
}

type Document struct {
	ID        string `json:"id"`
	UserID    int64  `json:"user_id,omitempty"`
	Title     string `json:"title"`
	Content   string `json:"content"`
	UpdatedAt int64  `json:"updated_at"` // Unix millisecond timestamp
	CreatedAt int64  `json:"created_at"` // Unix millisecond timestamp
	IsDeleted bool   `json:"is_deleted"` // Soft delete for tombstoning
	ShareID   string `json:"share_id,omitempty"`
}

type AuthRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type AuthResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

type SyncRequest struct {
	Documents []Document `json:"documents"`
}

type SyncResponse struct {
	Updates    []Document `json:"updates"`
	ServerTime int64      `json:"server_time"`
}

type ShareResponse struct {
	ShareID string `json:"share_id"`
}

type Claims struct {
	UserID   int64  `json:"user_id"`
	Username string `json:"username"`
	jwt.RegisteredClaims
}
