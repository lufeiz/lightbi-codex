package middleware

import (
	"crypto/rand"
	"encoding/hex"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	RequestIDHeader = "X-Request-ID"
	requestIDKey    = "requestID"
)

func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		requestID := strings.TrimSpace(c.GetHeader(RequestIDHeader))
		if requestID == "" {
			requestID = generateRequestID()
		}
		c.Set(requestIDKey, requestID)
		c.Writer.Header().Set(RequestIDHeader, requestID)
		c.Next()
	}
}

func CurrentRequestID(c *gin.Context) string {
	value, ok := c.Get(requestIDKey)
	if !ok {
		return ""
	}
	requestID, _ := value.(string)
	return requestID
}

func generateRequestID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err == nil {
		return hex.EncodeToString(b[:])
	}
	return strconv.FormatInt(time.Now().UnixNano(), 36)
}
