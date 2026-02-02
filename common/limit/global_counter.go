package limit

import (
	"context"
	_ "embed"
	"fmt"
	"one-api/common/config"
	"one-api/common/logger"
	"one-api/common/redis"
	"os"
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

	now := time.Now().Unix()
	// #region agent log
	debugLog := fmt.Sprintf(`{"location":"global_counter.go:IncrGlobalRPM","message":"IncrGlobalRPM called","data":{"now":%d,"current_minute":%d},"timestamp":%d,"sessionId":"debug-session","hypothesisId":"A,B"}`, now, now-(now%60), time.Now().UnixMilli())
	if f, err := os.OpenFile("/Users/yukig/GolandProjects/one-hub/.cursor/debug.log", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644); err == nil { f.WriteString(debugLog + "\n"); f.Close() }
	// #endregion

	result, err := redis.ScriptRunCtx(context.Background(),
		globalRPMScript,
		[]string{globalRPMCounterKey, globalRPMLastMinKey},
		strconv.FormatInt(now, 10),
	)
	if err != nil {
		logger.SysError(fmt.Sprintf("failed to incr global RPM: %s", err))
	}

	// #region agent log
	debugLog2 := fmt.Sprintf(`{"location":"global_counter.go:IncrGlobalRPM:result","message":"IncrGlobalRPM result","data":{"result":%v},"timestamp":%d,"sessionId":"debug-session","hypothesisId":"A,B"}`, result, time.Now().UnixMilli())
	if f, err := os.OpenFile("/Users/yukig/GolandProjects/one-hub/.cursor/debug.log", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644); err == nil { f.WriteString(debugLog2 + "\n"); f.Close() }
	// #endregion
}

// GetGlobalRPM 获取全局实时 RPM
func GetGlobalRPM() (int, error) {
	if !config.RedisEnabled {
		return 0, nil
	}

	now := time.Now().Unix()
	result, err := redis.ScriptRunCtx(context.Background(),
		globalRPMGetScript,
		[]string{globalRPMCounterKey, globalRPMLastMinKey},
		strconv.FormatInt(now, 10),
	)
	if err != nil {
		return 0, err
	}
	if result == nil {
		// #region agent log
		debugLog := fmt.Sprintf(`{"location":"global_counter.go:GetGlobalRPM","message":"result is nil","data":{"now":%d,"current_minute":%d},"timestamp":%d,"sessionId":"debug-session","hypothesisId":"C,E"}`, now, now-(now%60), time.Now().UnixMilli())
		if f, err := os.OpenFile("/Users/yukig/GolandProjects/one-hub/.cursor/debug.log", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644); err == nil { f.WriteString(debugLog + "\n"); f.Close() }
		// #endregion
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

	// #region agent log
	debugLog := fmt.Sprintf(`{"location":"global_counter.go:GetGlobalRPM:result","message":"GetGlobalRPM returning","data":{"now":%d,"current_minute":%d,"count":%d},"timestamp":%d,"sessionId":"debug-session","hypothesisId":"C,E"}`, now, now-(now%60), count, time.Now().UnixMilli())
	if f, err := os.OpenFile("/Users/yukig/GolandProjects/one-hub/.cursor/debug.log", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644); err == nil { f.WriteString(debugLog + "\n"); f.Close() }
	// #endregion

	return count, nil
}
