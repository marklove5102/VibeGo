package middleware

import (
	"crypto/subtle"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

func Auth(key string) gin.HandlerFunc {
	keyBytes := []byte(key)
	return func(c *gin.Context) {
		if key == "" {
			c.Next()
			return
		}

		reqKey := c.GetHeader("Authorization")
		if reqKey != "" {
			reqKey = strings.TrimPrefix(reqKey, "Bearer ")
		} else {
			reqKey = c.Query("key")
		}

		if subtle.ConstantTimeCompare([]byte(reqKey), keyBytes) != 1 {
			log.Warn().
				Str("ip", c.ClientIP()).
				Str("path", c.Request.URL.Path).
				Msg("Unauthorized access attempt")
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			c.Abort()
			return
		}

		c.Next()
	}
}
