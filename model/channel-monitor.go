package model

import (
	"fmt"
	"strings"

	"one-api/common"
	"one-api/common/config"

	"gorm.io/gorm"
)

const (
	channelMonitorMaxPageSize                    = 10
	channelMonitorCommaWhitespaceNormalizePasses = 32
)

type SearchChannelMonitorParams struct {
	Type      int    `json:"type" form:"type"`
	Status    int    `json:"status" form:"status"`
	Name      string `json:"name" form:"name"`
	Group     string `json:"group" form:"group"`
	Other     string `json:"other" form:"other"`
	Key       string `json:"key" form:"key"`
	TestModel string `json:"test_model" form:"test_model"`
	Tag       string `json:"tag" form:"tag"`
	PaginationParams
}

func NormalizeSelectedMonitorModels(models []string) []string {
	normalized := make([]string, 0, len(models))
	seen := make(map[string]struct{}, len(models))

	for _, model := range models {
		model = strings.TrimSpace(model)
		if model == "" {
			continue
		}
		if _, ok := seen[model]; ok {
			continue
		}

		seen[model] = struct{}{}
		normalized = append(normalized, model)
	}

	return normalized
}

func NormalizeChannelMonitorPageSize(size int) int {
	if size < 1 {
		size = config.ItemsPerPage
	}
	if size > channelMonitorMaxPageSize {
		return channelMonitorMaxPageSize
	}
	return size
}

func GetChannelMonitorList(params *SearchChannelMonitorParams, selectedMonitorModels []string) (*DataResult[Channel], error) {
	if params == nil {
		params = &SearchChannelMonitorParams{}
	}

	params.Size = NormalizeChannelMonitorPageSize(params.Size)

	var channels []*Channel

	db := DB.Omit("key")
	db = applyChannelMonitorBaseFilters(db, params)
	db = applySelectedMonitorModelsFilter(db, selectedMonitorModels)

	return PaginateAndOrder(db, &params.PaginationParams, &channels, allowedChannelOrderFields)
}

func GetChannelsByIds(ids []int) ([]*Channel, error) {
	if len(ids) == 0 {
		return make([]*Channel, 0), nil
	}

	var channels []*Channel
	err := DB.Find(&channels, "id IN ?", ids).Error
	if err != nil {
		return nil, err
	}

	channelMap := make(map[int]*Channel, len(channels))
	for _, channel := range channels {
		channelMap[channel.Id] = channel
	}

	orderedChannels := make([]*Channel, 0, len(channels))
	for _, id := range ids {
		channel, ok := channelMap[id]
		if !ok {
			continue
		}
		orderedChannels = append(orderedChannels, channel)
	}

	return orderedChannels, nil
}

func IntersectMonitorModels(channelModels string, selectedMonitorModels []string) []string {
	return intersectMonitorModels(channelModels, NormalizeSelectedMonitorModels(selectedMonitorModels))
}

func applyChannelMonitorBaseFilters(db *gorm.DB, params *SearchChannelMonitorParams) *gorm.DB {
	if params == nil {
		return db
	}

	if params.Type != 0 {
		db = db.Where("type = ?", params.Type)
	}

	if params.Status != 0 {
		db = db.Where("status = ?", params.Status)
	}

	if params.Name != "" {
		db = db.Where("name LIKE ?", "%"+params.Name+"%")
	}

	if params.Group != "" {
		groupKey := quotePostgresField("group")
		db = db.Where("( "+groupKey+" LIKE ? OR "+groupKey+" LIKE ? OR "+groupKey+" LIKE ? OR "+groupKey+" = ?)",
			"%,"+params.Group+",%", params.Group+",%", "%,"+params.Group, params.Group)
	}

	if params.Other != "" {
		db = db.Where("other LIKE ?", params.Other+"%")
	}

	if params.Key != "" {
		db = db.Where(quotePostgresField("key")+" = ?", params.Key)
	}

	if params.TestModel != "" {
		db = db.Where("test_model LIKE ?", params.TestModel+"%")
	}

	if params.Tag != "" {
		db = db.Where("tag = ?", params.Tag)
	}

	return db
}

func applySelectedMonitorModelsFilter(db *gorm.DB, selectedMonitorModels []string) *gorm.DB {
	selectedMonitorModels = NormalizeSelectedMonitorModels(selectedMonitorModels)
	if len(selectedMonitorModels) == 0 {
		return db.Where("1 = 0")
	}

	modelsExpr := buildChannelModelsTokenExpr("models")
	conditions := make([]string, 0, len(selectedMonitorModels))
	args := make([]interface{}, 0, len(selectedMonitorModels))

	for _, modelName := range selectedMonitorModels {
		if common.UsingPostgreSQL {
			conditions = append(conditions, fmt.Sprintf("STRPOS(%s, ?) > 0", modelsExpr))
		} else {
			conditions = append(conditions, fmt.Sprintf("INSTR(%s, ?) > 0", modelsExpr))
		}
		args = append(args, ","+modelName+",")
	}

	return db.Where("("+strings.Join(conditions, " OR ")+")", args...)
}

func parseChannelModels(channelModels string) []string {
	rawModels := strings.Split(channelModels, ",")
	models := make([]string, 0, len(rawModels))
	seen := make(map[string]struct{}, len(rawModels))

	for _, modelName := range rawModels {
		modelName = strings.TrimSpace(modelName)
		if modelName == "" {
			continue
		}
		if _, ok := seen[modelName]; ok {
			continue
		}

		seen[modelName] = struct{}{}
		models = append(models, modelName)
	}

	return models
}

func intersectMonitorModels(channelModels string, selectedMonitorModels []string) []string {
	if len(selectedMonitorModels) == 0 {
		return nil
	}

	selectedMonitorModelsMap := make(map[string]struct{}, len(selectedMonitorModels))
	for _, modelName := range selectedMonitorModels {
		selectedMonitorModelsMap[modelName] = struct{}{}
	}

	channelModelList := parseChannelModels(channelModels)
	matchedModels := make([]string, 0, len(channelModelList))
	for _, modelName := range channelModelList {
		if _, ok := selectedMonitorModelsMap[modelName]; !ok {
			continue
		}
		matchedModels = append(matchedModels, modelName)
	}

	return matchedModels
}

// buildChannelModelsTokenExpr 会先把 models 里逗号前后的空白收一收，
// 这样 SQL 做精确模型匹配时，能和 Go 里的拆分口径保持一致。
func buildChannelModelsTokenExpr(field string) string {
	normalizedExpr := buildChannelModelsNormalizedExpr(field)

	if common.UsingPostgreSQL || common.UsingSQLite {
		return fmt.Sprintf("',' || %s || ','", normalizedExpr)
	}
	return fmt.Sprintf("CONCAT(',', %s, ',')", normalizedExpr)
}

func buildChannelModelsNormalizedExpr(field string) string {
	fieldExpr := fmt.Sprintf("COALESCE(%s, '')", quotePostgresField(field))
	normalizedExpr := fmt.Sprintf("TRIM(%s)", fieldExpr)

	for _, code := range []int{9, 10, 13} {
		normalizedExpr = fmt.Sprintf("REPLACE(%s, %s, ' ')", normalizedExpr, buildChannelMonitorSQLCharExpr(code))
	}

	for i := 0; i < channelMonitorCommaWhitespaceNormalizePasses; i++ {
		normalizedExpr = fmt.Sprintf("REPLACE(REPLACE(%s, ', ', ','), ' ,', ',')", normalizedExpr)
	}

	return fmt.Sprintf("TRIM(%s)", normalizedExpr)
}

func buildChannelMonitorSQLCharExpr(code int) string {
	if common.UsingPostgreSQL {
		return fmt.Sprintf("CHR(%d)", code)
	}
	return fmt.Sprintf("CHAR(%d)", code)
}
