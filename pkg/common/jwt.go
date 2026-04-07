package common

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// JWTClaims 定义 JWT 的声明结构
type JWTClaims struct {
	UserID   int    `json:"user_id"`
	Username string `json:"username"`
	Role     string `json:"role"`
	jwt.RegisteredClaims
}

// JWTConfig JWT 配置
type JWTConfig struct {
	SecretKey     string
	ExpireHours   int
	RefreshHours  int
}

// NewJWTConfig 创建 JWT 配置
func NewJWTConfig(secretKey string, expireHours, refreshHours int) *JWTConfig {
	return &JWTConfig{
		SecretKey:     secretKey,
		ExpireHours:   expireHours,
		RefreshHours:  refreshHours,
	}
}

// GenerateToken 生成 JWT token
func (c *JWTConfig) GenerateToken(userID int, username, role string) (string, error) {
	// 设置过期时间
	expireTime := time.Now().Add(time.Duration(c.ExpireHours) * time.Hour)
	
	// 创建声明
	claims := JWTClaims{
		UserID:   userID,
		Username: username,
		Role:     role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expireTime),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Subject:   username,
		},
	}
	
	// 创建 token
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	
	// 签名 token
	tokenString, err := token.SignedString([]byte(c.SecretKey))
	if err != nil {
		return "", err
	}
	
	return tokenString, nil
}

// ValidateToken 验证 JWT token
func (c *JWTConfig) ValidateToken(tokenString string) (*JWTClaims, error) {
	// 解析 token
	token, err := jwt.ParseWithClaims(tokenString, &JWTClaims{}, func(token *jwt.Token) (interface{}, error) {
		// 验证签名方法
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(c.SecretKey), nil
	})
	
	if err != nil {
		return nil, err
	}
	
	// 验证 token
	if claims, ok := token.Claims.(*JWTClaims); ok && token.Valid {
		return claims, nil
	}
	
	return nil, errors.New("invalid token")
}

// RefreshToken 刷新 JWT token
func (c *JWTConfig) RefreshToken(tokenString string) (string, error) {
	// 验证原 token
	claims, err := c.ValidateToken(tokenString)
	if err != nil {
		return "", err
	}
	
	// 生成新 token
	return c.GenerateToken(claims.UserID, claims.Username, claims.Role)
}
