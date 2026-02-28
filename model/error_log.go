package model

import (
	"fmt"
	"one-api/common/config"
	"one-api/common/logger"
	"one-api/common/sensitive"
	"one-api/common/utils"
	"one-api/types"

	"gorm.io/gorm"
)

type ErrorLog struct {
	Id          int    `json:"id" gorm:"primaryKey;autoIncrement"`
	UserId      int    `json:"user_id" gorm:"index"`
	CreatedAt   int64  `json:"created_at" gorm:"bigint;index"`
	ChannelId   int    `json:"channel_id" gorm:"index"`
	Username    string `json:"username" gorm:"index;default:''"`
	TokenName   string `json:"token_name" gorm:"index;default:''"`
	ModelName   string `json:"model_name" gorm:"index;default:''"`
	Content     string `json:"content"`
	RequestTime int    `json:"request_time" gorm:"default:0"`
	IsStream    bool   `json:"is_stream" gorm:"default:false"`
	SourceIp    string `json:"source_ip" gorm:"default:''"`
	StatusCode  int    `json:"status_code" gorm:"default:0"`
	ErrorCode   string `json:"error_code" gorm:"index;type:varchar(64);default:''"`
	ErrorType   string `json:"error_type" gorm:"type:varchar(64);default:''"`
	RequestPath string `json:"request_path" gorm:"type:varchar(255);default:''"`

	Channel *Channel `json:"channel" gorm:"foreignKey:Id;references:ChannelId"`
}

type ErrorLogInfo struct {
	UserId      int
	Username    string
	TokenName   string
	ModelName   string
	SourceIp    string
	RequestPath string
	IsStream    bool
	RequestTime int
}

var allowedErrorLogsOrderFields = map[string]bool{
	"created_at":  true,
	"channel_id":  true,
	"user_id":     true,
	"token_name":  true,
	"model_name":  true,
	"source_ip":   true,
	"status_code": true,
	"error_code":  true,
}

func getErrorCode(code any) string {
	switch v := code.(type) {
	case string:
		return v
	case nil:
		return ""
	default:
		return fmt.Sprintf("%v", v)
	}
}

func ShouldRecordErrorLog(err *types.OpenAIErrorWithStatusCode) bool {
	if err == nil || err.LocalError {
		return false
	}
	code, ok := err.OpenAIError.Code.(string)
	if !ok {
		return true
	}
	switch code {
	case "insufficient_user_quota", "pre_consume_token_quota_failed":
		return false
	}
	return true
}

func RecordErrorLog(channelId int, err *types.OpenAIErrorWithStatusCode, info *ErrorLogInfo) {
	if !config.ErrorLogEnabled || info == nil {
		return
	}

	errorLog := &ErrorLog{
		UserId:      info.UserId,
		Username:    info.Username,
		CreatedAt:   utils.GetTimestamp(),
		ChannelId:   channelId,
		TokenName:   info.TokenName,
		ModelName:   info.ModelName,
		Content:     sensitive.MaskSensitiveInfo(err.OpenAIError.Message),
		RequestTime: info.RequestTime,
		IsStream:    info.IsStream,
		SourceIp:    info.SourceIp,
		StatusCode:  err.StatusCode,
		ErrorCode:   getErrorCode(err.OpenAIError.Code),
		ErrorType:   err.OpenAIError.Type,
		RequestPath: info.RequestPath,
	}

	dbErr := DB.Create(errorLog).Error
	if dbErr != nil {
		logger.SysError("failed to record error log: " + dbErr.Error())
	}
}

func GetErrorLogsList(params *LogsListParams) (*DataResult[ErrorLog], error) {
	var logs []*ErrorLog

	tx := DB.Preload("Channel", func(db *gorm.DB) *gorm.DB {
		return db.Select("id, name")
	})

	if params.ModelName != "" {
		tx = tx.Where("model_name = ?", params.ModelName)
	}
	if params.Username != "" {
		tx = tx.Where("username = ?", params.Username)
	}
	if params.TokenName != "" {
		tx = tx.Where("token_name = ?", params.TokenName)
	}
	if params.StartTimestamp != 0 {
		tx = tx.Where("created_at >= ?", params.StartTimestamp)
	}
	if params.EndTimestamp != 0 {
		tx = tx.Where("created_at <= ?", params.EndTimestamp)
	}
	if params.ChannelId != 0 {
		tx = tx.Where("channel_id = ?", params.ChannelId)
	}
	if params.SourceIp != "" {
		tx = tx.Where("source_ip = ?", params.SourceIp)
	}

	return PaginateAndOrder[ErrorLog](tx, &params.PaginationParams, &logs, allowedErrorLogsOrderFields)
}

func DeleteOldErrorLog(targetTimestamp int64) (int64, error) {
	result := DB.Where("created_at < ?", targetTimestamp).Delete(&ErrorLog{})
	return result.RowsAffected, result.Error
}
