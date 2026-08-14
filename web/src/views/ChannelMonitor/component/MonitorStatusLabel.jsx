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

export default function MonitorStatusLabel({ status, sx }) {
  const { t } = useTranslation();
  const resolvedStatus = statusConfig[status] || {
    color: 'default',
    labelKey: 'common.unknown'
  };

  return (
    <Label color={resolvedStatus.color} variant="soft" sx={sx}>
      {t(resolvedStatus.labelKey)}
    </Label>
  );
}

MonitorStatusLabel.propTypes = {
  status: PropTypes.string,
  sx: PropTypes.object
};
