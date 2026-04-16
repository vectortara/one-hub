export const NORMAL_LOG_COLUMNS = [
  { id: 'created_at', labelKey: 'logPage.timeLabel', sortable: true },
  { id: 'channel_id', labelKey: 'logPage.channelLabel', sortable: true, adminOnly: true },
  { id: 'user_id', labelKey: 'logPage.userLabel', sortable: true, adminOnly: true },
  { id: 'group', labelKey: 'logPage.groupLabel', sortable: false },
  { id: 'token_name', labelKey: 'logPage.tokenLabel', sortable: true },
  { id: 'type', labelKey: 'logPage.typeLabel', sortable: true },
  { id: 'model_name', labelKey: 'logPage.modelLabel', sortable: true },
  {
    id: 'duration',
    labelKey: 'logPage.durationLabel',
    tooltipKey: 'logPage.durationTooltip',
    sortable: false
  },
  { id: 'message', labelKey: 'logPage.inputLabel', sortable: false },
  { id: 'completion', labelKey: 'logPage.outputLabel', sortable: false },
  { id: 'quota', labelKey: 'logPage.quotaLabel', sortable: false },
  { id: 'source_ip', labelKey: 'logPage.sourceIp', sortable: true },
  { id: 'detail', labelKey: 'logPage.detailLabel', sortable: false }
];

export const ERROR_LOG_COLUMNS = [
  { id: 'created_at', labelKey: 'logPage.timeLabel', sortable: true },
  { id: 'channel_id', labelKey: 'logPage.channelLabel', sortable: true, adminOnly: true },
  { id: 'user_id', labelKey: 'logPage.userLabel', sortable: true, adminOnly: true },
  { id: 'token_name', labelKey: 'logPage.tokenLabel', sortable: true },
  { id: 'model_name', labelKey: 'logPage.modelLabel', sortable: true },
  { id: 'request_time', labelKey: 'logPage.durationLabel', sortable: false },
  { id: 'status_code', labelKey: 'logPage.statusCode', sortable: true },
  { id: 'error_code', labelKey: 'logPage.errorCode', sortable: true },
  { id: 'error_type', labelKey: 'logPage.errorType', sortable: false },
  { id: 'request_path', labelKey: 'logPage.requestPath', sortable: false },
  { id: 'source_ip', labelKey: 'logPage.sourceIp', sortable: true },
  { id: 'content', labelKey: 'logPage.errorContent', sortable: false }
];

function getColumns(isErrorLog) {
  return isErrorLog ? ERROR_LOG_COLUMNS : NORMAL_LOG_COLUMNS;
}

function translateLabel(t, labelKey) {
  return typeof t === 'function' ? t(labelKey) : labelKey;
}

export function buildDefaultColumnVisibility(columns) {
  return columns.reduce((acc, column) => {
    acc[column.id] = true;
    return acc;
  }, {});
}

export const DEFAULT_LOG_COLUMN_VISIBILITY = buildDefaultColumnVisibility(NORMAL_LOG_COLUMNS);
export const DEFAULT_ERROR_LOG_COLUMN_VISIBILITY = buildDefaultColumnVisibility(ERROR_LOG_COLUMNS);

export function getColumnMenuItems({ isErrorLog, userIsAdmin, t }) {
  return getColumns(isErrorLog)
    .filter((column) => !column.adminOnly || userIsAdmin)
    .map((column) => ({
      ...column,
      label: translateLabel(t, column.labelKey)
    }));
}

export function getHeadLabels({ isErrorLog, userIsAdmin, columnVisibility, t }) {
  return getColumns(isErrorLog).map((column) => ({
    id: column.id,
    label: translateLabel(t, column.labelKey),
    tooltip: column.tooltipKey ? translateLabel(t, column.tooltipKey) : undefined,
    disableSort: !column.sortable,
    hide: columnVisibility?.[column.id] === false || (column.adminOnly && !userIsAdmin)
  }));
}

export function getVisibleColumns({ isErrorLog, userIsAdmin, columnVisibility, t }) {
  return getColumns(isErrorLog)
    .filter((column) => !column.adminOnly || userIsAdmin)
    .filter((column) => columnVisibility?.[column.id] !== false)
    .map((column) => ({
      ...column,
      label: translateLabel(t, column.labelKey)
    }));
}
