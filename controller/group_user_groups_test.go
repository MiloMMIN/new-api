package controller

import (
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetUserGroupsHidesPureUserGroups(t *testing.T) {
	db := setupTokenControllerTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Channel{}, &model.Ability{}))

	user := &model.User{
		Id:       201,
		Username: "svip-admin",
		Password: "password",
		Group:    "svip",
		Status:   common.UserStatusEnabled,
	}
	require.NoError(t, db.Create(user).Error)

	channel := &model.Channel{
		Name:   "kimi-ch",
		Key:    "sk-x",
		Status: common.ChannelStatusEnabled,
		Models: "kimi-k3",
		Group:  "kimi,svip",
	}
	require.NoError(t, db.Create(channel).Error)
	require.NoError(t, channel.AddAbilities(nil))

	originalUsable := setting.UserUsableGroups2JSONString()
	originalRatios := ratio_setting.GroupRatio2JSONString()
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"Default","kimi":"kimi pool","all":"all channels","svip":"SVIP"}`))
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1,"kimi":1,"svip":1,"all":1}`))
	t.Cleanup(func() {
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(originalUsable))
		require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(originalRatios))
	})

	ctx, recorder := newAuthenticatedContext(t, http.MethodGet, "/api/user/self/groups", nil, user.Id)
	GetUserGroups(ctx)

	assert.Equal(t, http.StatusOK, recorder.Code)
	var resp struct {
		Data map[string]any `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &resp))

	assert.Contains(t, resp.Data, "kimi")
	assert.Contains(t, resp.Data, model.AllChannelsGroup)
	// Topup groups are account groups, not pools: hidden even though the
	// user's own group keeps svip usable and a channel is tagged svip.
	assert.NotContains(t, resp.Data, "svip")
	assert.NotContains(t, resp.Data, "vip")
	assert.NotContains(t, resp.Data, "default")
}
