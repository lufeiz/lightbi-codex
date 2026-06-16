package middleware

import (
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type rateLimitBucket struct {
	count     int
	resetAt   time.Time
	updatedAt time.Time
}

func RateLimit(name string, maxRequests int, window time.Duration, keyFunc func(*gin.Context) string) gin.HandlerFunc {
	if maxRequests <= 0 {
		maxRequests = 60
	}
	if window <= 0 {
		window = time.Minute
	}
	var mu sync.Mutex
	buckets := map[string]rateLimitBucket{}

	return func(c *gin.Context) {
		now := time.Now()
		key := name + ":" + keyFunc(c)
		mu.Lock()
		for bucketKey, bucket := range buckets {
			if now.Sub(bucket.updatedAt) > 2*window {
				delete(buckets, bucketKey)
			}
		}
		bucket := buckets[key]
		if bucket.resetAt.IsZero() || now.After(bucket.resetAt) {
			bucket = rateLimitBucket{resetAt: now.Add(window)}
		}
		bucket.count++
		bucket.updatedAt = now
		buckets[key] = bucket
		limited := bucket.count > maxRequests
		retryAfter := int(time.Until(bucket.resetAt).Seconds())
		mu.Unlock()

		if limited {
			c.Header("Retry-After", fmt.Sprintf("%d", max(retryAfter, 1)))
			fail(c, http.StatusTooManyRequests, "rate limit exceeded")
			c.Abort()
			return
		}
		c.Next()
	}
}

func RateLimitIPKey(c *gin.Context) string {
	return c.ClientIP()
}

func RateLimitUserOrIPKey(c *gin.Context) string {
	if user, ok := CurrentUser(c); ok {
		return fmt.Sprintf("user:%d", user.ID)
	}
	return "ip:" + c.ClientIP()
}
