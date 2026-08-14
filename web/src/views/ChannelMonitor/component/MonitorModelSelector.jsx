import PropTypes from 'prop-types';

import { Alert, Box, Stack, ToggleButton, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';

export default function MonitorModelSelector({ models, selectedModels, pendingTemporaryModel, onToggleModel }) {
  const { t } = useTranslation();
  const hasPendingTemporaryModel = pendingTemporaryModel !== '' && !models.includes(pendingTemporaryModel);

  return (
    <Stack spacing={2} padding={3} paddingTop={0}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'flex-start', sm: 'center' }}>
        <Typography variant="h4">{t('channel_monitor_page.monitorModels')}</Typography>
        <Typography variant="body2" color="text.secondary">
          {t('channel_monitor_page.selectedCount', { count: selectedModels.length })}
        </Typography>
      </Stack>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {models.map((model) => (
          <ToggleButton
            key={model}
            value={model}
            size="small"
            selected={selectedModels.includes(model)}
            onChange={() => onToggleModel(model)}
            sx={{ textTransform: 'none' }}
          >
            {model}
          </ToggleButton>
        ))}
      </Box>

      <Alert severity="info" variant="outlined">
        {t('channel_monitor_page.temporaryModelTip')}
        {hasPendingTemporaryModel ? ` ${t('channel_monitor_page.pendingTemporaryModel', { model: pendingTemporaryModel })}` : ''}
      </Alert>
    </Stack>
  );
}

MonitorModelSelector.propTypes = {
  models: PropTypes.arrayOf(PropTypes.string),
  selectedModels: PropTypes.arrayOf(PropTypes.string),
  pendingTemporaryModel: PropTypes.string,
  onToggleModel: PropTypes.func
};
