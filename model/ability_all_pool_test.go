package model

import (
	"slices"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func sortedStrings(in []string) []string {
	out := slices.Clone(in)
	slices.Sort(out)
	return out
}

func newAllPoolChannel(name string, models string, groups string) *Channel {
	return &Channel{
		Name:   name,
		Key:    "sk-" + name,
		Status: common.ChannelStatusEnabled,
		Models: models,
		Group:  groups,
	}
}

func TestGetGroupEnabledModelsAllPool(t *testing.T) {
	setupAbilitiesTestDB(t)
	initCol()
	kimi := newAllPoolChannel("kimi-ch", "kimi-k3,kimi-k4", "kimi")
	claude := newAllPoolChannel("claude-ch", "claude-a,claude-b", "claude")
	disabled := newAllPoolChannel("off-ch", "off-model", "misc")
	disabled.Status = common.ChannelStatusManuallyDisabled
	restricted := newAllPoolChannel("restricted", "keep,drop", "misc")
	restricted.SetSetting(dto.ChannelSettings{
		GroupModels: map[string][]string{AllChannelsGroup: {"keep"}},
	})
	require.NoError(t, DB.Create(kimi).Error)
	require.NoError(t, DB.Create(claude).Error)
	require.NoError(t, DB.Create(disabled).Error)
	require.NoError(t, DB.Create(restricted).Error)
	for _, ch := range []*Channel{kimi, claude, disabled, restricted} {
		require.NoError(t, ch.AddAbilities(nil))
	}

	models := GetGroupEnabledModels(AllChannelsGroup)
	assert.ElementsMatch(t,
		[]string{"kimi-k3", "kimi-k4", "claude-a", "claude-b", "keep"},
		models,
	)

	// Regular tagged groups keep working alongside the wildcard pool.
	assert.Equal(t, []string{"kimi-k3", "kimi-k4"}, sortedStrings(GetGroupEnabledModels("kimi")))
	assert.Empty(t, GetGroupEnabledModels("svip"))
}

func TestGetChannelAllPoolDBPath(t *testing.T) {
	setupAbilitiesTestDB(t)
	// One channel tagged in two groups must be deduplicated so its weight is
	// not counted twice.
	multi := newAllPoolChannel("multi", "model-x", "kimi,claude")
	restricted := newAllPoolChannel("restricted", "model-x", "misc")
	restricted.SetSetting(dto.ChannelSettings{
		GroupModelsDeny: map[string][]string{AllChannelsGroup: {"model-x"}},
	})
	disabled := newAllPoolChannel("off", "model-x", "misc")
	disabled.Status = common.ChannelStatusManuallyDisabled
	require.NoError(t, DB.Create(multi).Error)
	require.NoError(t, DB.Create(restricted).Error)
	require.NoError(t, DB.Create(disabled).Error)
	for _, ch := range []*Channel{multi, restricted, disabled} {
		require.NoError(t, ch.AddAbilities(nil))
	}

	channel, err := GetChannel(AllChannelsGroup, "model-x", 0, nil)
	require.NoError(t, err)
	require.NotNil(t, channel)
	assert.Equal(t, multi.Id, channel.Id)
}

func TestIsChannelEnabledForGroupModelDBAllPool(t *testing.T) {
	setupAbilitiesTestDB(t)
	channel := newAllPoolChannel("ch", "model-a,model-b", "kimi")
	channel.SetSetting(dto.ChannelSettings{
		GroupModels: map[string][]string{AllChannelsGroup: {"model-a"}},
	})
	require.NoError(t, DB.Create(channel).Error)

	assert.True(t, isChannelEnabledForGroupModelDB(AllChannelsGroup, "model-a", channel.Id))
	assert.False(t, isChannelEnabledForGroupModelDB(AllChannelsGroup, "model-b", channel.Id))

	channel.Status = common.ChannelStatusManuallyDisabled
	require.NoError(t, DB.Save(channel).Error)
	assert.False(t, isChannelEnabledForGroupModelDB(AllChannelsGroup, "model-a", channel.Id))
}

func TestInitChannelCacheSynthesizesAllPool(t *testing.T) {
	setupAbilitiesTestDB(t)
	kimi := newAllPoolChannel("kimi-ch", "kimi-k3", "kimi")
	restricted := newAllPoolChannel("restricted", "keep,drop", "misc")
	restricted.SetSetting(dto.ChannelSettings{
		GroupModels: map[string][]string{AllChannelsGroup: {"keep"}},
	})
	disabled := newAllPoolChannel("off-ch", "off-model", "misc")
	disabled.Status = common.ChannelStatusManuallyDisabled
	require.NoError(t, DB.Create(kimi).Error)
	require.NoError(t, DB.Create(restricted).Error)
	require.NoError(t, DB.Create(disabled).Error)

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

	allModels := group2model2channels[AllChannelsGroup]
	require.NotNil(t, allModels)
	assert.Equal(t, []int{kimi.Id}, allModels["kimi-k3"])
	assert.Equal(t, []int{restricted.Id}, allModels["keep"])
	assert.NotContains(t, allModels, "drop")
	assert.NotContains(t, allModels, "off-model")

	channel, err := GetRandomSatisfiedChannel(AllChannelsGroup, "kimi-k3", 0, nil)
	require.NoError(t, err)
	require.NotNil(t, channel)
	assert.Equal(t, kimi.Id, channel.Id)
}
