import PropTypes from 'prop-types';
import { useMemo, useState } from 'react';
import { ArrowForward } from '@mui/icons-material';

import Badge from '@mui/material/Badge';

import { TableRow, TableCell, Stack, Collapse, Tooltip, Typography } from '@mui/material';

import { renderQuota } from 'utils/common';
import Label from 'ui-component/Label';
import { useLogType } from '../type/LogType';
import { useTranslation } from 'react-i18next';
import QuotaWithDetailRow from './QuotaWithDetailRow';
import QuotaWithDetailContent from './QuotaWithDetailContent';
import { styled } from '@mui/material/styles';
import {
  calculateTokens,
  formatCellText,
  formatInputText,
  formatTypeText,
  getDetailTextLines,
  getDurationInfo,
  getGroupDisplayInfo,
  getModelDisplayInfo,
  requestTSLabelOptions,
  requestTimeLabelOptions,
  statusCodeColor
} from '../utils/displayText';

const logItemPropType = PropTypes.shape({
  id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  quota: PropTypes.number,
  status_code: PropTypes.number,
  token_name: PropTypes.string,
  type: PropTypes.number,
  username: PropTypes.string
});

const columnVisibilityPropType = PropTypes.shape({
  channel_id: PropTypes.bool,
  completion: PropTypes.bool,
  content: PropTypes.bool,
  created_at: PropTypes.bool,
  detail: PropTypes.bool,
  duration: PropTypes.bool,
  error_code: PropTypes.bool,
  error_type: PropTypes.bool,
  group: PropTypes.bool,
  message: PropTypes.bool,
  model_name: PropTypes.bool,
  quota: PropTypes.bool,
  request_path: PropTypes.bool,
  request_time: PropTypes.bool,
  source_ip: PropTypes.bool,
  status_code: PropTypes.bool,
  token_name: PropTypes.bool,
  type: PropTypes.bool,
  user_id: PropTypes.bool
});

export default function LogTableRow({ item, userIsAdmin, userGroup, columnVisibility, isErrorLog = false }) {
  if (isErrorLog) {
    return <ErrorLogRow item={item} userIsAdmin={userIsAdmin} columnVisibility={columnVisibility} />;
  }

  return <NormalLogRow item={item} userIsAdmin={userIsAdmin} userGroup={userGroup} columnVisibility={columnVisibility} />;
}

function NormalLogRow({ item, userIsAdmin, userGroup, columnVisibility }) {
  const { t } = useTranslation();
  const LogType = useLogType();
  const durationInfo = getDurationInfo(item);
  const groupInfo = getGroupDisplayInfo(item, userGroup, t);
  const inputText = formatInputText(item);
  const { totalInputTokens, totalOutputTokens, show, tokenDetails } = useMemo(() => calculateTokens(item), [item]);
  const detailLines = getDetailTextLines(item, t);

  // 计算当前显示的列数
  const colCount = Object.entries(columnVisibility).filter(
    ([columnId, visible]) => visible && (userIsAdmin || !['channel_id', 'user_id'].includes(columnId))
  ).length;

  // 展开状态（仅type=2时才有展开）
  const [open, setOpen] = useState(false);
  const showExpand = item.type === 2 && columnVisibility.quota;

  return (
    <>
      <TableRow tabIndex={item.id}>
        {columnVisibility.created_at && <TableCell sx={{ p: '10px 8px' }}>{formatCellText('created_at', item)}</TableCell>}

        {userIsAdmin && columnVisibility.channel_id && <TableCell sx={{ p: '10px 8px' }}>{formatCellText('channel_id', item)}</TableCell>}
        {userIsAdmin && columnVisibility.user_id && (
          <TableCell sx={{ p: '10px 8px' }}>
            <Label color="default" variant="outlined" copyText={item.username}>
              {formatCellText('user_id', item)}
            </Label>
          </TableCell>
        )}

        {columnVisibility.group && (
          <TableCell sx={{ p: '10px 8px' }}>
            {groupInfo.isBackupGroup ? (
              // 显示分组重定向：原始分组 → 备份分组
              <Stack direction="row" spacing={1} alignItems="center">
                <Label color="default" variant="soft">
                  {groupInfo.originalName}
                </Label>
                <ArrowForward sx={{ fontSize: 16, color: 'text.secondary' }} />
                <Label color="warning" variant="soft">
                  {groupInfo.backupName}
                </Label>
              </Stack>
            ) : groupInfo.singleName ? (
              <Label color="default" variant="soft">
                {groupInfo.singleName}
              </Label>
            ) : (
              ''
            )}
          </TableCell>
        )}
        {columnVisibility.token_name && (
          <TableCell sx={{ p: '10px 8px' }}>
            {item.token_name && (
              <Label color="default" variant="soft" copyText={item.token_name}>
                {item.token_name}
              </Label>
            )}
          </TableCell>
        )}
        {columnVisibility.type && (
          <TableCell sx={{ p: '10px 8px' }}>
            <Label variant="filled" color={LogType[item.type]?.color || 'error'}>
              {' '}
              {formatTypeText(item.type, LogType, t)}{' '}
            </Label>
          </TableCell>
        )}
        {columnVisibility.model_name && <TableCell sx={{ p: '10px 8px' }}>{viewModelName(item)}</TableCell>}

        {columnVisibility.duration && (
          <TableCell sx={{ p: '10px 8px' }}>
            <Stack direction="column" spacing={0.5}>
              <Label color={requestTimeLabelOptions(durationInfo.requestTime)}>
                {`${durationInfo.requestTimeText}${durationInfo.firstTimeText ? ` / ${durationInfo.firstTimeText}` : ''}`}
              </Label>

              {durationInfo.requestTsText && (
                <Label color={requestTSLabelOptions(durationInfo.requestTs)}>{durationInfo.requestTsText}</Label>
              )}
            </Stack>
          </TableCell>
        )}
        {columnVisibility.message && (
          <TableCell sx={{ p: '10px 8px' }}>{viewInput(inputText, t, totalInputTokens, totalOutputTokens, show, tokenDetails)}</TableCell>
        )}
        {columnVisibility.completion && <TableCell sx={{ p: '10px 8px' }}>{formatCellText('completion', item)}</TableCell>}
        {columnVisibility.quota && (
          <TableCell sx={{ p: '10px 8px' }}>
            {item.type === 2 ? (
              <QuotaWithDetailRow item={item} open={open} setOpen={setOpen} />
            ) : item.quota ? (
              renderQuota(item.quota, 6)
            ) : (
              '$0'
            )}
          </TableCell>
        )}
        {columnVisibility.source_ip && <TableCell sx={{ p: '10px 8px' }}>{formatCellText('source_ip', item)}</TableCell>}
        {columnVisibility.detail && <TableCell sx={{ p: '10px 8px' }}>{viewLogContent(item, detailLines)}</TableCell>}
      </TableRow>
      {/* 展开行 */}
      {showExpand && (
        <TableRow>
          <TableCell colSpan={colCount} sx={{ p: 0, border: 0, bgcolor: 'transparent' }}>
            <Collapse in={open} timeout="auto" unmountOnExit>
              <QuotaWithDetailContent
                item={item}
                userGroup={userGroup}
                t={t}
                totalInputTokens={totalInputTokens}
                totalOutputTokens={totalOutputTokens}
              />
            </Collapse>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

LogTableRow.propTypes = {
  item: logItemPropType,
  userIsAdmin: PropTypes.bool,
  userGroup: PropTypes.object,
  columnVisibility: columnVisibilityPropType,
  isErrorLog: PropTypes.bool
};

NormalLogRow.propTypes = {
  item: logItemPropType,
  userIsAdmin: PropTypes.bool,
  userGroup: PropTypes.object,
  columnVisibility: columnVisibilityPropType
};

function ErrorLogRow({ item, userIsAdmin, columnVisibility }) {
  const requestTimeInfo = getDurationInfo(item);

  return (
    <TableRow tabIndex={item.id}>
      {columnVisibility.created_at && <TableCell sx={{ p: '10px 8px' }}>{formatCellText('created_at', item)}</TableCell>}
      {userIsAdmin && columnVisibility.channel_id && <TableCell sx={{ p: '10px 8px' }}>{formatCellText('channel_id', item)}</TableCell>}
      {userIsAdmin && columnVisibility.user_id && (
        <TableCell sx={{ p: '10px 8px' }}>
          <Label color="default" variant="outlined" copyText={item.username}>
            {formatCellText('user_id', item)}
          </Label>
        </TableCell>
      )}
      {columnVisibility.token_name && (
        <TableCell sx={{ p: '10px 8px' }}>
          {item.token_name && (
            <Label color="default" variant="soft" copyText={item.token_name}>
              {item.token_name}
            </Label>
          )}
        </TableCell>
      )}
      {columnVisibility.model_name && <TableCell sx={{ p: '10px 8px' }}>{viewModelName(item)}</TableCell>}
      {columnVisibility.request_time && (
        <TableCell sx={{ p: '10px 8px' }}>
          <Label color={requestTimeLabelOptions(requestTimeInfo.requestTime)}>{formatCellText('request_time', item)}</Label>
        </TableCell>
      )}
      {columnVisibility.status_code && (
        <TableCell sx={{ p: '10px 8px' }}>
          <Label color={statusCodeColor(item.status_code)} variant="filled">
            {formatCellText('status_code', item)}
          </Label>
        </TableCell>
      )}
      {columnVisibility.error_code && <TableCell sx={{ p: '10px 8px' }}>{formatCellText('error_code', item)}</TableCell>}
      {columnVisibility.error_type && <TableCell sx={{ p: '10px 8px' }}>{formatCellText('error_type', item)}</TableCell>}
      {columnVisibility.request_path && <TableCell sx={{ p: '10px 8px' }}>{formatCellText('request_path', item)}</TableCell>}
      {columnVisibility.source_ip && <TableCell sx={{ p: '10px 8px' }}>{formatCellText('source_ip', item)}</TableCell>}
      {columnVisibility.content && (
        <TableCell sx={{ p: '10px 8px', maxWidth: 300 }}>
          <Tooltip title={formatCellText('content', item)} placement="top">
            <Typography variant="body2" noWrap>
              {formatCellText('content', item)}
            </Typography>
          </Tooltip>
        </TableCell>
      )}
    </TableRow>
  );
}

ErrorLogRow.propTypes = {
  item: logItemPropType,
  userIsAdmin: PropTypes.bool,
  columnVisibility: columnVisibilityPropType
};

function viewModelName(item) {
  const { isStream, modelName } = getModelDisplayInfo(item);

  if (!modelName) {
    return '';
  }

  if (isStream) {
    return (
      <Badge
        badgeContent="Stream"
        color="primary"
        sx={{
          '& .MuiBadge-badge': {
            fontSize: '0.55rem',
            height: '16px',
            minWidth: '16px',
            padding: '0 4px',
            top: '-3px'
          }
        }}
      >
        <Label color="primary" variant="outlined" copyText={modelName}>
          {modelName}
        </Label>
      </Badge>
    );
  }

  return (
    <Label color="primary" variant="outlined" copyText={modelName}>
      {modelName}
    </Label>
  );
}

const MetadataTypography = styled(Typography)(({ theme }) => ({
  fontSize: 12,
  color: theme.palette.grey[300],
  '&:not(:last-child)': {
    marginBottom: theme.spacing(0.5)
  }
}));

function viewInput(inputText, t, totalInputTokens, totalOutputTokens, show, tokenDetails) {
  if (!inputText) return '';
  if (!show) return inputText;

  const tooltipContent = tokenDetails.map(({ key, label, tokens, value, rate, labelParams }) => (
    <MetadataTypography key={key}>{`${t(label, labelParams)}: ${value} *  (${rate} - 1) = ${tokens}`}</MetadataTypography>
  ));

  return (
    <Badge variant="dot" color="primary">
      <Tooltip
        title={
          <>
            {tooltipContent}
            <MetadataTypography>
              {t('logPage.totalInputTokens')}: {totalInputTokens}
            </MetadataTypography>
            <MetadataTypography>
              {t('logPage.totalOutputTokens')}: {totalOutputTokens}
            </MetadataTypography>
          </>
        }
        placement="top"
        arrow
      >
        <span style={{ cursor: 'help' }}>{inputText}</span>
      </Tooltip>
    </Badge>
  );
}

function viewLogContent(item, detailLines) {
  if (!item?.metadata?.input_ratio) {
    const free = (item.quota === 0 || item.quota === undefined) && item.type === 2;
    return free ? (
      <Stack direction="column" spacing={0.3}>
        <Label color="success" variant="soft">
          {detailLines[0] || ''}
        </Label>
      </Stack>
    ) : (
      <>{detailLines[0] || ''}</>
    );
  }

  return (
    <Stack direction="column" spacing={0.3}>
      {detailLines.map((line) => (
        <Label key={line} color="info" variant="soft">
          {line}
        </Label>
      ))}
    </Stack>
  );
}
