import { escapeCsvValue } from './csv';
import { formatCellText } from './displayText';

export const LOG_TAB_FILENAME_MAP = {
  0: 'all',
  1: 'recharge',
  2: 'consumption',
  3: 'management',
  4: 'system',
  5: 'error'
};

export function normalizeExportEndTimestamp(endTimestamp, exportStartedAt) {
  const numericEndTimestamp = Number(endTimestamp) || 0;

  if (numericEndTimestamp === 0) {
    return exportStartedAt;
  }

  return Math.min(numericEndTimestamp, exportStartedAt);
}

export function buildExportKeyword(keyword, exportStartedAt) {
  return {
    ...keyword,
    end_timestamp: normalizeExportEndTimestamp(keyword?.end_timestamp, exportStartedAt)
  };
}

export function buildCsvHeader(columns) {
  return columns.map((column) => escapeCsvValue(column.label)).join(',');
}

export function appendCsvRows(blobParts, rows, columns, formatterContext) {
  rows.forEach((item) => {
    const row = columns.map((column) => escapeCsvValue(formatCellText(column.id, item, formatterContext))).join(',');
    blobParts.push(row, '\r\n');
  });
}

export function buildExportFilename(logType, exportedAt) {
  const tabName = LOG_TAB_FILENAME_MAP[logType] || 'all';
  return `logs_${tabName}_${exportedAt.format('YYYYMMDD_HHmmss')}.csv`;
}

export function downloadCsvBlob(blobParts, filename) {
  const blob = new Blob(blobParts, { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
