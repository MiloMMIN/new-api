package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func newGroupModelsChannel() *Channel {
	channel := &Channel{
		Name:   "pool-test",
		Key:    "sk-test",
		Status: common.ChannelStatusEnabled,
		Models: "model-a,model-b,model-c",
		Group:  "kimi,claude",
	}
	channel.SetSetting(dto.ChannelSettings{
		GroupModels: map[string][]string{"kimi": {"model-a"}},
	})
	return channel
}

func TestGetModelsForGroup(t *testing.T) {
	t.Run("no allowlist serves all models", func(t *testing.T) {
		channel := &Channel{Models: "model-a,model-b"}
		assert.Equal(t, []string{"model-a", "model-b"}, channel.GetModelsForGroup("kimi"))
	})

	t.Run("allowlist narrows models for its group only", func(t *testing.T) {
		channel := newGroupModelsChannel()
		assert.Equal(t, []string{"model-a"}, channel.GetModelsForGroup("kimi"))
		assert.Equal(t, []string{"model-a", "model-b", "model-c"}, channel.GetModelsForGroup("claude"))
	})

	t.Run("empty allowlist serves no models", func(t *testing.T) {
		channel := &Channel{Models: "model-a"}
		channel.SetSetting(dto.ChannelSettings{
			GroupModels: map[string][]string{"kimi": {}},
		})
		assert.Empty(t, channel.GetModelsForGroup("kimi"))
	})

	t.Run("allowlist intersects declared models", func(t *testing.T) {
		channel := &Channel{Models: "model-a"}
		channel.SetSetting(dto.ChannelSettings{
			GroupModels: map[string][]string{"kimi": {"model-a", "model-z"}},
		})
		assert.Equal(t, []string{"model-a"}, channel.GetModelsForGroup("kimi"))
	})
}

func setupAbilitiesTestDB(t *testing.T) {
	t.Helper()
	previousDB := DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	DB = db
	t.Cleanup(func() { DB = previousDB })
	require.NoError(t, db.AutoMigrate(&Channel{}, &Ability{}))
}

func abilityPairs(t *testing.T) map[string]bool {
	t.Helper()
	var abilities []Ability
	require.NoError(t, DB.Find(&abilities).Error)
	pairs := make(map[string]bool, len(abilities))
	for _, a := range abilities {
		pairs[a.Group+"|"+a.Model] = true
	}
	return pairs
}

func TestAddAbilitiesHonorsGroupModelsAllowlist(t *testing.T) {
	setupAbilitiesTestDB(t)
	channel := newGroupModelsChannel()
	require.NoError(t, channel.AddAbilities(nil))

	assert.Equal(t, map[string]bool{
		"kimi|model-a":   true,
		"claude|model-a": true,
		"claude|model-b": true,
		"claude|model-c": true,
	}, abilityPairs(t))
}

func TestUpdateAbilitiesHonorsGroupModelsAllowlist(t *testing.T) {
	setupAbilitiesTestDB(t)
	channel := newGroupModelsChannel()
	channel.Id = 7
	require.NoError(t, channel.UpdateAbilities(nil))

	assert.Equal(t, map[string]bool{
		"kimi|model-a":   true,
		"claude|model-a": true,
		"claude|model-b": true,
		"claude|model-c": true,
	}, abilityPairs(t))
}

func TestInitChannelCacheHonorsGroupModelsAllowlist(t *testing.T) {
	setupAbilitiesTestDB(t)
	require.NoError(t, DB.Create(newGroupModelsChannel()).Error)

	previousEnabled := common.MemoryCacheEnabled
	previousGroup2Model2Channels := group2model2channels
	previousChannelsIDM := channelsIDM
	common.MemoryCacheEnabled = true
	t.Cleanup(func() {
		common.MemoryCacheEnabled = previousEnabled
		group2model2channels = previousGroup2Model2Channels
		channelsIDM = previousChannelsIDM
	})

	InitChannelCache()

	assert.Contains(t, group2model2channels["kimi"], "model-a")
	assert.NotContains(t, group2model2channels["kimi"], "model-b")
	assert.Contains(t, group2model2channels["claude"], "model-b")
}
