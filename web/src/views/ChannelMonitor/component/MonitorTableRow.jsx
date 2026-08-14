import PropTypes from 'prop-types';

import { Box, Stack, TableCell, TableRow, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';

import { CHANNEL_OPTIONS } from 'constants/ChannelConstants';
import Label from 'ui-component/Label';
import GroupLabel from 'views/Channel/component/GroupLabel';

import MonitorStatusLabel from './MonitorStatusLabel';

const monitorDetailTextSx = {
  fontSize: { xs: '0.95rem', md: '1.05rem' },
  fontWeight: 700,
  lineHeight: 1.5,
  letterSpacing: '0.01em'
};

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

export default function MonitorTableRow({ item, detailColSpan }) {
  const { t } = useTranslation();
  const channelTypeOption = CHANNEL_OPTIONS[item.type];
  const channelStatus = getChannelStatusPresentation(t, item.status);
  const matchedModels = item.matched_models || [];

  return (
    <>
      <TableRow
        hover
        sx={{
          '& > td': {
            py: 2,
            verticalAlign: 'top',
            borderBottom: 0
          }
        }}
      >
        <TableCell align="left">{item.id}</TableCell>
        <TableCell align="left">
          <Typography variant="subtitle2">{item.name || '-'}</Typography>
        </TableCell>
        <TableCell align="left">
          <GroupLabel group={item.group || ''} />
        </TableCell>
        <TableCell align="left">
          {channelTypeOption ? (
            <Label color={channelTypeOption.color} variant="outlined">
              {channelTypeOption.text}
            </Label>
          ) : (
            <Typography variant="body2">{t('common.unknown')}</Typography>
          )}
        </TableCell>
        <TableCell align="left">
          <Label color={channelStatus.color} variant="outlined">
            {channelStatus.text}
          </Label>
        </TableCell>
      </TableRow>

      <TableRow
        sx={{
          '& > td': {
            pt: 0,
            pb: 2
          }
        }}
      >
        <TableCell colSpan={detailColSpan} align="left">
          <Stack spacing={1.25} sx={{ pl: { md: 2 } }}>
            {matchedModels.map((matchedModel) => {
              const responseTimeText = formatMonitorResponseTime(matchedModel.response_time);

              return (
                <Box
                  key={`${item.id}-${matchedModel.model}`}
                  sx={{
                    p: { xs: 1.75, md: 2 },
                    borderRadius: 2,
                    border: (theme) => `1px solid ${theme.palette.divider}`,
                    bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.04)' : 'grey.50')
                  }}
                >
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                      gap: { xs: 1, md: 1.5 },
                      alignItems: 'center',
                      justifyItems: 'center',
                      textAlign: 'center'
                    }}
                  >
                    <Typography sx={{ ...monitorDetailTextSx, wordBreak: 'break-word' }}>{matchedModel.model}</Typography>
                    <Typography sx={{ ...monitorDetailTextSx, color: responseTimeText !== '' ? 'text.primary' : 'text.secondary' }}>
                      {responseTimeText || t('channel_monitor_page.notAvailable')}
                    </Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                      <MonitorStatusLabel
                        status={matchedModel.probe_status}
                        sx={{
                          minWidth: { xs: 88, md: 100 },
                          height: { xs: 30, md: 34 },
                          px: 1.5,
                          borderRadius: 1.5,
                          fontSize: { xs: '0.95rem', md: '1.05rem' },
                          fontWeight: 700,
                          lineHeight: 1.5,
                          letterSpacing: '0.01em'
                        }}
                      />
                    </Box>
                  </Box>

                  {matchedModel.error_message && (
                    <Typography
                      color="error.main"
                      sx={{
                        ...monitorDetailTextSx,
                        display: 'block',
                        mt: 1.25,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word'
                      }}
                    >
                      {matchedModel.error_message}
                    </Typography>
                  )}
                </Box>
              );
            })}
          </Stack>
        </TableCell>
      </TableRow>
    </>
  );
}

MonitorTableRow.propTypes = {
  detailColSpan: PropTypes.number.isRequired,
  item: PropTypes.shape({
    id: PropTypes.number,
    name: PropTypes.string,
    group: PropTypes.string,
    type: PropTypes.number,
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
