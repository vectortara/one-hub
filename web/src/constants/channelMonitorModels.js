export const DEFAULT_CHANNEL_MONITOR_MODELS = ['gpt-5.4', 'gpt-5.5', 'claude-sonnet-4-6', 'claude-sonnet-5', 'gemini-3.5-flash'];

export function normalizeChannelMonitorModels(models) {
  const nextModels = [];
  const seenModels = new Set();

  models.forEach((model) => {
    const normalizedModel = typeof model === 'string' ? model.trim() : '';
    if (normalizedModel === '' || seenModels.has(normalizedModel)) {
      return;
    }

    seenModels.add(normalizedModel);
    nextModels.push(normalizedModel);
  });

  return nextModels;
}

export function parseChannelMonitorModelsConfig(configValue, fallbackModels = DEFAULT_CHANNEL_MONITOR_MODELS) {
  const normalizedFallbackModels = normalizeChannelMonitorModels(
    Array.isArray(fallbackModels) ? fallbackModels : DEFAULT_CHANNEL_MONITOR_MODELS
  );

  if (Array.isArray(configValue)) {
    const nextModels = normalizeChannelMonitorModels(configValue);
    return nextModels.length > 0 ? nextModels : normalizedFallbackModels;
  }

  if (typeof configValue !== 'string') {
    return normalizedFallbackModels;
  }

  const nextModels = normalizeChannelMonitorModels(configValue.replace(/\r/g, '').split(/[\n,]+/));
  return nextModels.length > 0 ? nextModels : normalizedFallbackModels;
}

export function getChannelMonitorModelsFromSiteInfo(siteInfo) {
  return parseChannelMonitorModelsConfig(siteInfo?.default_channel_monitor_models, DEFAULT_CHANNEL_MONITOR_MODELS);
}
