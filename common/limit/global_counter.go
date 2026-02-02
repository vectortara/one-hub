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
	globalRPMCounterKey = "{global-rpm}:counter"
	globalRPMLastMinKey = "{global-rpm}:lastmin"
)

var (
	//go:embed globalrpmscript.lua
	globalRPMLuaScript string
	globalRPMScript    = redis.NewScript(globalRPMLuaScript)

	//go:embed globalrpmgetscript.lua
	globalRPMGetLuaScript string
	globalRPMGetScript    = redis.NewScript(globalRPMGetLuaScript)
)

// IncrGlobalRPM 增加全局 RPM 计数
func IncrGlobalRPM() {
	if !config.RedisEnabled {
		return
	}

	_, err := redis.ScriptRunCtx(context.Background(),
		globalRPMScript,
		[]string{globalRPMCounterKey, globalRPMLastMinKey},
		strconv.FormatInt(time.Now().Unix(), 10),
	)
	if err != nil {
		logger.SysError(fmt.Sprintf("failed to incr global RPM: %s", err))
	}
}

// GetGlobalRPM 获取全局实时 RPM
func GetGlobalRPM() (int, error) {
	if !config.RedisEnabled {
		return 0, nil
	}

	result, err := redis.ScriptRunCtx(context.Background(),
		globalRPMGetScript,
		[]string{globalRPMCounterKey, globalRPMLastMinKey},
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
		logger.SysError(fmt.Sprintf("unexpected type for global RPM result: %T", result))
		return 0, fmt.Errorf("无法转换全局RPM结果: %v", result)
	}
	return count, nil
}
