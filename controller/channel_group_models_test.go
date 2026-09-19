package controller

import (
	"bytes"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func settingsWithGroupModels(gm map[string][]string) dto.ChannelSettings {
	return dto.ChannelSettings{GroupModels: gm}
}

func TestApplyGroupModelsPatch(t *testing.T) {
	t.Run("sets a pool allowlist preserving other pools", func(t *testing.T) {
		settings := settingsWithGroupModels(map[string][]string{
			"claude": {"claude-opus"},
		})
		err := applyGroupModelsPatch(&settings.GroupModels, "group_models", map[string]any{
			"kimi": []any{"kimi-k3"},
		})
		require.NoError(t, err)
		assert.Equal(t, map[string][]string{
			"kimi":   {"kimi-k3"},
			"claude": {"claude-opus"},
		}, settings.GroupModels)
	})

	t.Run("null removes a single pool entry", func(t *testing.T) {
		settings := settingsWithGroupModels(map[string][]string{
			"kimi":   {"kimi-k3"},
			"claude": {"claude-opus"},
		})
		err := applyGroupModelsPatch(&settings.GroupModels, "group_models", map[string]any{"kimi": nil})
		require.NoError(t, err)
		assert.Equal(t, map[string][]string{"claude": {"claude-opus"}}, settings.GroupModels)
	})

	t.Run("null for the whole field clears every entry", func(t *testing.T) {
		settings := settingsWithGroupModels(map[string][]string{"kimi": {"a"}})
		require.NoError(t, applyGroupModelsPatch(&settings.GroupModels, "group_models", nil))
		assert.Nil(t, settings.GroupModels)
	})

	t.Run("empty list is stored as explicit empty", func(t *testing.T) {
		settings := settingsWithGroupModels(nil)
		require.NoError(t, applyGroupModelsPatch(&settings.GroupModels, "group_models", map[string]any{
			"kimi": []any{},
		}))
		assert.Equal(t, map[string][]string{"kimi": {}}, settings.GroupModels)
	})

	t.Run("blank model names are dropped", func(t *testing.T) {
		settings := settingsWithGroupModels(nil)
		require.NoError(t, applyGroupModelsPatch(&settings.GroupModels, "group_models", map[string]any{
			"kimi": []any{"kimi-k3", "  ", ""},
		}))
		assert.Equal(t, map[string][]string{"kimi": {"kimi-k3"}}, settings.GroupModels)
	})

	t.Run("empty object leaves existing entries untouched", func(t *testing.T) {
		settings := settingsWithGroupModels(map[string][]string{"claude": {"x"}})
		require.NoError(t, applyGroupModelsPatch(&settings.GroupModels, "group_models", map[string]any{}))
		assert.Equal(t, map[string][]string{"claude": {"x"}}, settings.GroupModels)
	})

	t.Run("rejects non-object values", func(t *testing.T) {
		settings := settingsWithGroupModels(nil)
		assert.Error(t, applyGroupModelsPatch(&settings.GroupModels, "group_models", "kimi"))
		assert.Error(t, applyGroupModelsPatch(&settings.GroupModels, "group_models", []any{"kimi"}))
		assert.Error(t, applyGroupModelsPatch(&settings.GroupModels, "group_models", 5))
	})

	t.Run("rejects non-list group values", func(t *testing.T) {
		settings := settingsWithGroupModels(nil)
		assert.Error(t, applyGroupModelsPatch(&settings.GroupModels, "group_models", map[string]any{"kimi": "a"}))
		assert.Error(t, applyGroupModelsPatch(&settings.GroupModels, "group_models", map[string]any{"kimi": 1}))
		assert.Error(t, applyGroupModelsPatch(&settings.GroupModels, "group_models", map[string]any{"kimi": map[string]any{}}))
	})

	t.Run("deny map patches independently of the allow map", func(t *testing.T) {
		settings := settingsWithGroupModels(map[string][]string{"kimi": {"a", "b"}})
		err := applyGroupModelsPatch(&settings.GroupModelsDeny, "group_models_deny", map[string]any{
			"kimi": []any{"b"},
		})
		require.NoError(t, err)
		assert.Equal(t, map[string][]string{"kimi": {"b"}}, settings.GroupModelsDeny)
		assert.Equal(t, map[string][]string{"kimi": {"a", "b"}}, settings.GroupModels)
	})
}

func TestGroupModelsSensitivityClassification(t *testing.T) {
	origin := &model.Channel{Id: 1, Type: 1, Key: "k", Models: "a", Group: "default"}

	t.Run("group_models alone is not a sensitive change", func(t *testing.T) {
		updated := PatchChannel{}
		updated.Id = origin.Id
		assert.False(t, channelHasSensitiveChanges(&updated, origin, map[string]any{
			"id":           origin.Id,
			"group_models": map[string]any{"kimi": []any{"a"}},
		}))
	})

	t.Run("group_models_deny alone is not a sensitive change", func(t *testing.T) {
		updated := PatchChannel{}
		updated.Id = origin.Id
		assert.False(t, channelHasSensitiveChanges(&updated, origin, map[string]any{
			"id":                origin.Id,
			"group_models_deny": map[string]any{"kimi": []any{"a"}},
		}))
	})

	t.Run("group_models plus changed setting stays sensitive", func(t *testing.T) {
		updated := PatchChannel{}
		updated.Id = origin.Id
		newSetting := `{"proxy":"socks5://x"}`
		updated.Setting = &newSetting
		assert.True(t, channelHasSensitiveChanges(&updated, origin, map[string]any{
			"id":           origin.Id,
			"group_models": map[string]any{"kimi": []any{"a"}},
			"setting":      newSetting,
		}))
	})
}

func TestUpdateChannelGroupModelsPatchEndToEnd(t *testing.T) {
	gin.SetMode(gin.TestMode)
	previousDB := model.DB
	previousRedis := common.RedisEnabled
	common.RedisEnabled = false
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	model.DB = db
	t.Cleanup(func() {
		model.DB = previousDB
		common.RedisEnabled = previousRedis
	})
	require.NoError(t, db.AutoMigrate(&model.Channel{}, &model.Ability{}, &model.User{}))

	channel := model.Channel{
		Name:   "pool-ch",
		Key:    "sk-test",
		Status: common.ChannelStatusEnabled,
		Models: "model-a,model-b,model-c",
		Group:  "kimi,claude",
	}
	channel.SetSetting(dto.ChannelSettings{
		Proxy:       "socks5://keep",
		GroupModels: map[string][]string{"claude": {"model-c"}},
	})
	require.NoError(t, db.Create(&channel).Error)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(
		http.MethodPut,
		"/api/channel/",
		bytes.NewBufferString(fmt.Sprintf(
			`{"id":%d,"group_models":{"kimi":["model-a","  ","model-b"]}}`, channel.Id)),
	)
	ctx.Request.Header.Set("Content-Type", "application/json")

	UpdateChannel(ctx)

	var response struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.Truef(t, response.Success, "update failed: %s", response.Message)

	var stored model.Channel
	require.NoError(t, db.First(&stored, channel.Id).Error)
	setting := stored.GetSetting()
	assert.Equal(t, "socks5://keep", setting.Proxy)
	assert.Equal(t, map[string][]string{
		"kimi":   {"model-a", "model-b"},
		"claude": {"model-c"},
	}, setting.GroupModels)

	var abilities []model.Ability
	require.NoError(t, db.Find(&abilities).Error)
	pairs := make(map[string]bool, len(abilities))
	for _, a := range abilities {
		pairs[a.Group+"|"+a.Model] = true
	}
	assert.Equal(t, map[string]bool{
		"kimi|model-a":   true,
		"kimi|model-b":   true,
		"claude|model-c": true,
	}, pairs)

	// A group_models_deny patch subtracts from the allowlist result and lands
	// in its own setting map.
	recorder = httptest.NewRecorder()
	ctx, _ = gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(
		http.MethodPut,
		"/api/channel/",
		bytes.NewBufferString(fmt.Sprintf(
			`{"id":%d,"group_models_deny":{"kimi":["model-b"]}}`, channel.Id)),
	)
	ctx.Request.Header.Set("Content-Type", "application/json")

	UpdateChannel(ctx)
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.Truef(t, response.Success, "deny update failed: %s", response.Message)

	require.NoError(t, db.First(&stored, channel.Id).Error)
	setting = stored.GetSetting()
	assert.Equal(t, map[string][]string{"kimi": {"model-b"}}, setting.GroupModelsDeny)
	// allowlist untouched
	assert.Equal(t, map[string][]string{
		"kimi":   {"model-a", "model-b"},
		"claude": {"model-c"},
	}, setting.GroupModels)

	require.NoError(t, db.Find(&abilities).Error)
	pairs = make(map[string]bool, len(abilities))
	for _, a := range abilities {
		pairs[a.Group+"|"+a.Model] = true
	}
	assert.Equal(t, map[string]bool{
		"kimi|model-a":   true,
		"claude|model-c": true,
	}, pairs)
}
