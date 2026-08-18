import PropTypes from 'prop-types';

import { alpha } from '@mui/material/styles';
import { Box, Card, CardContent, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';

import Label from 'ui-component/Label';

import MonitorStatusLabel from './MonitorStatusLabel';

const getMonitorDetailTextSx = (theme) => ({
  fontFamily: theme.typography.fontSecondaryFamily,
  fontSize: '0.875rem',
  fontWeight: theme.typography.fontWeightSemiBold,
  lineHeight: 22 / 14,
  letterSpacing: '0.01em',
  color: theme.palette.text.primary
});

const getMonitorSpeedTextSx = (theme, hasValue) => ({
  ...getMonitorDetailTextSx(theme),
  fontVariantNumeric: 'tabular-nums',
  fontFeatureSettings: '"tnum" 1',
  color: hasValue ? theme.palette.text.secondary : theme.palette.text.disabled
});

const getMonitorErrorTextSx = (theme) => ({
  ...getMonitorDetailTextSx(theme),
  color: theme.palette.error.main,
  lineHeight: 1.35
});

function formatMonitorResponseTime(responseTime) {
  if (typeof responseTime !== 'number') {
    return '';
  }

  if (responseTime >= 1000) {
    return `${(responseTime / 1000).toFixed(2)} s`;
  }

  return `${responseTime} ms`;
}

function getChannelStatusPresentation(t, status) {
  switch (status) {
    case 1:
      return {
        color: 'success',
        text: t('channel_index.enabled')
      };
    case 2:
      return {
        color: 'warning',
        text: t('channel_index.disabled')
      };
    case 3:
      return {
        color: 'info',
        text: t('channel_index.speedTestDisabled')
      };
    default:
      return {
        color: 'default',
        text: t('common.unknown')
      };
  }
}

export default function MonitorTableRow({ item }) {
  const { t } = useTranslation();
  const channelStatus = getChannelStatusPresentation(t, item.status);
  const matchedModels = item.matched_models || [];

  return (
    <Card
      data-testid={`channel-monitor-card-${item.id}`}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRadius: 3,
        backgroundColor: (theme) =>
          theme.palette.mode === 'dark' ? alpha(theme.palette.background.paper, 0.72) : theme.palette.background.paper,
        border: (theme) => `1px solid ${theme.palette.mode === 'dark' ? alpha('#fff', 0.08) : alpha('#000', 0.06)}`,
        transition: 'all 0.25s ease',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: (theme) => (theme.palette.mode === 'dark' ? '0 14px 32px rgba(0, 0, 0, 0.35)' : '0 14px 28px rgba(0, 0, 0, 0.12)'),
          borderColor: (theme) => alpha(theme.palette.primary.main, 0.28)
        }
      }}
    >
      <Box
        sx={{
          p: 2.5,
          background: (theme) =>
            theme.palette.mode === 'dark'
              ? `linear-gradient(135deg, ${alpha(theme.palette.primary.dark, 0.28)} 0%, ${alpha(theme.palette.info.dark, 0.08)} 100%)`
              : `linear-gradient(135deg, ${alpha(theme.palette.primary.light, 0.28)} 0%, ${alpha(theme.palette.info.light, 0.16)} 100%)`,
          borderBottom: (theme) => `1px solid ${theme.palette.mode === 'dark' ? alpha('#fff', 0.05) : alpha('#000', 0.04)}`
        }}
      >
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', sm: 'center' }}
        >
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
              <Box
                sx={{
                  px: 1,
                  py: 0.5,
                  borderRadius: 999,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  lineHeight: 1,
                  color: 'primary.main',
                  backgroundColor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.22 : 0.12)
                }}
              >
                #{item.id}
              </Box>
              <Label color={channelStatus.color} variant="soft">
                {channelStatus.text}
              </Label>
            </Stack>
            <Typography variant="h4" sx={{ mt: 1.25, wordBreak: 'break-word' }}>
              {item.name || '-'}
            </Typography>
          </Box>

          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
            {t('channel_monitor_page.matchedModelsCount', { count: matchedModels.length })}
          </Typography>
        </Stack>
      </Box>

      <CardContent sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5, flex: 1 }}>
        {matchedModels.length > 0 ? (
          matchedModels.map((matchedModel) => {
            const responseTimeText = formatMonitorResponseTime(matchedModel.response_time);

            return (
              <Box
                key={`${item.id}-${matchedModel.model}`}
                sx={{
                  p: 1.75,
                  borderRadius: 2.5,
                  border: (theme) => `1px solid ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.12 : 0.08)}`,
                  backgroundColor: (theme) =>
                    theme.palette.mode === 'dark' ? alpha(theme.palette.background.default, 0.35) : alpha(theme.palette.grey[50], 0.95)
                }}
              >
                <Stack spacing={1.25}>
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1.5}
                    justifyContent="space-between"
                    alignItems={{ xs: 'flex-start', sm: 'center' }}
                  >
                    <Typography sx={(theme) => ({ ...getMonitorDetailTextSx(theme), wordBreak: 'break-word' })}>
                      {matchedModel.model}
                    </Typography>

                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center" justifyContent="flex-end">
                      <Box
                        sx={{
                          px: 1.25,
                          py: 0.75,
                          minWidth: 88,
                          borderRadius: 999,
                          textAlign: 'center',
                          border: (theme) => `1px solid ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.1 : 0.08)}`,
                          backgroundColor: (theme) =>
                            theme.palette.mode === 'dark'
                              ? alpha(theme.palette.background.paper, 0.4)
                              : alpha(theme.palette.background.default, 0.8)
                        }}
                      >
                        <Typography sx={(theme) => getMonitorSpeedTextSx(theme, responseTimeText !== '')}>
                          {responseTimeText || t('channel_monitor_page.notAvailable')}
                        </Typography>
                      </Box>

                      <MonitorStatusLabel
                        status={matchedModel.probe_status}
                        sx={{
                          minWidth: 84,
                          px: 1.25,
                          py: 0.625,
                          borderRadius: 999,
                          justifyContent: 'center'
                        }}
                      />
                    </Stack>
                  </Stack>

                  {matchedModel.error_message && (
                    <Typography
                      sx={(theme) => ({
                        ...getMonitorErrorTextSx(theme),
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word'
                      })}
                    >
                      {matchedModel.error_message}
                    </Typography>
                  )}
                </Stack>
              </Box>
            );
          })
        ) : (
          <Box
            sx={{
              flex: 1,
              borderRadius: 2.5,
              border: (theme) => `1px dashed ${theme.palette.divider}`,
              backgroundColor: (theme) =>
                theme.palette.mode === 'dark' ? alpha(theme.palette.background.default, 0.22) : alpha(theme.palette.grey[50], 0.9),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              p: 2.5
            }}
          >
            <Typography variant="body2" color="text.secondary" align="center">
              {t('channel_monitor_page.noMatchedModels')}
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

MonitorTableRow.propTypes = {
  item: PropTypes.shape({
    id: PropTypes.number,
    name: PropTypes.string,
    status: PropTypes.number,
    matched_models: PropTypes.arrayOf(
      PropTypes.shape({
        model: PropTypes.string,
        probe_status: PropTypes.string,
        response_time: PropTypes.number,
        error_message: PropTypes.string
      })
    )
  })
};
