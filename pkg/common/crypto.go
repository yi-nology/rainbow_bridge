package common

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"io"

	"golang.org/x/crypto/bcrypt"
)

// HashPassword 使用 bcrypt 对密码进行哈希
func HashPassword(password string) (string, error) {
	hashedBytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hashedBytes), nil
}

// CheckPasswordHash 验证密码是否与哈希匹配
func CheckPasswordHash(password, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}

// EncryptAES 使用 AES 加密数据
func EncryptAES(plaintext, key string) (string, error) {
	// 创建 AES 加密器
	block, err := aes.NewCipher([]byte(key))
	if err != nil {
		return "", err
	}

	// 创建 GCM 模式
	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	// 创建随机 nonce
	nonce := make([]byte, aesGCM.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}

	// 加密数据
	ciphertext := aesGCM.Seal(nonce, nonce, []byte(plaintext), nil)

	// 编码为 base64
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// DecryptAES 使用 AES 解密数据
func DecryptAES(ciphertext, key string) (string, error) {
	// 解码 base64
	ciphertextBytes, err := base64.StdEncoding.DecodeString(ciphertext)
	if err != nil {
		return "", err
	}

	// 创建 AES 加密器
	block, err := aes.NewCipher([]byte(key))
	if err != nil {
		return "", err
	}

	// 创建 GCM 模式
	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	// 检查数据长度
	if len(ciphertextBytes) < aesGCM.NonceSize() {
		return "", errors.New("ciphertext too short")
	}

	// 分离 nonce 和密文
	nonce, ciphertextBytes := ciphertextBytes[:aesGCM.NonceSize()], ciphertextBytes[aesGCM.NonceSize():]

	// 解密数据
	plaintext, err := aesGCM.Open(nil, nonce, ciphertextBytes, nil)
	if err != nil {
		return "", err
	}

	return string(plaintext), nil
}

// GenerateRandomKey 生成随机密钥
func GenerateRandomKey(length int) (string, error) {
	key := make([]byte, length)
	if _, err := io.ReadFull(rand.Reader, key); err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(key), nil
}
