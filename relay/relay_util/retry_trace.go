package relay_util

import (
	"fmt"
	"time"

	"one-api/common/logmeta"
	"one-api/common/sensitive"
	"one-api/common/utils"

	"github.com/gin-gonic/gin"
)

const retryAttemptsContextKey = "retry_attempts"

type RetryAttempt struct {
	// Sequence 表示第几次尝试，从 1 开始。
	Sequence int `json:"sequence"`
	// ChannelId 表示本次命中的渠道 ID。
	ChannelId int `json:"channel_id"`
	// ChannelName 表示本次命中的渠道名称快照。
	ChannelName string `json:"channel_name"`
	// Duration 表示本次尝试耗时，单位为毫秒。
	Duration int `json:"duration"`
	// StatusCode 表示本次结果状态码；成功通常记 200，无标准状态码时可记 0。
	StatusCode int `json:"status_code"`
	// ErrorCode 表示本次错误码；成功时为空字符串。
	ErrorCode string `json:"error_code"`
	// ErrorType 表示本次错误类型；成功时为空字符串。
	ErrorType string `json:"error_type"`
	// Message 表示本次结果说明；失败时为脱敏后的错误信息，成功时为固定成功文案。
	Message string `json:"message"`
	// Success 表示本次尝试是否成功。
	Success bool `json:"success"`
}

type RetryAttemptInput struct {
	// ChannelId 表示本次命中的渠道 ID。
	ChannelId int
	// ChannelName 表示本次命中的渠道名称快照。
	ChannelName string
	// StartedAt 表示本次尝试的开始时间，用于在同进程内计算耗时。
	StartedAt time.Time
	// StatusCode 表示本次结果状态码；成功通常记 200，无标准状态码时可记 0。
	StatusCode int
	// ErrorCode 表示本次错误码；成功时可为空字符串。
	ErrorCode string
	// ErrorType 表示本次错误类型；成功时可为空字符串。
	ErrorType string
	// Message 表示本次结果说明；失败时传原始错误信息，由函数内部负责脱敏。
	Message string
	// Success 表示本次尝试是否成功。
	Success bool
}

func NormalizeRetryErrorCode(code any) string {
	switch v := code.(type) {
	case string:
		return v
	case nil:
		return ""
	default:
		return fmt.Sprintf("%v", v)
	}
}

func AppendRetryAttempt(c *gin.Context, input RetryAttemptInput) {
	if c == nil {
		return
	}

	attempts, _ := utils.GetGinValue[[]RetryAttempt](c, retryAttemptsContextKey)
	if attempts == nil {
		attempts = make([]RetryAttempt, 0, 1)
	}

	message := input.Message
	if input.Success {
		message = "成功"
	} else {
		message = sensitive.MaskSensitiveInfo(message)
	}

	duration := 0
	if !input.StartedAt.IsZero() {
		duration = int(time.Since(input.StartedAt).Milliseconds())
		if duration < 0 {
			duration = 0
		}
	}

	attempts = append(attempts, RetryAttempt{
		Sequence:    len(attempts) + 1,
		ChannelId:   input.ChannelId,
		ChannelName: input.ChannelName,
		Duration:    duration,
		StatusCode:  input.StatusCode,
		ErrorCode:   input.ErrorCode,
		ErrorType:   input.ErrorType,
		Message:     message,
		Success:     input.Success,
	})

	c.Set(retryAttemptsContextKey, attempts)
}

// BuildRetryTrace 从 gin context 中的 attempts 组装最终 retry_trace。
// 当前 RetryAttempt 仅含值类型字段；若后续新增 map、slice、pointer 等可变引用字段，这里需改为深拷贝或将返回值视为只读。
func BuildRetryTrace(c *gin.Context) map[string]any {
	if c == nil {
		return nil
	}

	attempts, ok := utils.GetGinValue[[]RetryAttempt](c, retryAttemptsContextKey)
	if !ok || len(attempts) <= 1 {
		return nil
	}

	totalDuration := 0
	clonedAttempts := make([]RetryAttempt, 0, len(attempts))
	for _, attempt := range attempts {
		totalDuration += attempt.Duration
		clonedAttempts = append(clonedAttempts, attempt)
	}

	return map[string]any{
		"attempt_count":     len(clonedAttempts),
		"retry_count":       len(clonedAttempts) - 1,
		"total_duration_ms": totalDuration,
		"attempts":          clonedAttempts,
	}
}

func AttachRetryTraceToRequestContext(c *gin.Context) {
	if c == nil || c.Request == nil {
		return
	}

	retryTrace := BuildRetryTrace(c)
	if retryTrace == nil {
		return
	}

	ctx := logmeta.WithRetryTrace(c.Request.Context(), retryTrace)
	c.Request = c.Request.WithContext(ctx)
}
