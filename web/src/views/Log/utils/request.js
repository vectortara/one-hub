import { trims } from 'utils/common';

export const EXPORT_PAGE_SIZE = 100;
export const DEFAULT_SORT_FIELD = 'created_at';
export const DEFAULT_SORT_ORDER = 'desc';

export const NORMAL_SORT_FIELDS = new Set(['created_at', 'channel_id', 'user_id', 'token_name', 'model_name', 'type', 'source_ip']);
export const ERROR_SORT_FIELDS = new Set([
  'created_at',
  'channel_id',
  'user_id',
  'token_name',
  'model_name',
  'source_ip',
  'status_code',
  'error_code'
]);

export function normalizeSort(isErrorLog, order, orderBy) {
  const allowedFields = isErrorLog ? ERROR_SORT_FIELDS : NORMAL_SORT_FIELDS;
  const normalizedOrder = order === 'asc' ? 'asc' : DEFAULT_SORT_ORDER;

  if (allowedFields.has(orderBy)) {
    return {
      order: normalizedOrder,
      orderBy
    };
  }

  return {
    order: DEFAULT_SORT_ORDER,
    orderBy: DEFAULT_SORT_FIELD
  };
}

export function buildSortParam(order, orderBy) {
  if (!orderBy) {
    return '';
  }

  return order === 'desc' ? `-${orderBy}` : orderBy;
}

export function buildLogRequest({ keyword, userIsAdmin, order, orderBy }) {
  const cleanedKeyword = trims({ ...keyword });
  const isErrorLog = cleanedKeyword.log_type === '5';
  const normalizedSort = normalizeSort(isErrorLog, order, orderBy);
  const sort = buildSortParam(normalizedSort.order, normalizedSort.orderBy);

  if (isErrorLog) {
    delete cleanedKeyword.log_type;

    return {
      isErrorLog: true,
      normalizedSort,
      url: '/api/error_log/',
      params: {
        ...cleanedKeyword,
        order: sort
      }
    };
  }

  if (!userIsAdmin) {
    delete cleanedKeyword.username;
    delete cleanedKeyword.channel_id;
  }

  return {
    isErrorLog: false,
    normalizedSort,
    url: userIsAdmin ? '/api/log/' : '/api/log/self/',
    params: {
      ...cleanedKeyword,
      order: sort
    }
  };
}
