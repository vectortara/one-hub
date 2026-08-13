import PropTypes from 'prop-types';

import { useTranslation } from 'react-i18next';

import Label from 'ui-component/Label';

const statusConfig = {
  pending: {
    color: 'warning',
    labelKey: 'channel_monitor.statusPending'
  },
  healthy: {
    color: 'success',
    labelKey: 'channel_monitor.statusHealthy'
  },
  unhealthy: {
    color: 'warning',
    labelKey: 'channel_monitor.statusUnhealthy'
  },
  no_response: {
    color: 'error',
    labelKey: 'channel_monitor.statusNoResponse'
  }
};

export default function MonitorStatusLabel({ status }) {
  const { t } = useTranslation();
  const resolvedStatus = statusConfig[status] || {
    color: 'default',
    labelKey: 'common.unknown'
  };

  return (
    <Label color={resolvedStatus.color} variant="soft">
      {t(resolvedStatus.labelKey)}
    </Label>
  );
}

MonitorStatusLabel.propTypes = {
  status: PropTypes.string
};
