package middleware

import (
	"fmt"
	"net/http"
	"one-api/common/limit"
	"one-api/model"
	"os"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	LIMIT_KEY               = "api-limiter:%d"
	INTERNAL                = 1 * time.Minute
	RATE_LIMIT_EXCEEDED_MSG = "您的速率达到上限，请稍后再试。"
	SERVER_ERROR_MSG        = "Server error"
)

func DynamicRedisRateLimiter() gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.GetInt("id")
		userGroup := c.GetString("group")

		// API速率限制
		limiter := model.GlobalUserGroupRatio.GetAPILimiter(userGroup)
		if limiter == nil {
			abortWithMessage(c, http.StatusForbidden, "API requests are not allowed")
			return
		}
		key := fmt.Sprintf(LIMIT_KEY, userID)

		if !limiter.Allow(key) {
			abortWithMessage(c, http.StatusTooManyRequests, RATE_LIMIT_EXCEEDED_MSG)
			return
		}

		// 更新全局 RPM 计数器（同步调用，Redis 操作很快）
		// #region agent log
		debugLog := fmt.Sprintf(`{"location":"api-limit.go:DynamicRedisRateLimiter","message":"Before IncrGlobalRPM","data":{"path":"%s","method":"%s","userID":%d},"timestamp":%d,"sessionId":"debug-session","hypothesisId":"A,D"}`, c.Request.URL.Path, c.Request.Method, userID, time.Now().UnixMilli())
		if f, err := os.OpenFile("/Users/yukig/GolandProjects/one-hub/.cursor/debug.log", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644); err == nil { f.WriteString(debugLog + "\n"); f.Close() }
		// #endregion
		limit.IncrGlobalRPM()

		c.Next()
	}
}
