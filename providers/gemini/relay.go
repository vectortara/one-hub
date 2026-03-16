package gemini

import (
	"bytes"
	"encoding/json"
	"net/http"
	"one-api/common"
	"one-api/common/requester"
	"one-api/types"
	"strings"
)

type GeminiRelayStreamHandler struct {
	Usage     *types.Usage
	Prefix    string
	ModelName string

	key string
}

func (p *GeminiProvider) CreateGeminiChat(request *GeminiChatRequest) (*GeminiChatResponse, *types.OpenAIErrorWithStatusCode) {
	req, errWithCode := p.getChatRequest(request, true)
	if errWithCode != nil {
		return nil, errWithCode
	}
	defer req.Body.Close()

	geminiResponse := &GeminiChatResponse{}
	// 发送请求
	_, errWithCode = p.Requester.SendRequest(req, geminiResponse, false)
	if errWithCode != nil {
		return nil, errWithCode
	}

	if len(geminiResponse.Candidates) == 0 {

		// 尝试把这次 Gemini 的完整响应转成 JSON，方便在 Apifox 里排查
		raw, _ := json.Marshal(geminiResponse)
		// 注意：这是测试环境用的调试信息，线上建议去掉或做脱敏
		msg := "no candidates; raw_gemini_response=" + string(raw)
		return nil, common.StringErrorWrapper(msg, "no_candidates", http.StatusInternalServerError)

		//return nil, common.StringErrorWrapper("no candidates", "no_candidates", http.StatusInternalServerError)
	}

	usage := p.GetUsage()
	*usage = ConvertOpenAIUsage(geminiResponse.UsageMetadata)

	return geminiResponse, nil
}

func (p *GeminiProvider) CreateGeminiChatStream(request *GeminiChatRequest) (requester.StreamReaderInterface[string], *types.OpenAIErrorWithStatusCode) {
	req, errWithCode := p.getChatRequest(request, true)
	if errWithCode != nil {
		return nil, errWithCode
	}
	defer req.Body.Close()

	channel := p.GetChannel()

	chatHandler := &GeminiRelayStreamHandler{
		Usage:     p.Usage,
		ModelName: request.Model,
		Prefix:    `data: `,

		key: channel.Key,
	}

	// 发送请求
	resp, errWithCode := p.Requester.SendRequestRaw(req)
	if errWithCode != nil {
		return nil, errWithCode
	}

	stream, errWithCode := requester.RequestNoTrimStream(p.Requester, resp, chatHandler.HandlerStream)
	if errWithCode != nil {
		return nil, errWithCode
	}

	return stream, nil
}

func (h *GeminiRelayStreamHandler) HandlerStream(rawLine *[]byte, dataChan chan string, errChan chan error) {
	rawStr := string(*rawLine)
	// 如果rawLine 前缀不为data:，则直接返回
	if !strings.HasPrefix(rawStr, h.Prefix) {
		dataChan <- rawStr
		return
	}

	noSpaceLine := bytes.TrimSpace(*rawLine)
	noSpaceLine = noSpaceLine[6:]

	var geminiResponse GeminiChatResponse
	err := json.Unmarshal(noSpaceLine, &geminiResponse)
	if err != nil {
		errChan <- ErrorToGeminiErr(err)
		return
	}

	if geminiResponse.ErrorInfo != nil {
		cleaningError(geminiResponse.ErrorInfo, h.key)
		errChan <- geminiResponse.ErrorInfo
		return
	}
	h.Usage.TextBuilder.WriteString(geminiResponse.GetResponseText())

	if geminiResponse.UsageMetadata == nil {
		dataChan <- rawStr
		return
	}

	usage := ConvertOpenAIUsage(geminiResponse.UsageMetadata)

	usage.TextBuilder = h.Usage.TextBuilder
	*h.Usage = usage

	dataChan <- rawStr
}
