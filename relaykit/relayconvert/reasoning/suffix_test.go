package reasoning

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseGeminiModelSuffixNoThinkingDisablesReasoning(t *testing.T) {
	t.Parallel()

	base, intent, found, err := ParseGeminiModelSuffix("gemini-2.5-flash-nothinking", true)
	require.NoError(t, err)
	require.True(t, found)
	assert.Equal(t, "gemini-2.5-flash", base)
	assert.Equal(t, ModeDisabled, intent.Mode)
	assert.Equal(t, EffortNone, intent.Effort)
	assert.Equal(t, SourceSuffix, intent.Source)
}

func TestParseKnownProviderModelSuffix(t *testing.T) {
	t.Parallel()

	preserveQwenMax := func(name string) bool { return name == "qwen-max" || name == "vendor/qwen-max" }

	tests := []struct {
		name               string
		model              string
		allowThinkingAlias bool
		wantBase           string
		wantFound          bool
		wantMode           Mode
		wantEffort         Effort
		wantBudget         *int
		wantErr            bool
	}{
		{
			name:               "claude thinking alias",
			model:              "claude-3-7-sonnet-thinking",
			allowThinkingAlias: true,
			wantBase:           "claude-3-7-sonnet",
			wantFound:          true,
			wantMode:           ModeEnabled,
		},
		{
			name:               "claude nothinking alias",
			model:              "claude-3-7-sonnet-nothinking",
			allowThinkingAlias: true,
			wantBase:           "claude-3-7-sonnet",
			wantFound:          true,
			wantMode:           ModeDisabled,
			wantEffort:         EffortNone,
		},
		{
			name:               "claude thinking budget",
			model:              "claude-3-7-sonnet-thinking-8192",
			allowThinkingAlias: true,
			wantBase:           "claude-3-7-sonnet",
			wantFound:          true,
			wantBudget:         intPtr(8192),
		},
		{
			name:               "claude effort tail",
			model:              "claude-opus-4-8-high",
			allowThinkingAlias: true,
			wantBase:           "claude-opus-4-8",
			wantFound:          true,
			wantMode:           ModeEnabled,
			wantEffort:         EffortHigh,
		},
		{
			name:               "gemini thinking alias",
			model:              "gemini-2.5-flash-thinking",
			allowThinkingAlias: true,
			wantBase:           "gemini-2.5-flash",
			wantFound:          true,
			wantMode:           ModeEnabled,
		},
		{
			name:               "malformed thinking budget",
			model:              "claude-3-7-sonnet-thinking-abc",
			allowThinkingAlias: true,
			wantErr:            true,
		},
		{
			name:      "unknown openai-compatible name is untouched",
			model:     "gpt-4o-mini",
			wantBase:  "gpt-4o-mini",
			wantFound: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			base, intent, found, err := ParseKnownProviderModelSuffix(tt.model, tt.allowThinkingAlias)
			if tt.wantErr {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tt.wantFound, found)
			assert.Equal(t, tt.wantBase, base)
			assert.Equal(t, tt.wantMode, intent.Mode)
			assert.Equal(t, tt.wantEffort, intent.Effort)
			if tt.wantBudget != nil {
				require.NotNil(t, intent.BudgetTokens)
				assert.Equal(t, *tt.wantBudget, *intent.BudgetTokens)
			} else {
				assert.Nil(t, intent.BudgetTokens)
			}
		})
	}

	t.Run("openai effort tail", func(t *testing.T) {
		t.Parallel()
		effort, base := ParseOpenAIReasoningEffortFromModelSuffix("gpt-5.6-sol-high", nil)
		assert.Equal(t, "high", effort)
		assert.Equal(t, "gpt-5.6-sol", base)
	})

	t.Run("preserve effort tail on real model id", func(t *testing.T) {
		t.Parallel()
		effort, base := ParseOpenAIReasoningEffortFromModelSuffix("qwen-max", preserveQwenMax)
		assert.Empty(t, effort)
		assert.Equal(t, "qwen-max", base)
	})

	t.Run("preserve effort tail with vendor prefix", func(t *testing.T) {
		t.Parallel()
		effort, base := ParseOpenAIReasoningEffortFromModelSuffix("vendor/qwen-max", preserveQwenMax)
		assert.Empty(t, effort)
		assert.Equal(t, "vendor/qwen-max", base)
	})

	t.Run("preserve gpt-5.1-codex-max with callback", func(t *testing.T) {
		t.Parallel()
		preserve := func(name string) bool { return name == "gpt-5.1-codex-max" }
		effort, base := ParseOpenAIReasoningEffortFromModelSuffix("gpt-5.1-codex-max", preserve)
		assert.Empty(t, effort)
		assert.Equal(t, "gpt-5.1-codex-max", base)
	})

	t.Run("splits gpt-5.1-codex-max without callback", func(t *testing.T) {
		t.Parallel()
		effort, base := ParseOpenAIReasoningEffortFromModelSuffix("gpt-5.1-codex-max", nil)
		assert.Equal(t, "max", effort)
		assert.Equal(t, "gpt-5.1-codex", base)
	})
}

func TestParseOpenAIEffortExpandedFamilies(t *testing.T) {
	t.Parallel()
	cases := []struct{ name, wantEffort, wantBase string }{
		{"swe-2-max", "max", "swe-2"},
		{"swe-2-high", "high", "swe-2"},
		{"swe-1-7-medium", "medium", "swe-1-7"},
		{"kimi-k3-max", "max", "kimi-k3"},
		{"kimi-k3-high", "high", "kimi-k3"},
		{"glm-5-3-low", "low", "glm-5-3"},
		{"glm-5-3-flash-max", "max", "glm-5-3-flash"},
		{"deepseek-v4-pro-max", "max", "deepseek-v4-pro"},
		{"inkling-xhigh", "xhigh", "inkling"},
		{"grok-4-6-high", "high", "grok-4-6"},
		{"nemotron-3-ultra-medium", "medium", "nemotron-3-ultra"},
		{"hunyuan-2.0-low", "low", "hunyuan-2.0"},
		{"hy4-preview-max", "max", "hy4-preview"},
	}
	for _, tt := range cases {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			effort, base := ParseOpenAIReasoningEffortFromModelSuffix(tt.name, nil)
			assert.Equal(t, tt.wantEffort, effort, tt.name)
			assert.Equal(t, tt.wantBase, base, tt.name)
		})
	}

	// 功能后缀与未知家族不剥：保持不透明
	opaque := []string{
		"swe-1-6-fast",           // -fast 是 tier 修饰词不是 effort
		"gpt-5-6-sol-high-priority", // 多个 token，不在白名单 token 集
		"qwen-max",               // 未知家族
		"random-thing-high",      // 未知家族
	}
	for _, name := range opaque {
		name := name
		t.Run("opaque/"+name, func(t *testing.T) {
			t.Parallel()
			effort, base := ParseOpenAIReasoningEffortFromModelSuffix(name, nil)
			assert.Empty(t, effort, name)
			assert.Equal(t, name, base, name)
		})
	}
}

func TestParseThinkingModifier(t *testing.T) {
	t.Parallel()

	on, ok := ParseThinkingModifier("on")
	require.True(t, ok)
	assert.Equal(t, ModeEnabled, on.Mode)

	adaptive, ok := ParseThinkingModifier("Adaptive")
	require.True(t, ok)
	assert.Equal(t, ModeAdaptive, adaptive.Mode)

	off, ok := ParseThinkingModifier("off")
	require.True(t, ok)
	assert.Equal(t, ModeDisabled, off.Mode)
	assert.Equal(t, EffortNone, off.Effort)

	zero, ok := ParseThinkingModifier("0")
	require.True(t, ok)
	assert.Equal(t, ModeDisabled, zero.Mode)

	budget, ok := ParseThinkingModifier("8192")
	require.True(t, ok)
	require.NotNil(t, budget.BudgetTokens)
	assert.Equal(t, 8192, *budget.BudgetTokens)
	assert.Equal(t, ModeEnabled, budget.Mode)

	dynamic, ok := ParseThinkingModifier("-1")
	require.True(t, ok)
	require.NotNil(t, dynamic.BudgetTokens)
	assert.Equal(t, -1, *dynamic.BudgetTokens)

	_, ok = ParseThinkingModifier("-2")
	assert.False(t, ok)
	_, ok = ParseThinkingModifier("enabled")
	assert.False(t, ok)
}

func intPtr(v int) *int {
	return &v
}
