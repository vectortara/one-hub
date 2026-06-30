package logmeta

import "context"

type retryTraceContextKey struct{}

// WithRetryTrace 将最终的 retry_trace 写入 request context。
// 挂入后应视为只读，避免后续修改导致日志漂移或并发风险。
func WithRetryTrace(ctx context.Context, retryTrace map[string]any) context.Context {
	if ctx == nil || len(retryTrace) == 0 {
		return ctx
	}

	return context.WithValue(ctx, retryTraceContextKey{}, retryTrace)
}

// GetRetryTrace 读取 request context 中保存的 retry_trace。
func GetRetryTrace(ctx context.Context) map[string]any {
	if ctx == nil {
		return nil
	}

	retryTrace, _ := ctx.Value(retryTraceContextKey{}).(map[string]any)
	return retryTrace
}
