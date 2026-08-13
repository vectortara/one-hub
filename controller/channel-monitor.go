package controller

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/binding"
	"github.com/go-playground/validator/v10"

	"one-api/common"
	"one-api/common/requester"
	"one-api/common/utils"
	"one-api/controller/check_channel"
	"one-api/model"
	"one-api/providers"
	providers_base "one-api/providers/base"
	"one-api/types"
)

const (
	channelMonitorProbeStatusPending    = "pending"
	channelMonitorProbeStatusHealthy    = "healthy"
	channelMonitorProbeStatusUnhealthy  = "unhealthy"
	channelMonitorProbeStatusNoResponse = "no_response"

	channelMonitorWorkerCount       = 5
	channelMonitorProbeTimeout      = 15 * time.Second
	channelMonitorHeartbeatInterval = 10 * time.Second
	channelMonitorUnhealthyResponse = int64(10000)
)

type ChannelMonitorSearchRequest struct {
	model.SearchChannelMonitorParams
	SelectedMonitorModels []string `json:"selected_monitor_models" binding:"required"`
}

type ChannelMonitorMatchedModel struct {
	Model        string `json:"model"`
	ProbeStatus  string `json:"probe_status"`
	ResponseTime *int64 `json:"response_time"`
	ErrorMessage string `json:"error_message"`
}

type ChannelMonitorItem struct {
	Id            int                          `json:"id"`
	Name          string                       `json:"name"`
	Group         string                       `json:"group"`
	Type          int                          `json:"type"`
	Status        int                          `json:"status"`
	MatchedModels []ChannelMonitorMatchedModel `json:"matched_models"`
}

type ChannelMonitorSearchDataResult struct {
	RequestId  string                `json:"request_id"`
	ChannelIds []int                 `json:"channel_ids"`
	Data       []*ChannelMonitorItem `json:"data"`
	Page       int                   `json:"page"`
	Size       int                   `json:"size"`
	TotalCount int64                 `json:"total_count"`
}

type ChannelMonitorRunRequest struct {
	RequestId             string   `json:"request_id"`
	ChannelIds            []int    `json:"channel_ids"`
	SelectedMonitorModels []string `json:"selected_monitor_models"`
}

type ChannelMonitorProbeTask struct {
	RequestId string         `json:"request_id"`
	Channel   *model.Channel `json:"-"`
	Model     string         `json:"model"`
}

type ChannelMonitorProbeResult struct {
	RequestId    string `json:"request_id"`
	ChannelId    int    `json:"channel_id"`
	Model        string `json:"model"`
	ProbeStatus  string `json:"probe_status"`
	ResponseTime *int64 `json:"response_time"`
	ErrorMessage string `json:"error_message"`
}

func GetChannelMonitorSearch(c *gin.Context) {
	var req ChannelMonitorSearchRequest
	if err := bindStrictChannelMonitorSearchRequest(c, &req); err != nil {
		common.APIRespondWithError(c, http.StatusOK, err)
		return
	}

	selectedModels := model.NormalizeSelectedMonitorModels(req.SelectedMonitorModels)
	req.Size = model.NormalizeChannelMonitorPageSize(req.Size)

	channels, err := model.GetChannelMonitorList(&req.SearchChannelMonitorParams, selectedModels)
	if err != nil {
		common.APIRespondWithError(c, http.StatusOK, err)
		return
	}

	channelList := make([]*model.Channel, 0)
	if channels != nil && channels.Data != nil {
		channelList = *channels.Data
	}

	requestId := newChannelMonitorRequestID()
	items, channelIds := buildPendingChannelMonitorItems(channelList, selectedModels)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": ChannelMonitorSearchDataResult{
			RequestId:  requestId,
			ChannelIds: channelIds,
			Data:       items,
			Page:       channels.Page,
			Size:       channels.Size,
			TotalCount: channels.TotalCount,
		},
	})
}

func RunChannelMonitorStream(c *gin.Context) {
	var req ChannelMonitorRunRequest
	if err := bindStrictChannelMonitorRunRequest(c, &req); err != nil {
		common.APIRespondWithError(c, http.StatusOK, err)
		return
	}

	selectedModels := model.NormalizeSelectedMonitorModels(req.SelectedMonitorModels)

	channels := make([]*model.Channel, 0)
	if len(req.ChannelIds) > 0 {
		var err error
		channels, err = model.GetChannelsByIds(req.ChannelIds)
		if err != nil {
			common.APIRespondWithError(c, http.StatusOK, err)
			return
		}
	}

	prepareChannelsForMonitorRun(channels)
	tasks := buildChannelMonitorProbeTasks(req.RequestId, channels, selectedModels)

	requester.SetEventStreamHeaders(c)

	parentCtx, cancel := context.WithCancel(c.Request.Context())
	defer cancel()

	resultChan := make(chan *ChannelMonitorProbeResult)
	errChan := make(chan error, 1)
	heartbeatChan := make(chan struct{}, 1)

	go runChannelMonitorProbeWorkers(parentCtx, tasks, channelMonitorWorkerCount, resultChan, errChan)
	go emitChannelMonitorHeartbeat(parentCtx, heartbeatChan)

	c.Stream(func(w io.Writer) bool {
		return streamChannelMonitorEvent(c, req.RequestId, resultChan, errChan, heartbeatChan, cancel)
	})
}

func streamChannelMonitorEvent(
	c *gin.Context,
	requestId string,
	resultChan <-chan *ChannelMonitorProbeResult,
	errChan <-chan error,
	heartbeatChan <-chan struct{},
	cancel context.CancelFunc,
) bool {
	select {
	case result, ok := <-resultChan:
		if !ok {
			if err, ok := tryReceiveChannelMonitorStreamError(errChan); ok && err != nil {
				c.SSEvent("message", gin.H{
					"type": "error",
					"data": gin.H{
						"request_id": requestId,
						"message":    err.Error(),
					},
				})
				cancel()
				return false
			}

			c.SSEvent("message", gin.H{
				"type": "done",
				"data": gin.H{
					"request_id": requestId,
				},
			})
			return false
		}

		c.SSEvent("message", gin.H{
			"type": "result",
			"data": result,
		})
		return true
	case err := <-errChan:
		if err == nil {
			return true
		}

		c.SSEvent("message", gin.H{
			"type": "error",
			"data": gin.H{
				"request_id": requestId,
				"message":    err.Error(),
			},
		})
		cancel()
		return false
	case <-heartbeatChan:
		c.SSEvent("message", gin.H{
			"type": "heartbeat",
			"data": gin.H{
				"request_id": requestId,
				"message":    "ping",
			},
		})
		return true
	case <-c.Request.Context().Done():
		cancel()
		return false
	}
}

func tryReceiveChannelMonitorStreamError(errChan <-chan error) (error, bool) {
	select {
	case err := <-errChan:
		return err, true
	default:
		return nil, false
	}
}

func bindStrictChannelMonitorSearchRequest(c *gin.Context, req *ChannelMonitorSearchRequest) error {
	if err := decodeStrictChannelMonitorRequestBody(c, req); err != nil {
		return formatChannelMonitorBindError(err)
	}

	if binding.Validator == nil {
		return nil
	}

	if err := binding.Validator.ValidateStruct(req); err != nil {
		return formatChannelMonitorBindError(err)
	}

	return nil
}

func bindStrictChannelMonitorRunRequest(c *gin.Context, req *ChannelMonitorRunRequest) error {
	if err := decodeStrictChannelMonitorRequestBody(c, req); err != nil {
		return formatChannelMonitorBindError(err)
	}

	req.RequestId = strings.TrimSpace(req.RequestId)
	switch {
	case req.RequestId == "":
		return fmt.Errorf("field RequestId is required")
	case req.ChannelIds == nil:
		return fmt.Errorf("field ChannelIds is required")
	case req.SelectedMonitorModels == nil:
		return fmt.Errorf("field SelectedMonitorModels is required")
	default:
		return nil
	}
}

func decodeStrictChannelMonitorRequestBody(c *gin.Context, req interface{}) error {
	decoder := json.NewDecoder(c.Request.Body)
	decoder.DisallowUnknownFields()

	if err := decoder.Decode(req); err != nil {
		return err
	}

	var extra struct{}
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			return fmt.Errorf("请求体只能包含一个 JSON 对象")
		}
		return err
	}

	return nil
}

func formatChannelMonitorBindError(err error) error {
	if errs, ok := err.(validator.ValidationErrors); ok {
		return fmt.Errorf("field %s is required", errs[0].Field())
	}

	return err
}

func newChannelMonitorRequestID() string {
	return utils.GetUUID()
}

func buildPendingChannelMonitorItems(channels []*model.Channel, selectedModels []string) ([]*ChannelMonitorItem, []int) {
	items := make([]*ChannelMonitorItem, 0, len(channels))
	channelIds := make([]int, 0, len(channels))

	for _, channel := range channels {
		if channel == nil {
			continue
		}

		items = append(items, &ChannelMonitorItem{
			Id:            channel.Id,
			Name:          channel.Name,
			Group:         channel.Group,
			Type:          channel.Type,
			Status:        channel.Status,
			MatchedModels: buildPendingMatchedModels(channel, selectedModels),
		})
		channelIds = append(channelIds, channel.Id)
	}

	return items, channelIds
}

func buildPendingMatchedModels(channel *model.Channel, selectedModels []string) []ChannelMonitorMatchedModel {
	matchedModelNames := model.IntersectMonitorModels(channel.Models, selectedModels)
	matchedModels := make([]ChannelMonitorMatchedModel, 0, len(matchedModelNames))

	for _, modelName := range matchedModelNames {
		matchedModels = append(matchedModels, ChannelMonitorMatchedModel{
			Model:        modelName,
			ProbeStatus:  channelMonitorProbeStatusPending,
			ResponseTime: nil,
			ErrorMessage: "",
		})
	}

	return matchedModels
}

func prepareChannelsForMonitorRun(channels []*model.Channel) {
	for _, channel := range channels {
		if channel == nil {
			continue
		}
		channel.SetProxy()
	}
}

func buildChannelMonitorProbeTasks(requestId string, channels []*model.Channel, selectedModels []string) []ChannelMonitorProbeTask {
	tasks := make([]ChannelMonitorProbeTask, 0)

	for _, channel := range channels {
		if channel == nil {
			continue
		}

		matchedModels := model.IntersectMonitorModels(channel.Models, selectedModels)
		for _, modelName := range matchedModels {
			tasks = append(tasks, ChannelMonitorProbeTask{
				RequestId: requestId,
				Channel:   channel,
				Model:     modelName,
			})
		}
	}

	return tasks
}

func emitChannelMonitorHeartbeat(ctx context.Context, heartbeatChan chan<- struct{}) {
	ticker := time.NewTicker(channelMonitorHeartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			select {
			case <-ctx.Done():
				return
			case heartbeatChan <- struct{}{}:
			default:
			}
		}
	}
}

func runChannelMonitorProbeWorkers(ctx context.Context, tasks []ChannelMonitorProbeTask, workerCount int, resultChan chan<- *ChannelMonitorProbeResult, errChan chan<- error) {
	defer close(resultChan)
	defer func() {
		if recovered := recover(); recovered != nil {
			sendChannelMonitorStreamError(errChan, fmt.Errorf("channel monitor stream panic: %v", recovered))
		}
	}()

	if workerCount <= 0 {
		workerCount = channelMonitorWorkerCount
	}

	taskChan := make(chan ChannelMonitorProbeTask)
	var wg sync.WaitGroup

	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			defer func() {
				if recovered := recover(); recovered != nil {
					sendChannelMonitorStreamError(errChan, fmt.Errorf("channel monitor worker panic: %v", recovered))
				}
			}()

			for {
				select {
				case <-ctx.Done():
					return
				case task, ok := <-taskChan:
					if !ok {
						return
					}

					result := testChannelByChatWithTimeout(ctx, task)
					select {
					case <-ctx.Done():
						return
					case resultChan <- result:
					}
				}
			}
		}()
	}

	defer func() {
		close(taskChan)
		wg.Wait()
	}()

	for _, task := range tasks {
		select {
		case <-ctx.Done():
			return
		case taskChan <- task:
		}
	}
}

func sendChannelMonitorStreamError(errChan chan<- error, err error) {
	if err == nil {
		return
	}

	select {
	case errChan <- err:
	default:
	}
}

func testChannelByChatWithTimeout(parentCtx context.Context, task ChannelMonitorProbeTask) *ChannelMonitorProbeResult {
	startedAt := time.Now()
	probeCtx, cancel := context.WithTimeout(parentCtx, channelMonitorProbeTimeout)
	defer cancel()

	ginCtx, err := buildChatTestContext(probeCtx)
	if err != nil {
		return newChannelMonitorProbeFailureResult(task, err.Error())
	}

	provider := providers.GetProvider(task.Channel, ginCtx)
	if provider == nil {
		return newChannelMonitorProbeFailureResult(task, "channel not implemented")
	}

	if providerRequester := provider.GetRequester(); providerRequester != nil {
		providerRequester.Context = probeCtx
	}

	mappedModel, err := provider.ModelMappingHandler(task.Model)
	if err != nil {
		return newChannelMonitorProbeFailureResult(task, err.Error())
	}

	usage := &types.Usage{}
	provider.SetUsage(usage)

	chatProvider, ok := provider.(providers_base.ChatInterface)
	if !ok {
		return newChannelMonitorProbeFailureResult(task, "channel not implemented")
	}

	chatRequest := buildChannelMonitorChatRequest(strings.TrimPrefix(mappedModel, "+"))
	_, errWithCode := chatProvider.CreateChatCompletion(chatRequest)
	if errWithCode != nil {
		return newChannelMonitorProbeFailureResult(task, resolveChannelMonitorProbeErrorMessage(probeCtx, errWithCode))
	}

	responseTime := time.Since(startedAt).Milliseconds()
	return &ChannelMonitorProbeResult{
		RequestId:    task.RequestId,
		ChannelId:    task.Channel.Id,
		Model:        task.Model,
		ProbeStatus:  classifyChannelMonitorProbeStatus(responseTime),
		ResponseTime: &responseTime,
		ErrorMessage: "",
	}
}

func buildChatTestContext(ctx context.Context) (*gin.Context, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "/v1/chat/completions", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = req
	return c, nil
}

func buildChannelMonitorChatRequest(modelName string) *types.ChatCompletionRequest {
	return check_channel.CreateCheckBaseProcess(modelName).GetRequest()
}

func resolveChannelMonitorProbeErrorMessage(probeCtx context.Context, errWithCode *types.OpenAIErrorWithStatusCode) string {
	if probeErr := probeCtx.Err(); probeErr != nil {
		return probeErr.Error()
	}
	if errWithCode != nil && errWithCode.Message != "" {
		return errWithCode.Message
	}
	return "unknown error"
}

func classifyChannelMonitorProbeStatus(responseTime int64) string {
	if responseTime > channelMonitorUnhealthyResponse {
		return channelMonitorProbeStatusUnhealthy
	}
	return channelMonitorProbeStatusHealthy
}

func newChannelMonitorProbeFailureResult(task ChannelMonitorProbeTask, errMessage string) *ChannelMonitorProbeResult {
	return &ChannelMonitorProbeResult{
		RequestId:    task.RequestId,
		ChannelId:    task.Channel.Id,
		Model:        task.Model,
		ProbeStatus:  channelMonitorProbeStatusNoResponse,
		ResponseTime: nil,
		ErrorMessage: errMessage,
	}
}
