const SPREADSHEET_FORMULA_PREFIX = /^[=+\-@]/;

export function sanitizeSpreadsheetValue(value) {
  const text = value === null || value === undefined ? '' : String(value);

  if (SPREADSHEET_FORMULA_PREFIX.test(text)) {
    return `'${text}`;
  }

  return text;
}

export function escapeCsvValue(value) {
  const sanitized = sanitizeSpreadsheetValue(value);

  if (/[",\r\n]/.test(sanitized)) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }

  return sanitized;
}
