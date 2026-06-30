package controller

import (
	"net/http"
	"one-api/common"
	"one-api/model"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/datatypes"
)

type LogViewOptions struct {
	IncludeRetryTrace bool
}

func BuildLogDataResult(result *model.DataResult[model.Log], opts LogViewOptions) *model.DataResult[model.Log] {
	if result == nil {
		return nil
	}

	clonedResult := &model.DataResult[model.Log]{
		Page:       result.Page,
		Size:       result.Size,
		TotalCount: result.TotalCount,
	}
	if result.Data == nil {
		return clonedResult
	}

	clonedData := make([]*model.Log, 0, len(*result.Data))
	for _, item := range *result.Data {
		clonedData = append(clonedData, BuildLogItem(item, opts))
	}
	clonedResult.Data = &clonedData

	return clonedResult
}

func BuildLogItem(log *model.Log, opts LogViewOptions) *model.Log {
	if log == nil {
		return nil
	}

	clonedLog := *log
	if log.Channel != nil {
		channelCopy := *log.Channel
		clonedLog.Channel = &channelCopy
	}
	clonedLog.Metadata = sanitizeLogMetadataForView(log.Metadata, opts)

	return &clonedLog
}

func sanitizeLogMetadataForView(meta datatypes.JSONType[map[string]any], opts LogViewOptions) datatypes.JSONType[map[string]any] {
	rawMeta := meta.Data()
	if rawMeta == nil {
		return meta
	}

	clonedMeta := make(map[string]any, len(rawMeta))
	for key, value := range rawMeta {
		clonedMeta[key] = value
	}
	if !opts.IncludeRetryTrace {
		delete(clonedMeta, "retry_trace")
	}

	return datatypes.NewJSONType(clonedMeta)
}

func GetLogsList(c *gin.Context) {
	var params model.LogsListParams
	if err := c.ShouldBindQuery(&params); err != nil {
		common.APIRespondWithError(c, http.StatusOK, err)
		return
	}

	logs, err := model.GetLogsList(&params)
	if err != nil {
		common.APIRespondWithError(c, http.StatusOK, err)
		return
	}
	data := BuildLogDataResult(logs, LogViewOptions{IncludeRetryTrace: true})
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    data,
	})
}

func GetUserLogsList(c *gin.Context) {
	userId := c.GetInt("id")

	var params model.LogsListParams
	if err := c.ShouldBindQuery(&params); err != nil {
		common.APIRespondWithError(c, http.StatusOK, err)
		return
	}

	logs, err := model.GetUserLogsList(userId, &params)
	if err != nil {
		common.APIRespondWithError(c, http.StatusOK, err)
		return
	}
	data := BuildLogDataResult(logs, LogViewOptions{IncludeRetryTrace: false})
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    data,
	})
}

func GetLogsStat(c *gin.Context) {
	// logType, _ := strconv.Atoi(c.Query("type"))
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	tokenName := c.Query("token_name")
	username := c.Query("username")
	modelName := c.Query("model_name")
	channel, _ := strconv.Atoi(c.Query("channel"))
	quotaNum := model.SumUsedQuota(startTimestamp, endTimestamp, modelName, username, tokenName, channel)
	//tokenNum := model.SumUsedToken(logType, startTimestamp, endTimestamp, modelName, username, "")
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"quota": quotaNum,
			//"token": tokenNum,
		},
	})
}

func GetLogsSelfStat(c *gin.Context) {
	username := c.GetString("username")
	// logType, _ := strconv.Atoi(c.Query("type"))
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	tokenName := c.Query("token_name")
	modelName := c.Query("model_name")
	channel, _ := strconv.Atoi(c.Query("channel"))
	quotaNum := model.SumUsedQuota(startTimestamp, endTimestamp, modelName, username, tokenName, channel)
	//tokenNum := model.SumUsedToken(logType, startTimestamp, endTimestamp, modelName, username, tokenName)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"quota": quotaNum,
			//"token": tokenNum,
		},
	})
}

func DeleteHistoryLogs(c *gin.Context) {
	targetTimestamp, _ := strconv.ParseInt(c.Query("target_timestamp"), 10, 64)
	if targetTimestamp == 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "target timestamp is required",
		})
		return
	}
	count, err := model.DeleteOldLog(targetTimestamp)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    count,
	})
}
