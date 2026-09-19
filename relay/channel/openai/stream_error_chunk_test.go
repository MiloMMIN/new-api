package openai

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newChatStreamTestContext(body string) (*gin.Context, *httptest.ResponseRecorder, *http.Response, *relaycommon.RelayInfo) {
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)

	resp := &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(strings.NewReader(body)),
		Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
	}
	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "test-model"},
		IsStream:    true,
		RelayMode:   relayconstant.RelayModeChatCompletions,
		RelayFormat: types.RelayFormatOpenAI,
	}
	return c, recorder, resp, info
}

// TestOaiStreamHandlerMarksUpstreamErrorChunkFailed guards the contract that a
// mid-stream upstream error payload is surfaced as a failed response instead of
// a silent ok stream, so billing waives the charge and the log shows the cause.
func TestOaiStreamHandlerMarksUpstreamErrorChunkFailed(t *testing.T) {
	oldMode := gin.Mode()
	gin.SetMode(gin.TestMode)
	t.Cleanup(func() { gin.SetMode(oldMode) })

	oldTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = oldTimeout })

	body := strings.Join([]string{
		`data: {"id":"c1","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}`,
		``,
		`data: {"error":{"message":"upstream quota exhausted","type":"rate_limit_error","code":"rate_limit_exceeded"}}`,
		``,
		`data: {"id":"c1","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}`,
		``,
		`data: [DONE]`,
		``,
	}, "\n")

	c, recorder, resp, info := newChatStreamTestContext(body)

	_, apiErr := OaiStreamHandler(c, info, resp)

	require.Nil(t, apiErr)
	require.NotNil(t, info.StreamStatus)
	assert.True(t, info.StreamStatus.ResponseFailed())
	assert.Equal(t, "failed", info.StreamStatus.ResponseOutcome())
	require.Equal(t, 1, info.StreamStatus.TotalErrorCount())
	require.Len(t, info.StreamStatus.Errors, 1)
	assert.Contains(t, info.StreamStatus.Errors[0].Message, "upstream quota exhausted")
	assert.Contains(t, recorder.Body.String(), `"code":"rate_limit_exceeded"`)
	assert.Contains(t, recorder.Body.String(), `data: [DONE]`)
}

func TestOaiStreamHandlerCleanStreamStaysUnfailed(t *testing.T) {
	oldMode := gin.Mode()
	gin.SetMode(gin.TestMode)
	t.Cleanup(func() { gin.SetMode(oldMode) })

	oldTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = oldTimeout })

	body := strings.Join([]string{
		`data: {"id":"c1","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}`,
		``,
		`data: {"id":"c1","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{"content":"hi"},"finish_reason":null}]}`,
		``,
		`data: {"id":"c1","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}`,
		``,
		`data: {"id":"c1","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[],"usage":{"prompt_tokens":3,"completion_tokens":1,"total_tokens":4}}`,
		``,
		`data: [DONE]`,
		``,
	}, "\n")

	c, _, resp, info := newChatStreamTestContext(body)

	usage, apiErr := OaiStreamHandler(c, info, resp)

	require.Nil(t, apiErr)
	assert.False(t, info.StreamStatus.ResponseFailed())
	assert.Equal(t, 0, info.StreamStatus.TotalErrorCount())
	require.NotNil(t, usage)
	assert.Equal(t, 3, usage.PromptTokens)
	assert.Equal(t, 1, usage.CompletionTokens)
}
