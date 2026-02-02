package controller

import (
	"fmt"
	"math"
	"net/http"
	"one-api/common/limit"
	"one-api/model"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

const AnalyticsAPILimitKey = "api-limiter:%d"

type StatisticsByPeriod struct {
	UserStatistics       []*model.UserStatisticsByPeriod    `json:"user_statistics"`
	ChannelStatistics    []*model.LogStatisticGroupChannel  `json:"channel_statistics"`
	RedemptionStatistics []*model.RedemptionStatisticsGroup `json:"redemption_statistics"`
	OrderStatistics      []*model.OrderStatisticsGroup      `json:"order_statistics"`
}

func GetStatisticsByPeriod(c *gin.Context) {
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	groupType := c.Query("group_type")
	userID, _ := strconv.Atoi(c.Query("user_id"))

	statisticsByPeriod := &StatisticsByPeriod{}

	userStatistics, err := model.GetUserStatisticsByPeriod(startTimestamp, endTimestamp)
	if err == nil {
		statisticsByPeriod.UserStatistics = userStatistics
	}

	startTime := time.Unix(startTimestamp, 0)
	endTime := time.Unix(endTimestamp, 0)
	startDate := startTime.Format("2006-01-02")
	endDate := endTime.Format("2006-01-02")
	channelStatistics, err := model.GetChannelExpensesStatisticsByPeriod(startDate, endDate, groupType, userID)

	if err == nil {
		statisticsByPeriod.ChannelStatistics = channelStatistics
	}

	redemptionStatistics, err := model.GetStatisticsRedemptionByPeriod(startTimestamp, endTimestamp)
	if err == nil {
		statisticsByPeriod.RedemptionStatistics = redemptionStatistics
	}

	orderStatistics, err := model.GetStatisticsOrderByPeriod(startTimestamp, endTimestamp)
	if err == nil {
		statisticsByPeriod.OrderStatistics = orderStatistics
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    statisticsByPeriod,
	})
}

type StatisticsDetail struct {
	UserStatistics      *model.StatisticsUser         `json:"user_statistics"`
	ChannelStatistics   []*model.ChannelStatistics    `json:"channel_statistics"`
	RedemptionStatistic []*model.RedemptionStatistics `json:"redemption_statistic"`
	OrderStatistics     []*model.OrderStatistics      `json:"order_statistics"`
}

func GetStatisticsDetail(c *gin.Context) {

	statisticsDetail := &StatisticsDetail{}
	userStatistics, err := model.GetStatisticsUser()
	if err == nil {
		statisticsDetail.UserStatistics = userStatistics
	}

	channelStatistics, err := model.GetStatisticsChannel()
	if err == nil {
		statisticsDetail.ChannelStatistics = channelStatistics
	}

	redemptionStatistics, err := model.GetStatisticsRedemption()
	if err == nil {
		statisticsDetail.RedemptionStatistic = redemptionStatistics
	}

	orderStatistics, err := model.GetStatisticsOrder()
	if err == nil {
		statisticsDetail.OrderStatistics = orderStatistics
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    statisticsDetail,
	})
}

// GetAnalyticsSummary 获取分析页面汇总统计数据
func GetAnalyticsSummary(c *gin.Context) {
	userID, _ := strconv.Atoi(c.Query("user_id"))
	startTimestamp, _ := strconv.ParseInt(c.Query("start"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end"), 10, 64)

	// 解析时间
	startTime := time.Unix(startTimestamp, 0)
	endTime := time.Unix(endTimestamp, 0)
	startDate := startTime.Format("2006-01-02")
	endDate := endTime.Format("2006-01-02")

	// 获取统计数据
	statistics, err := model.GetAnalyticsSummaryStatistics(userID, startDate, endDate)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    statistics,
	})
}

// GetAnalyticsSummaryRate 获取分析页面 RPM 数据
func GetAnalyticsSummaryRate(c *gin.Context) {
	userID, _ := strconv.Atoi(c.Query("user_id"))

	var data map[string]interface{}

	if userID == 0 {
		// 全局统计：获取实时全局数据
		globalRPM, _ := limit.GetGlobalRPM()
		globalTPM, _ := limit.GetGlobalTPM()

		data = map[string]interface{}{
			"rpm":          globalRPM,
			"maxRPM":       0,
			"usageRpmRate": 0,
			"tpm":          globalTPM,
			"maxTPM":       0,
			"usageTpmRate": 0,
		}
	} else {
		// 指定用户：从Redis限流器获取实时RPM
		user, err := model.GetUserById(userID, false)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": err.Error(),
			})
			return
		}

		limiter := model.GlobalUserGroupRatio.GetAPILimiter(user.Group)
		if limiter == nil {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "用户组限流器未找到",
			})
			return
		}

		key := fmt.Sprintf(AnalyticsAPILimitKey, userID)
		rpm, err := limiter.GetCurrentRate(key)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": err.Error(),
			})
			return
		}

		maxRPM := limit.GetMaxRate(limiter)
		var usageRpmRate float64 = 0
		if maxRPM > 0 {
			usageRpmRate = math.Floor(float64(rpm)/float64(maxRPM)*100*100) / 100
		}

		// 获取用户实时 TPM
		tpm, _ := limit.GetCurrentTPM(userID)

		data = map[string]interface{}{
			"rpm":          rpm,
			"maxRPM":       maxRPM,
			"usageRpmRate": usageRpmRate,
			"tpm":          tpm,
			"maxTPM":       0,
			"usageTpmRate": 0,
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    data,
	})
}

// GetTop5UserQuotaStatistics 获取消费金额Top5用户的按日统计
func GetTop5UserQuotaStatistics(c *gin.Context) {
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)

	// 时间戳转日期字符串
	startTime := time.Unix(startTimestamp, 0)
	endTime := time.Unix(endTimestamp, 0)
	startDate := startTime.Format("2006-01-02")
	endDate := endTime.Format("2006-01-02")

	// 调用 model 层函数
	statistics, err := model.GetTop5UserQuotaStatisticsByPeriod(startDate, endDate)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    statistics,
	})
}
