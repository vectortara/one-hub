package limit

import (
	"context"
	_ "embed"
	"fmt"
	"one-api/common/config"
	"one-api/common/logger"
	"one-api/common/redis"
	"strconv"
	"time"
)

const (
	tpmUserCounterFormat = "{tpm-counter:%d}:counter"
	tpmUserLastMinFormat = "{tpm-counter:%d}:lastmin"
	tpmGlobalCounterKey  = "{tpm-counter:global}:counter"
	tpmGlobalLastMinKey  = "{tpm-counter:global}:lastmin"
)

var (
	//go:embed tpm_user_script.lua
	tpmUserLuaScript string
	tpmUserScript    = redis.NewScript(tpmUserLuaScript)

	//go:embed tpm_global_script.lua
	tpmGlobalLuaScript string
	tpmGlobalScript    = redis.NewScript(tpmGlobalLuaScript)

	//go:embed tpmgetscript.lua
	tpmGetLuaScript string
	tpmGetScript    = redis.NewScript(tpmGetLuaScript)
)

// RecordTPM 记录用户的 token 消耗（同时更新全局计数器）
// 注意：为兼容 Redis Cluster，用户和全局使用两次独立调用
func RecordTPM(userId int, tokens int) error {
	if !config.RedisEnabled || tokens <= 0 {
		return nil
	}

	now := strconv.FormatInt(time.Now().Unix(), 10)
	tokensStr := strconv.Itoa(tokens)

	// 1. 更新用户 TPM（同 hash tag 的 2 个 key）
	userCounterKey := fmt.Sprintf(tpmUserCounterFormat, userId)
	userLastMinKey := fmt.Sprintf(tpmUserLastMinFormat, userId)

	_, err := redis.ScriptRunCtx(context.Background(),
		tpmUserScript,
		[]string{userCounterKey, userLastMinKey},
		now, tokensStr,
	)
	if err != nil {
		logger.SysError(fmt.Sprintf("failed to record user TPM for user %d: %s", userId, err))
		return err // 用户更新失败，直接返回，不继续全局调用
	}

	// 2. 更新全局 TPM（同 hash tag 的 2 个 key）
	_, err = redis.ScriptRunCtx(context.Background(),
		tpmGlobalScript,
		[]string{tpmGlobalCounterKey, tpmGlobalLastMinKey},
		now, tokensStr,
	)
	if err != nil {
		logger.SysError(fmt.Sprintf("failed to record global TPM: %s", err))
	}

	return err
}

// GetCurrentTPM 获取用户当前分钟的 token 消耗
func GetCurrentTPM(userId int) (int, error) {
	if !config.RedisEnabled {
		return 0, nil
	}

	userCounterKey := fmt.Sprintf(tpmUserCounterFormat, userId)
	userLastMinKey := fmt.Sprintf(tpmUserLastMinFormat, userId)

	result, err := redis.ScriptRunCtx(context.Background(),
		tpmGetScript,
		[]string{userCounterKey, userLastMinKey},
		strconv.FormatInt(time.Now().Unix(), 10),
	)
	if err != nil {
		return 0, err
	}
	if result == nil {
		return 0, nil
	}

	// 统一类型分支转换（TokenLimiter 风格）
	var count int
	switch v := result.(type) {
	case int64:
		count = int(v)
	case int:
		count = v
	default:
		logger.SysError(fmt.Sprintf("unexpected type for user TPM result: %T", result))
		return 0, fmt.Errorf("无法转换用户TPM结果: %v", result)
	}
	return count, nil
}

// GetGlobalTPM 获取全局当前分钟的 token 消耗
func GetGlobalTPM() (int, error) {
	if !config.RedisEnabled {
		return 0, nil
	}

	result, err := redis.ScriptRunCtx(context.Background(),
		tpmGetScript,
		[]string{tpmGlobalCounterKey, tpmGlobalLastMinKey},
		strconv.FormatInt(time.Now().Unix(), 10),
	)
	if err != nil {
		return 0, err
	}
	if result == nil {
		return 0, nil
	}

	// 统一类型分支转换（TokenLimiter 风格）
	var count int
	switch v := result.(type) {
	case int64:
		count = int(v)
	case int:
		count = v
	default:
		logger.SysError(fmt.Sprintf("unexpected type for global TPM result: %T", result))
		return 0, fmt.Errorf("无法转换全局TPM结果: %v", result)
	}
	return count, nil
}
