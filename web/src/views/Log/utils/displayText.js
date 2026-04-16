import { renderQuota, timestamp2string } from 'utils/common';
import { calculatePrice } from '../component/QuotaWithDetailContent';
import { calculateOriginalQuota } from '../component/QuotaWithDetailRow';

function translateWithFallback(t, key, fallback) {
  if (typeof t !== 'function') {
    return fallback;
  }

  const translated = t(key);
  return translated && translated !== key ? translated : fallback;
}

export function formatChannelText(item) {
  const channelId = item?.channel_id ?? '';
  const channelName = item?.channel?.name || '';

  if (channelId !== '' && channelName) {
    return `${channelId} (${channelName})`;
  }

  if (channelId !== '') {
    return `${channelId}`;
  }

  if (channelName) {
    return `(${channelName})`;
  }

  return '';
}

export function getGroupDisplayInfo(item, userGroup, t) {
  const metadata = item?.metadata || {};
  const fallbackGroupName = translateWithFallback(t, 'logPage.followUserGroup', '跟随用户');
  const fallbackBackupGroupName = translateWithFallback(t, 'logPage.backupGroup', '备份分组');
  const groupName = metadata.group_name;
  const backupGroupName = metadata.backup_group_name;

  if (metadata.is_backup_group) {
    const originalName = userGroup?.[groupName]?.name || fallbackGroupName;
    const backupName = userGroup?.[backupGroupName]?.name || fallbackBackupGroupName;

    return {
      backupName,
      isBackupGroup: true,
      originalName,
      text: `${originalName} -> ${backupName}`
    };
  }

  const activeGroupName = groupName || backupGroupName;
  if (!activeGroupName) {
    return {
      isBackupGroup: false,
      singleName: '',
      text: ''
    };
  }

  const singleName = userGroup?.[activeGroupName]?.name || fallbackGroupName;

  return {
    isBackupGroup: false,
    singleName,
    text: singleName
  };
}

export function formatGroupText(item, userGroup, t) {
  return getGroupDisplayInfo(item, userGroup, t).text;
}

export function getModelDisplayInfo(item) {
  const modelName = item?.model_name || '';
  const isStream = Boolean(item?.is_stream);

  if (!modelName) {
    return {
      isStream: false,
      modelName: '',
      text: ''
    };
  }

  return {
    isStream,
    modelName,
    text: isStream ? `${modelName} (Stream)` : modelName
  };
}

export function formatModelText(item) {
  return getModelDisplayInfo(item).text;
}

export function requestTimeLabelOptions(requestTime) {
  if (requestTime === 0) {
    return 'default';
  }

  if (requestTime <= 10) {
    return 'success';
  }

  if (requestTime <= 50) {
    return 'primary';
  }

  if (requestTime <= 100) {
    return 'secondary';
  }

  return 'error';
}

export function requestTSLabelOptions(requestTs) {
  if (requestTs === 0) {
    return 'default';
  }

  if (requestTs <= 10) {
    return 'error';
  }

  if (requestTs <= 15) {
    return 'secondary';
  }

  if (requestTs <= 20) {
    return 'primary';
  }

  return 'success';
}

export function getDurationInfo(item) {
  const requestTime = (item?.request_time || 0) / 1000;
  const requestTimeText = item?.request_time === 0 ? '无' : `${requestTime.toFixed(2)} S`;
  const firstTime = item?.metadata?.first_response ? item.metadata.first_response / 1000 : 0;
  const firstTimeText = firstTime ? `${firstTime.toFixed(2)} S` : '';
  const streamTime = requestTime - firstTime;

  let requestTs = 0;
  let requestTsText = '';

  if (firstTime > 0 && item?.completion_tokens > 0 && streamTime > 0) {
    requestTs = item.completion_tokens / streamTime;
    requestTsText = `${requestTs.toFixed(2)} t/s`;
  }

  return {
    firstTime,
    firstTimeText,
    requestTime,
    requestTimeText,
    requestTs,
    requestTsText
  };
}

export function formatDurationText(item) {
  const { firstTimeText, requestTimeText, requestTsText } = getDurationInfo(item);
  const lines = [`${requestTimeText}${firstTimeText ? ` / ${firstTimeText}` : ''}`];

  if (requestTsText) {
    lines.push(requestTsText);
  }

  return lines.join('\n');
}

export function formatRequestTimeText(item) {
  return getDurationInfo(item).requestTimeText;
}

export function calculateTokens(item) {
  const { prompt_tokens, completion_tokens, metadata } = item;

  if (!prompt_tokens || !metadata) {
    return {
      totalInputTokens: prompt_tokens || 0,
      totalOutputTokens: completion_tokens || 0,
      show: false,
      tokenDetails: []
    };
  }

  let totalInputTokens = prompt_tokens;
  let totalOutputTokens = completion_tokens;
  let show = false;

  const inputAudioTokens = metadata?.input_audio_tokens_ratio || 1;
  const outputAudioTokens = metadata?.output_audio_tokens_ratio || 1;
  const inputImageTokens = metadata?.input_image_tokens_ratio || 1;
  const outputImageTokens = metadata?.output_image_tokens_ratio || 1;

  const cachedRatio = metadata?.cached_tokens_ratio || 1;
  const cachedWriteRatio = metadata?.cached_write_tokens_ratio || 1;
  const cachedReadRatio = metadata?.cached_read_tokens_ratio || 1;
  const reasoningTokens = metadata?.reasoning_tokens_ratio || 1;
  const inputTextTokensRatio = metadata?.input_text_tokens_ratio || 1;
  const outputTextTokensRatio = metadata?.output_text_tokens_ratio || 1;

  const tokenDetails = [
    {
      key: 'input_text_tokens',
      label: 'logPage.inputTextTokens',
      rate: inputTextTokensRatio,
      labelParams: { ratio: inputTextTokensRatio }
    },
    {
      key: 'output_text_tokens',
      label: 'logPage.outputTextTokens',
      rate: outputTextTokensRatio,
      labelParams: { ratio: outputTextTokensRatio }
    },
    {
      key: 'input_audio_tokens',
      label: 'logPage.inputAudioTokens',
      rate: inputAudioTokens,
      labelParams: { ratio: inputAudioTokens }
    },
    {
      key: 'output_audio_tokens',
      label: 'logPage.outputAudioTokens',
      rate: outputAudioTokens,
      labelParams: { ratio: outputAudioTokens }
    },
    { key: 'cached_tokens', label: 'logPage.cachedTokens', rate: cachedRatio, labelParams: { ratio: cachedRatio } },
    {
      key: 'cached_write_tokens',
      label: 'logPage.cachedWriteTokens',
      rate: cachedWriteRatio,
      labelParams: { ratio: cachedWriteRatio }
    },
    {
      key: 'cached_read_tokens',
      label: 'logPage.cachedReadTokens',
      rate: cachedReadRatio,
      labelParams: { ratio: cachedReadRatio }
    },
    { key: 'reasoning_tokens', label: 'logPage.reasoningTokens', rate: reasoningTokens, labelParams: { ratio: reasoningTokens } },
    {
      key: 'input_image_tokens',
      label: 'logPage.inputImageTokens',
      rate: inputImageTokens,
      labelParams: { ratio: inputImageTokens }
    },
    {
      key: 'output_image_tokens',
      label: 'logPage.outputImageTokens',
      rate: outputImageTokens,
      labelParams: { ratio: outputImageTokens }
    }
  ]
    .filter(({ key }) => metadata[key] > 0)
    .map(({ key, label, rate, labelParams }) => {
      const tokens = Math.ceil(metadata[key] * (rate - 1));

      const isInputToken = [
        'input_text_tokens',
        'output_text_tokens',
        'input_audio_tokens',
        'cached_tokens',
        'cached_write_tokens',
        'cached_read_tokens',
        'input_image_tokens'
      ].includes(key);
      const isOutputToken = ['output_audio_tokens', 'reasoning_tokens', 'output_image_tokens'].includes(key);

      if (isInputToken) {
        totalInputTokens += tokens;
        show = true;
      } else if (isOutputToken) {
        totalOutputTokens += tokens;
        show = true;
      }

      return { key, label, tokens, value: metadata[key], rate, labelParams };
    });

  return {
    totalInputTokens,
    totalOutputTokens,
    show,
    tokenDetails
  };
}

export function formatInputText(item) {
  return item?.prompt_tokens ? `${item.prompt_tokens}` : '';
}

export function getQuotaTextLines(item) {
  if (item?.type === 2) {
    const groupRatio = item?.metadata?.group_ratio || 1;
    const originalQuota = calculateOriginalQuota(item);
    const quota = item?.quota || 0;

    if (groupRatio < 1) {
      return [renderQuota(originalQuota, 6), renderQuota(quota, 6)];
    }

    return [renderQuota(quota, 6)];
  }

  if (item?.quota) {
    return [renderQuota(item.quota, 6)];
  }

  return ['$0'];
}

export function formatQuotaText(item) {
  return getQuotaTextLines(item).join('\n');
}

export function formatTypeText(type, logTypes, t) {
  return logTypes?.[type]?.text || translateWithFallback(t, 'logPage.unknown', 'Unknown');
}

export function getDetailTextLines(item, t) {
  if (!item?.metadata?.input_ratio) {
    const free = (item?.quota === 0 || item?.quota === undefined) && item?.type === 2;

    if (free) {
      return [translateWithFallback(t, 'logPage.content.free', 'Free')];
    }

    return [item?.content || ''];
  }

  const groupDiscount = item?.metadata?.group_ratio || 1;
  const priceType = item?.metadata?.price_type || '';
  const outputRatio = item?.metadata?.output_ratio || 0;
  const inputRatio = item?.metadata?.input_ratio || 0;

  if (priceType === 'times') {
    return [
      t('logPage.content.times_price', {
        times: calculatePrice(inputRatio, groupDiscount, true)
      })
    ];
  }

  return [
    t('logPage.content.input_price', {
      price: calculatePrice(inputRatio, groupDiscount, false)
    }),
    t('logPage.content.output_price', {
      price: calculatePrice(outputRatio, groupDiscount, false)
    })
  ];
}

export function formatDetailText(item, t) {
  return getDetailTextLines(item, t).join('\n');
}

export function statusCodeColor(statusCode) {
  if (statusCode >= 500) {
    return 'error';
  }

  if (statusCode >= 400) {
    return 'warning';
  }

  return 'success';
}

export function formatCellText(columnId, item, ctx = {}) {
  switch (columnId) {
    case 'created_at':
      return timestamp2string(item?.created_at);
    case 'channel_id':
      return formatChannelText(item);
    case 'user_id':
      return item?.username || '';
    case 'group':
      return formatGroupText(item, ctx.userGroup, ctx.t);
    case 'type':
      return formatTypeText(item?.type, ctx.logTypes, ctx.t);
    case 'model_name':
      return formatModelText(item);
    case 'duration':
      return formatDurationText(item);
    case 'request_time':
      return formatRequestTimeText(item);
    case 'message':
      return formatInputText(item);
    case 'completion':
      return item?.completion_tokens || '';
    case 'quota':
      return formatQuotaText(item);
    case 'detail':
      return formatDetailText(item, ctx.t);
    case 'content':
      return item?.content || '';
    default: {
      const value = item?.[columnId];
      return value ?? '';
    }
  }
}
