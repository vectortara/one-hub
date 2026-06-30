import PropTypes from 'prop-types';
import { Box, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';

import Label from 'ui-component/Label';
import { detailPanelContainerSx, detailPanelScrollableRowSx, detailPanelSectionSx } from './QuotaWithDetailContent';

function getAttemptStatusColor(statusCode) {
  if (statusCode >= 500) {
    return 'error';
  }

  if (statusCode >= 400) {
    return 'warning';
  }

  return 'default';
}

function formatChannelDisplay(attempt) {
  const channelId = attempt?.channel_id ?? '';
  const channelName = attempt?.channel_name || '';

  if (channelId !== '' && channelName) {
    return `${channelId}(${channelName})`;
  }

  if (channelId !== '') {
    return `${channelId}`;
  }

  if (channelName) {
    return `(${channelName})`;
  }

  return '-';
}

function renderFieldValue(value) {
  return value === '' || value === null || value === undefined ? '-' : value;
}

const summaryCardSx = {
  flex: 1,
  minWidth: 160,
  p: 2,
  borderRadius: 1,
  background: (theme) => (theme.palette.mode === 'dark' ? theme.palette.background.default : '#fafbfc')
};

const attemptCardSx = {
  p: 2,
  borderRadius: 1.5,
  border: (theme) => `1px solid ${theme.palette.divider}`,
  background: (theme) => theme.palette.background.paper
};

const attemptFieldTextSx = {
  fontSize: 13,
  color: (theme) => theme.palette.text.secondary,
  textAlign: 'left'
};

export default function RetryWithDetailContent({ retryTrace }) {
  const { t } = useTranslation();
  const attempts = Array.isArray(retryTrace?.attempts)
    ? [...retryTrace.attempts].sort((left, right) => (left?.sequence || 0) - (right?.sequence || 0))
    : [];

  const attemptCount = retryTrace?.attempt_count || attempts.length;
  const retryCount = retryTrace?.retry_count ?? Math.max(attemptCount - 1, 0);
  const totalDuration = retryTrace?.total_duration_ms ?? attempts.reduce((sum, attempt) => sum + (attempt?.duration || 0), 0);

  return (
    <Box sx={detailPanelContainerSx}>
      <Box sx={detailPanelScrollableRowSx}>
        <Box sx={summaryCardSx}>
          <Typography sx={{ fontSize: 12, color: (theme) => theme.palette.text.secondary, mb: 0.5 }}>
            {t('logPage.retryDetail.attemptCount')}
          </Typography>
          <Typography sx={{ fontSize: 18, fontWeight: 600 }}>{attemptCount}</Typography>
        </Box>
        <Box sx={summaryCardSx}>
          <Typography sx={{ fontSize: 12, color: (theme) => theme.palette.text.secondary, mb: 0.5 }}>
            {t('logPage.retryDetail.retryCount')}
          </Typography>
          <Typography sx={{ fontSize: 18, fontWeight: 600 }}>{retryCount}</Typography>
        </Box>
        <Box sx={summaryCardSx}>
          <Typography sx={{ fontSize: 12, color: (theme) => theme.palette.text.secondary, mb: 0.5 }}>
            {t('logPage.retryDetail.totalDuration')}
          </Typography>
          <Typography sx={{ fontSize: 18, fontWeight: 600 }}>{`${totalDuration} ms`}</Typography>
        </Box>
      </Box>

      <Box sx={detailPanelSectionSx}>
        <Typography sx={{ fontSize: 15, fontWeight: 600, mb: 2 }}>{t('logPage.retryDetail.title')}</Typography>
        <Stack spacing={1.5}>
          {attempts.map((attempt) => (
            <Box key={attempt.sequence} sx={attemptCardSx}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'flex-start', sm: 'center' }} sx={{ mb: 1.5 }}>
                <Label color={attempt.success ? 'success' : getAttemptStatusColor(attempt.status_code)} variant="soft">
                  {`#${attempt.sequence} ${attempt.success ? t('logPage.retryDetail.success') : t('logPage.retryDetail.failed')}`}
                </Label>
                <Typography sx={{ fontSize: 13, fontWeight: 500, color: (theme) => theme.palette.text.primary }}>
                  {`${t('logPage.retryDetail.channel')}: ${formatChannelDisplay(attempt)}`}
                </Typography>
                <Typography sx={{ fontSize: 13, color: (theme) => theme.palette.text.secondary }}>
                  {`${t('logPage.retryDetail.duration')}: ${attempt.duration || 0} ms`}
                </Typography>
                <Typography sx={{ fontSize: 13, color: (theme) => theme.palette.text.secondary }}>
                  {`${t('logPage.retryDetail.statusCode')}: ${renderFieldValue(attempt.status_code)}`}
                </Typography>
              </Stack>

              <Stack spacing={0.5}>
                <Typography sx={attemptFieldTextSx}>
                  {`${t('logPage.retryDetail.errorCode')}: ${renderFieldValue(attempt.error_code)}`}
                </Typography>
                <Typography sx={attemptFieldTextSx}>
                  {`${t('logPage.retryDetail.errorType')}: ${renderFieldValue(attempt.error_type)}`}
                </Typography>
                <Typography sx={attemptFieldTextSx}>
                  {`${t('logPage.retryDetail.message')}: ${renderFieldValue(attempt.message)}`}
                </Typography>
              </Stack>
            </Box>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}

RetryWithDetailContent.propTypes = {
  retryTrace: PropTypes.shape({
    attempt_count: PropTypes.number,
    retry_count: PropTypes.number,
    total_duration_ms: PropTypes.number,
    attempts: PropTypes.arrayOf(
      PropTypes.shape({
        sequence: PropTypes.number,
        channel_id: PropTypes.number,
        channel_name: PropTypes.string,
        duration: PropTypes.number,
        status_code: PropTypes.number,
        error_code: PropTypes.string,
        error_type: PropTypes.string,
        message: PropTypes.string,
        success: PropTypes.bool
      })
    )
  })
};
