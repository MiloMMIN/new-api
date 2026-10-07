package ratio_setting

import (
	"testing"

	"github.com/QuantumNous/new-api/setting/model_setting"
	"github.com/stretchr/testify/assert"
)

func TestFormatMatchingModelNameDoesNotStripBase(t *testing.T) {
	assert.Equal(t, "qwen3-max@thinking:on", FormatMatchingModelName("qwen3-max@thinking:on"))
	assert.Equal(t, "claude-3-7-sonnet-thinking", FormatMatchingModelName("claude-3-7-sonnet-thinking"))
	assert.Equal(t, "gemini-2.5-flash-thinking-*", FormatMatchingModelName("gemini-2.5-flash-thinking-8192"))
	assert.Equal(t, "gpt-4-gizmo-*", FormatMatchingModelName("gpt-4-gizmo-abc"))
}

func TestRoutingMatchModelNameStripsThenWildcards(t *testing.T) {
	assert.Equal(t, "qwen3-max", RoutingMatchModelName("qwen3-max@thinking:on@temperature:0.2"))
	assert.Equal(t, "claude-3-7-sonnet", RoutingMatchModelName("claude-3-7-sonnet-thinking"))
	assert.Equal(t, "gemini-2.5-flash-thinking-*", RoutingMatchModelName("gemini-2.5-flash-thinking-8192"))
	assert.Equal(t, "gpt-5.1-codex-max", RoutingMatchModelName("gpt-5.1-codex-max"))

	geminiSettings := model_setting.GetGeminiSettings()
	old := geminiSettings.ThinkingAdapterEnabled
	geminiSettings.ThinkingAdapterEnabled = true
	t.Cleanup(func() { geminiSettings.ThinkingAdapterEnabled = old })
	assert.Equal(t, "gemini-2.5-flash", RoutingMatchModelName("gemini-2.5-flash-thinking-8192"))
}

func TestRoutingMatchModelNameExpandedEffortFamilies(t *testing.T) {
	// devin 这类网关把 effort 档位编码进真实 id 的家族也应剥后缀归一到 base，
	// 这样渠道列表只留 base 名、客户端用 base+effort 或 xx-max 都能路由。
	cases := map[string]string{
		"swe-2-max":           "swe-2",
		"swe-2-high":          "swe-2",
		"swe-1-7-medium":      "swe-1-7",
		"kimi-k3-max":         "kimi-k3",
		"glm-5-3-low":         "glm-5-3",
		"deepseek-v4-pro-max": "deepseek-v4-pro",
		"inkling-xhigh":       "inkling",
		"grok-4-6-high":       "grok-4-6",
		"nemotron-3-ultra-medium": "nemotron-3-ultra",
		"hy4-preview-max":     "hy4-preview",
	}
	for in, want := range cases {
		assert.Equal(t, want, RoutingMatchModelName(in), in)
	}
	// 功能修饰词与非白名单家族保持不透明
	for _, opaque := range []string{"swe-1-6-fast", "qwen-max", "random-thing-high"} {
		assert.Equal(t, opaque, RoutingMatchModelName(opaque), opaque)
	}
}

func TestRoutingMatchModelNamePreservesExemptAtName(t *testing.T) {
	settings := model_setting.GetGlobalSettings()
	original := append([]string(nil), settings.ThinkingModelBlacklist...)
	t.Cleanup(func() { settings.ThinkingModelBlacklist = original })
	settings.ThinkingModelBlacklist = append(original, "re:.*@sha256:.*")

	assert.Equal(t, "opaque@sha256:deadbeef", RoutingMatchModelName("opaque@sha256:deadbeef"))
	assert.Equal(t, "kimi-k2-thinking", RoutingMatchModelName("kimi-k2-thinking"))
}
