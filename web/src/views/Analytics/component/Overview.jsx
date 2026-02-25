import { useState, useEffect } from 'react';
import { Grid, Typography, Divider, Box, TextField, Button, Select, MenuItem, IconButton } from '@mui/material';
import { useTheme, styled } from '@mui/material/styles';
import { gridSpacing } from 'store/constant';
import DateRangePicker from 'ui-component/DateRangePicker';
import ApexCharts from 'ui-component/chart/ApexCharts';
import { showError, calculateQuota } from 'utils/common';
import dayjs from 'dayjs';
import { API } from 'utils/api';
import { generateBarChartOptions, renderChartNumber } from 'utils/chart';
import { useTranslation } from 'react-i18next';
import StatisticalLineChartCard from 'views/Dashboard/component/StatisticalLineChartCard';
import QuotaLogWeek from 'views/Dashboard/component/QuotaLogWeek';
import MainCard from 'ui-component/cards/MainCard';
import SkeletonTotalOrderCard from 'ui-component/cards/Skeleton/EarningCard';
import RefreshIcon from '@mui/icons-material/Refresh';

// RPM Card Wrapper
const CardWrapper = styled(MainCard)(({ theme }) => ({
  borderRadius: '16px',
  border: theme.palette.mode === 'dark' ? '1px solid rgba(255, 255, 255, 0.05)' : 'none',
  boxShadow: theme.palette.mode === 'dark' ? 'none' : '0px 1px 3px rgba(0, 0, 0, 0.1)',
  overflow: 'hidden',
  height: '100px'
}));

// RPM Card Component (支持props传入数据)
const RPMCard = ({ isLoading, rpmData, onRefresh }) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const [localLoading, setLocalLoading] = useState(false);

  const handleRefresh = async () => {
    setLocalLoading(true);
    await onRefresh?.();
    setLocalLoading(false);
  };

  return (
    <>
      {isLoading ? (
        <SkeletonTotalOrderCard />
      ) : (
        <CardWrapper border={false} content={false} sx={{ height: '100%' }}>
          <Box sx={{ p: 2.5, height: '100%', position: 'relative' }}>
            <Grid container alignItems="center" spacing={2} sx={{ height: '100%' }}>
              <Grid item xs>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography
                    variant="h4"
                    sx={{
                      fontSize: '18px',
                      fontWeight: 500,
                      color: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.95)' : 'rgba(0, 0, 0, 0.87)',
                      mb: 0.5
                    }}
                  >
                    {rpmData.rpm} RPM
                  </Typography>
                  <IconButton
                    onClick={handleRefresh}
                    disabled={localLoading}
                    size="small"
                    sx={{ p: 0.5, '&:hover': { backgroundColor: 'transparent' } }}
                  >
                    <RefreshIcon
                      fontSize="small"
                      sx={{
                        color: localLoading ? theme.palette.primary.main : theme.palette.text.secondary,
                        animation: localLoading ? 'spin 1s linear infinite' : 'none',
                        '@keyframes spin': {
                          '0%': { transform: 'rotate(0deg)' },
                          '100%': { transform: 'rotate(360deg)' }
                        }
                      }}
                    />
                  </IconButton>
                </Box>
                <Typography
                  variant="body2"
                  sx={{
                    fontSize: '11px',
                    color: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)'
                  }}
                >
                  {t('dashboard_index.RPM')}
                </Typography>
                <Typography
                  variant="h4"
                  sx={{
                    fontSize: '18px',
                    fontWeight: 500,
                    color: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.95)' : 'rgba(0, 0, 0, 0.87)',
                    mt: 1.5
                  }}
                >
                  {rpmData.tpm} TPM
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    fontSize: '11px',
                    color: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)'
                  }}
                >
                  {t('dashboard_index.TPM')}
                </Typography>
              </Grid>
            </Grid>
          </Box>
        </CardWrapper>
      )}
    </>
  );
};

export default function Overview() {
  const { t } = useTranslation();
  const [channelLoading, setChannelLoading] = useState(true);
  const [redemptionLoading, setRedemptionLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(true);
  const [channelData, setChannelData] = useState([]);
  const [redemptionData, setRedemptionData] = useState([]);
  const [orderData, setOrderData] = useState([]);
  const [orderLoading, setOrderLoading] = useState(true);
  const [usersData, setUsersData] = useState([]);
  // 修改默认日期范围为当天
  const [dateRange, setDateRange] = useState({ start: dayjs().startOf('day'), end: dayjs().endOf('day') });

  const [groupType, setGroupType] = useState('model_type');
  const [userId, setUserId] = useState(0);

  // 新增：消费日志原始数据状态
  const [rawChannelStatistics, setRawChannelStatistics] = useState([]);

  // 新增：统计卡片数据状态
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [requestChart, setRequestChart] = useState(null);
  const [quotaChart, setQuotaChart] = useState(null);
  const [tokenChart, setTokenChart] = useState(null);
  const [rpmData, setRpmData] = useState({ rpm: 0, maxRPM: 0, usageRpmRate: 0, tpm: 0 });

  // 新增：消费金额Top5用户统计
  const [top5UserQuotaLoading, setTop5UserQuotaLoading] = useState(true);
  const [top5UserQuotaData, setTop5UserQuotaData] = useState(null);

  // 获取统计卡片数据
  const fetchSummaryData = async () => {
    setSummaryLoading(true);
    try {
      // 获取最近7天的数据用于图表和今日/昨日对比
      const endDate = dayjs().endOf('day');
      const startDate = dayjs().subtract(6, 'day').startOf('day');
      
      const res = await API.get('/api/analytics/summary', {
        params: { 
          user_id: userId, 
          start: startDate.unix(), 
          end: endDate.unix() 
        }
      });
      
      const { success, data } = res.data;
      if (success && data) {
        // 按日期汇总数据
        const dailyData = {};
        const today = dayjs().format('YYYY-MM-DD');
        const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
        
        // 初始化最近7天的数据
        for (let i = 6; i >= 0; i--) {
          const dateKey = dayjs().subtract(i, 'day').format('YYYY-MM-DD');
          dailyData[dateKey] = { requestCount: 0, quota: 0, tokens: 0 };
        }
        
        // 汇总每天的数据
        data.forEach(item => {
          const dateKey = item.Date;
          if (dailyData[dateKey]) {
            dailyData[dateKey].requestCount += item.RequestCount || 0;
            dailyData[dateKey].quota += item.Quota || 0;
            dailyData[dateKey].tokens += (item.PromptTokens || 0) + (item.CompletionTokens || 0);
          }
        });
        
        // 生成图表数据
        const dates = Object.keys(dailyData).sort();
        const generateChartData = (getValue) => ({
          series: [{ data: dates.map(date => ({ x: date, y: getValue(dailyData[date]) })) }]
        });
        
        const todayData = dailyData[today] || { requestCount: 0, quota: 0, tokens: 0 };
        const yesterdayData = dailyData[yesterday] || { requestCount: 0, quota: 0, tokens: 0 };
        
        setRequestChart({
          chartData: generateChartData(d => d.requestCount),
          todayValue: todayData.requestCount,
          lastDayValue: yesterdayData.requestCount
        });
        
        setQuotaChart({
          chartData: generateChartData(d => d.quota / 500000), // 转换为美元
          todayValue: '$' + (todayData.quota / 500000).toFixed(2),
          lastDayValue: '$' + (yesterdayData.quota / 500000).toFixed(2)
        });
        
        setTokenChart({
          chartData: generateChartData(d => d.tokens),
          todayValue: todayData.tokens,
          lastDayValue: yesterdayData.tokens
        });
      }
      
      setSummaryLoading(false);
    } catch (error) {
      console.error('Error fetching summary data:', error);
      setSummaryLoading(false);
    }
  };

  // 获取RPM/TPM数据
  const fetchRpmData = async () => {
    try {
      const res = await API.get('/api/analytics/summary/rate', {
        params: { user_id: userId }
      });
      const { success, data } = res.data;
      if (success && data) {
        setRpmData(data);
      }
    } catch (error) {
      console.error('Error fetching RPM data:', error);
    }
  };

  // 获取消费金额Top5用户数据
  const fetchTop5UserQuotaData = async (date) => {
    setTop5UserQuotaLoading(true);
    try {
      const res = await API.get('/api/analytics/top5_user_quota', {
        params: {
          start_timestamp: date.start.unix(),
          end_timestamp: date.end.unix()
        }
      });
      const { success, message, data } = res.data;
      if (success) {
        setTop5UserQuotaData(getTop5UserQuotaChartData(data, date));
      } else {
        showError(message);
        setTop5UserQuotaData(null);
      }
    } catch (error) {
      console.log(error);
      setTop5UserQuotaData(null);
    }
    setTop5UserQuotaLoading(false);
  };

  const handleSearch = () => {
    fetchData(dateRange, groupType, userId);
    fetchSummaryData();
    fetchRpmData();
    fetchTop5UserQuotaData(dateRange);
  };

  const handleDateRangeChange = (value) => {
    setDateRange(value);
  };

  const fetchData = async (date, gType, uId) => {
    setUsersLoading(true);
    setChannelLoading(true);
    setRedemptionLoading(true);
    setOrderLoading(true);
    try {
      const res = await API.get('/api/analytics/period', {
        params: {
          start_timestamp: date.start.unix(),
          end_timestamp: date.end.unix(),
          group_type: gType,
          user_id: uId
        }
      });
      const { success, message, data } = res.data;
      if (success) {
        if (data) {
          setUsersData(getUsersData(data?.user_statistics, date));

          setChannelData(getBarChartOptions(data?.channel_statistics, date));

          // 保存原始 channel_statistics 数据用于消费日志组件
          setRawChannelStatistics(data?.channel_statistics || []);

          setRedemptionData(getRedemptionData(data?.redemption_statistics, date));

          setOrderData(getOrdersData(data?.order_statistics, date));
        }
      } else {
        showError(message);
      }
      setUsersLoading(false);
      setChannelLoading(false);
      setRedemptionLoading(false);
      setOrderLoading(false);
    } catch (error) {
      console.log(error);
      return;
    }
  };

  useEffect(() => {
    fetchData(dateRange, groupType, userId);
    fetchSummaryData();
    fetchRpmData();
    fetchTop5UserQuotaData(dateRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Grid container spacing={gridSpacing}>
      {/* 四个统计卡片 - 放在页面最上方 */}
      <Grid item xs={12}>
        <Grid container spacing={gridSpacing}>
          <Grid item lg={3} xs={12} sx={{ height: '160px' }}>
            <StatisticalLineChartCard
              isLoading={summaryLoading}
              title={t('dashboard_index.today_requests')}
              type="request"
              chartData={requestChart?.chartData}
              todayValue={requestChart?.todayValue}
              lastDayValue={requestChart?.lastDayValue}
            />
          </Grid>
          <Grid item lg={3} xs={12} sx={{ height: '160px' }}>
            <StatisticalLineChartCard
              isLoading={summaryLoading}
              title={t('dashboard_index.today_consumption')}
              type="quota"
              chartData={quotaChart?.chartData}
              todayValue={quotaChart?.todayValue}
              lastDayValue={quotaChart?.lastDayValue}
            />
          </Grid>
          <Grid item lg={3} xs={12} sx={{ height: '160px' }}>
            <StatisticalLineChartCard
              isLoading={summaryLoading}
              title={t('dashboard_index.today_tokens')}
              type="token"
              chartData={tokenChart?.chartData}
              todayValue={tokenChart?.todayValue}
              lastDayValue={tokenChart?.lastDayValue}
            />
          </Grid>
          <Grid item lg={3} xs={12} sx={{ height: '160px' }}>
            <RPMCard
              isLoading={summaryLoading}
              rpmData={rpmData}
              onRefresh={fetchRpmData}
            />
          </Grid>
        </Grid>
      </Grid>

      {/* 筛选条件 */}
      <Grid item lg={12} xs={12}>
        <Box sx={{ display: 'flex', gap: 2, m: 3 }}>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} sm={6}>
              <DateRangePicker
                defaultValue={dateRange}
                onChange={handleDateRangeChange}
                localeText={{ start: '开始时间', end: '结束时间' }}
                fullWidth
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <Select value={groupType} onChange={(e) => setGroupType(e.target.value)} fullWidth>
                <MenuItem value="model_type">Model Type</MenuItem>
                <MenuItem value="model">Model</MenuItem>
                <MenuItem value="channel">Channel</MenuItem>
              </Select>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField type="number" label="用户ID" value={userId} onChange={(e) => setUserId(Number(e.target.value))} fullWidth />
            </Grid>

            <Grid item xs={12} sm={6}>
              <Button variant="contained" style={{ height: '100%' }} onClick={handleSearch} fullWidth>
                搜索
              </Button>
            </Grid>
          </Grid>
        </Box>
      </Grid>
      <Grid item xs={12}>
        <Typography variant="h3">
          {dateRange.start.format('YYYY-MM-DD')} - {dateRange.end.format('YYYY-MM-DD')}
        </Typography>
      </Grid>
      <Grid item xs={12}>
        <Divider />
      </Grid>

      <Grid item xs={12}>
        <ApexCharts
          id="cost"
          isLoading={channelLoading}
          chartDatas={channelData?.costs || {}}
          title={t('analytics_index.consumptionStatistics')}
          decimal={3}
        />
      </Grid>
      <Grid item xs={12}>
        <ApexCharts
          id="token"
          isLoading={channelLoading}
          chartDatas={channelData?.tokens || {}}
          title={t('analytics_index.tokensStatistics')}
          unit=""
        />
      </Grid>
      {/* <Grid item xs={12}>
        <ApexCharts
          id="latency"
          isLoading={channelLoading}
          chartDatas={channelData?.latency || {}}
          title={t('analytics_index.averageLatency')}
          unit=""
        />
      </Grid> */}
      <Grid item xs={12}>
        <ApexCharts
          id="requests"
          isLoading={channelLoading}
          chartDatas={channelData?.requests || {}}
          title={t('analytics_index.requestsCount')}
          unit=""
        />
      </Grid>
      <Grid item xs={12}>
        <ApexCharts
          id="top5UserQuota"
          isLoading={top5UserQuotaLoading}
          chartDatas={top5UserQuotaData || {}}
          title="消费金额Top5"
        />
      </Grid>
      <Grid item xs={12} md={6}>
        <ApexCharts isLoading={redemptionLoading} chartDatas={redemptionData} title={t('analytics_index.redemptionStatistics')} />
      </Grid>
      <Grid item xs={12} md={6}>
        <ApexCharts isLoading={usersLoading} chartDatas={usersData} title={t('analytics_index.registrationStatistics')} />
      </Grid>

      <Grid item xs={12} md={6}>
        <ApexCharts isLoading={orderLoading} chartDatas={orderData} title="充值" />
      </Grid>

      {/* 消费日志 */}
      <Grid item xs={12}>
        <QuotaLogWeek dateRange={dateRange} data={rawChannelStatistics} />
      </Grid>
    </Grid>
  );
}

function getDates(start, end) {
  var dates = [];
  var current = start;

  while (current.isBefore(end) || current.isSame(end)) {
    dates.push(current.format('YYYY-MM-DD'));
    current = current.add(1, 'day');
  }

  return dates;
}

function calculateDailyData(item, dateMap) {
  const index = dateMap.get(item.Date);
  if (index === undefined) return null;

  return {
    name: item.Channel,
    costs: calculateQuota(item.Quota, 3),
    tokens: item.PromptTokens + item.CompletionTokens,
    requests: item.RequestCount,
    latency: Number(item.RequestTime / 1000 / item.RequestCount).toFixed(3),
    index: index
  };
}

function getBarDataGroup(data, dates) {
  const dateMap = new Map(dates.map((date, index) => [date, index]));

  const result = {
    costs: { total: 0, data: new Map() },
    tokens: { total: 0, data: new Map() },
    requests: { total: 0, data: new Map() },
    latency: { total: 0, data: new Map() }
  };

  for (const item of data) {
    const dailyData = calculateDailyData(item, dateMap);
    if (!dailyData) continue;

    for (let key in result) {
      if (!result[key].data.has(dailyData.name)) {
        result[key].data.set(dailyData.name, { name: dailyData.name, data: new Array(dates.length).fill(0) });
      }
      const channelDailyData = result[key].data.get(dailyData.name);
      channelDailyData.data[dailyData.index] = dailyData[key];
      result[key].total += Number(dailyData[key]);
    }
  }
  return result;
}

function getBarChartOptions(data, dateRange) {
  if (!data) return null;

  const dates = getDates(dateRange.start, dateRange.end);
  const result = getBarDataGroup(data, dates);

  let channelData = {};

  channelData.costs = generateBarChartOptions(dates, Array.from(result.costs.data.values()), '美元', 3);
  channelData.costs.options.title.text = '总消费：$' + renderChartNumber(result.costs.total, 3);

  channelData.tokens = generateBarChartOptions(dates, Array.from(result.tokens.data.values()), '', 0);
  channelData.tokens.options.title.text = '总Tokens：' + renderChartNumber(result.tokens.total, 0);

  channelData.requests = generateBarChartOptions(dates, Array.from(result.requests.data.values()), '次', 0);
  channelData.requests.options.title.text = '总请求数：' + renderChartNumber(result.requests.total, 0);

  // 获取每天所有渠道的平均延迟
  let latency = Array.from(result.latency.data.values());
  let sums = [];
  let counts = [];
  for (let obj of latency) {
    for (let i = 0; i < obj.data.length; i++) {
      let value = parseFloat(obj.data[i]);
      sums[i] = sums[i] || 0;
      counts[i] = counts[i] || 0;
      if (value !== 0) {
        sums[i] = (sums[i] || 0) + value;
        counts[i] = (counts[i] || 0) + 1;
      }
    }
  }

  // 追加latency列表后面
  latency[latency.length] = {
    name: '平均延迟',
    data: sums.map((sum, i) => Number(counts[i] ? sum / counts[i] : 0).toFixed(3))
  };

  let dashArray = new Array(latency.length - 1).fill(0);
  dashArray.push(5);

  channelData.latency = generateBarChartOptions(dates, latency, '秒', 3);
  channelData.latency.type = 'line';
  channelData.latency.options.chart = {
    type: 'line',
    zoom: {
      enabled: false
    },
    background: 'transparent'
  };
  channelData.latency.options.stroke = {
    curve: 'smooth',
    dashArray: dashArray
  };

  return channelData;
}

function getRedemptionData(data, dateRange) {
  if (!data) return null;

  const dates = getDates(dateRange.start, dateRange.end);
  const result = [
    {
      name: '兑换金额($)',
      type: 'column',
      data: new Array(dates.length).fill(0)
    },
    {
      name: '独立用户(人)',
      type: 'line',
      data: new Array(dates.length).fill(0)
    }
  ];

  for (const item of data) {
    const index = dates.indexOf(item.date);
    if (index !== -1) {
      result[0].data[index] = calculateQuota(item.quota, 3);
      result[1].data[index] = item.user_count;
    }
  }

  let chartData = {
    height: 480,
    options: {
      chart: {
        type: 'line',
        background: 'transparent'
      },
      stroke: {
        width: [0, 4]
      },
      dataLabels: {
        enabled: true,
        enabledOnSeries: [1]
      },
      xaxis: {
        type: 'category',
        categories: dates
      },
      yaxis: [
        {
          title: {
            text: '兑换金额($)'
          }
        },
        {
          opposite: true,
          title: {
            text: '独立用户(人)'
          }
        }
      ],
      tooltip: {
        theme: 'dark'
      }
    },
    series: result
  };

  return chartData;
}

function getUsersData(data, dateRange) {
  if (!data) return null;

  const dates = getDates(dateRange.start, dateRange.end);
  const result = [
    {
      name: '直接注册',
      data: new Array(dates.length).fill(0)
    },
    {
      name: '邀请注册',
      data: new Array(dates.length).fill(0)
    }
  ];

  let total = 0;

  for (const item of data) {
    const index = dates.indexOf(item.date);
    if (index !== -1) {
      result[0].data[index] = item.user_count - item.inviter_user_count;
      result[1].data[index] = item.inviter_user_count;

      total += item.user_count;
    }
  }

  let chartData = generateBarChartOptions(dates, result, '人', 0);
  chartData.options.title.text = '总注册人数：' + total;

  return chartData;
}

function getOrdersData(data, dateRange) {
  if (!data) return null;

  const dates = getDates(dateRange.start, dateRange.end);
  const result = [
    {
      name: '充值',
      data: new Array(dates.length).fill(0)
    }
  ];

  let total = 0;

  for (const item of data) {
    const index = dates.indexOf(item.date);
    if (index !== -1) {
      result[0].data[index] = item.order_amount;

      total += item.order_amount;
    }
  }

  let chartData = generateBarChartOptions(dates, result, 'CNY', 0);
  chartData.options.title.text = '总充值数：' + total;

  return chartData;
}

// 获取消费金额Top5用户的图表数据
function getTop5UserQuotaChartData(data, dateRange) {
  if (!data) return null;

  // 1. 生成完整日期轴（复用 getDates）
  const dates = getDates(dateRange.start, dateRange.end);
  // 2. 创建日期->索引映射，用于快速定位
  const dateMap = new Map(dates.map((date, index) => [date, index]));

  // 3. 按用户分组数据
  const userDataMap = new Map();
  let rawTotal = 0;

  for (const item of data) {
    // 4. 匹配日期到索引位置
    const index = dateMap.get(item.date);
    if (index === undefined) continue;

    // 5. 初始化用户数据数组（默认填充0）
    if (!userDataMap.has(item.username)) {
      userDataMap.set(item.username, { name: item.username, data: new Array(dates.length).fill(0) });
    }

    // 6. 累加原始值用于总消费（避免四舍五入累计误差）
    rawTotal += Number(item.quota || 0);

    // 7. 转换为美元存入图表数据（转为数值，确保 ApexCharts 堆叠/tooltip 正常工作）
    userDataMap.get(item.username).data[index] = Number(calculateQuota(item.quota, 3));
  }

  // 8. 生成图表配置（复用 generateBarChartOptions）
  const chartData = generateBarChartOptions(dates, Array.from(userDataMap.values()), '美元', 3);
  // 9. 设置小标题：最后统一转换，避免累计误差
  chartData.options.title.text = '总消费：$' + calculateQuota(rawTotal, 3);

  return chartData;
}
