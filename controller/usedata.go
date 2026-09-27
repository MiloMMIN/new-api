package controller

import (
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	perfmetrics "github.com/QuantumNous/new-api/pkg/perf_metrics"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
	"github.com/samber/lo"
)

func parseFlowQuotaTimeRange(c *gin.Context) (int64, int64, bool) {
	startTimestamp, err := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	if err != nil || startTimestamp <= 0 {
		common.ApiErrorMsg(c, "invalid start_timestamp")
		return 0, 0, false
	}
	endTimestamp, err := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	if err != nil || endTimestamp <= 0 {
		common.ApiErrorMsg(c, "invalid end_timestamp")
		return 0, 0, false
	}
	if endTimestamp < startTimestamp {
		common.ApiErrorMsg(c, "invalid time range")
		return 0, 0, false
	}
	return startTimestamp, endTimestamp, true
}

func GetAllQuotaDates(c *gin.Context) {
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	username := c.Query("username")
	dates, err := model.GetAllQuotaDates(startTimestamp, endTimestamp, username)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    dates,
	})
	return
}

func GetQuotaDatesByUser(c *gin.Context) {
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	dates, err := model.GetQuotaDataGroupByUser(startTimestamp, endTimestamp)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    dates,
	})
}

func GetUserQuotaDates(c *gin.Context) {
	userId := c.GetInt("id")
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	// 判断时间跨度是否超过 1 个月
	if endTimestamp-startTimestamp > 2592000 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "时间跨度不能超过 1 个月",
		})
		return
	}
	dates, err := model.GetQuotaDataByUserId(userId, startTimestamp, endTimestamp)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    dates,
	})
	return
}

// GetUserQuotaSummary returns the all-time aggregate of quota_data rows for the
// current user. Unlike GetUserQuotaDates it is not bounded by the 30-day window
// — it's a single SUM() with no grouping, so it's cheap regardless of history.
func GetUserQuotaSummary(c *gin.Context) {
	userId := c.GetInt("id")
	summary, err := model.GetUserQuotaSummary(userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    summary,
	})
}

// AdminQuotaSummaryResponse is the all-site aggregate the admin dashboard shows
// in the bottom row. quota/token totals come from quota_data; latency/success
// come from perf_metrics (same source as the existing summary endpoint, just
// aggregated over the entire retention window).
type AdminQuotaSummaryResponse struct {
	TotalTokens    int64   `json:"total_tokens"`
	TotalQuota     int64   `json:"total_quota"`
	TotalCount     int64   `json:"total_count"`
	AvgLatencyMs   int64   `json:"avg_latency_ms"`
	SuccessRate    float64 `json:"success_rate"`
}

// GetAdminQuotaSummary returns cross-site aggregates for the admin overview
// row. We hit perf_metrics with hours=0 to mean "everything the retention
// window still holds", which is the only meaningful "all-time" available —
// the underlying store discards data older than the configured retention.
func GetAdminQuotaSummary(c *gin.Context) {
	quotaSummary, err := model.GetAdminQuotaSummary()
	if err != nil {
		common.ApiError(c, err)
		return
	}

	// hours=876000 ≈ 100 years — clamp by whatever perf_metrics actually keeps.
	activeGroups := append(lo.Keys(ratio_setting.GetGroupRatioCopy()), "auto")
	perfAll, err := perfmetrics.QuerySummaryAll(876000, activeGroups)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	resp := AdminQuotaSummaryResponse{
		TotalTokens:  quotaSummary.TotalTokens,
		TotalQuota:   quotaSummary.TotalQuota,
		TotalCount:   quotaSummary.TotalCount,
	}
	if perfAll.Summary != nil {
		resp.AvgLatencyMs = perfAll.Summary.AvgLatencyMs
		resp.SuccessRate = perfAll.Summary.SuccessRate
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    resp,
	})
}
func GetAllFlowQuotaDates(c *gin.Context) {
	startTimestamp, endTimestamp, ok := parseFlowQuotaTimeRange(c)
	if !ok {
		return
	}
	username := c.Query("username")
	dates, err := model.GetFlowQuotaData(startTimestamp, endTimestamp, username, 0, c.GetInt("role"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    dates,
	})
	return
}

func GetUserFlowQuotaDates(c *gin.Context) {
	userId := c.GetInt("id")
	startTimestamp, endTimestamp, ok := parseFlowQuotaTimeRange(c)
	if !ok {
		return
	}
	if endTimestamp-startTimestamp > 2592000 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "时间跨度不能超过 1 个月",
		})
		return
	}
	dates, err := model.GetFlowQuotaData(startTimestamp, endTimestamp, "", userId, common.RoleCommonUser)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    dates,
	})
	return
}
