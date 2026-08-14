import PropTypes from 'prop-types';

import { useTranslation } from 'react-i18next';

import Label from 'ui-component/Label';

const statusConfig = {
  pending: {
    color: 'warning',
    labelKey: 'channel_monitor_page.statusPending'
  },
  healthy: {
    color: 'success',
    labelKey: 'channel_monitor_page.statusHealthy'
  },
  unhealthy: {
    color: 'warning',
    labelKey: 'channel_monitor_page.statusUnhealthy'
  },
  no_response: {
    color: 'error',
    labelKey: 'channel_monitor_page.statusNoResponse'
  }
};

const monitorStatusLabelSx = (theme) => ({
  fontFamily: theme.typography.fontSecondaryFamily,
  fontSize: { xs: '0.94rem', md: '1rem' },
  fontWeight: theme.typography.fontWeightSemiBold,
  lineHeight: 1.2,
  letterSpacing: '0.015em'
});

export default function MonitorStatusLabel({ status, sx }) {
  const { t } = useTranslation();
  const resolvedStatus = statusConfig[status] || {
    color: 'default',
    labelKey: 'common.unknown'
  };

  return (
    <Label color={resolvedStatus.color} variant="soft" sx={[monitorStatusLabelSx, sx]}>
      {t(resolvedStatus.labelKey)}
    </Label>
  );
}

MonitorStatusLabel.propTypes = {
  status: PropTypes.string,
  sx: PropTypes.oneOfType([PropTypes.object, PropTypes.array, PropTypes.func])
};
