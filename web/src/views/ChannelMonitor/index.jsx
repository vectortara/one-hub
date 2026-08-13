import { useEffect, useRef, useState } from 'react';

import { Icon } from '@iconify/react';
import axios from 'axios';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Divider,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TablePagination,
  TableRow,
  Toolbar,
  Typography
} from '@mui/material';
import { useTranslation } from 'react-i18next';

import { getPageSize, savePageSize } from 'constants';
import { CHANNEL_OPTIONS } from 'constants/ChannelConstants';
import { DEFAULT_CHANNEL_MONITOR_MODELS } from 'constants/channelMonitorModels';
import { store } from 'store';
import { LOGIN } from 'store/actions';
import { showError, trims } from 'utils/common';
import { API } from 'utils/api';
import AdminContainer from 'ui-component/AdminContainer';
import Label from 'ui-component/Label';
import KeywordTableHead from 'ui-component/TableHead';
import GroupLabel from 'views/Channel/component/GroupLabel';
import TableToolBar from 'views/Channel/component/TableToolBar';

import MonitorModelSelector from './component/MonitorModelSelector';
import MonitorTableRow from './component/MonitorTableRow';

const originalKeyword = {
  type: 0,
  status: 0,
  name: '',
  group: '',
  models: '',
  key: '',
  test_model: '',
  other: '',
  tag: ''
};

const CHANNEL_MONITOR_PAGE_SIZE_OPTIONS = [5, 10];
const CHANNEL_MONITOR_PHASE_IDLE = 'idle';
const CHANNEL_MONITOR_PHASE_SEARCHING = 'searching';
const CHANNEL_MONITOR_PHASE_STREAMING = 'streaming';
const CHANNEL_MONITOR_PHASE_DONE = 'done';
const CHANNEL_MONITOR_PHASE_ERROR = 'error';
const CHANNEL_MONITOR_VALIDATE_STATUS = () => true;
const CHANNEL_MONITOR_BASE_URL = import.meta.env.VITE_APP_SERVER || '/';

function buildUniqueMonitorModels(models) {
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

function sortSelectedMonitorModels(models, selectedModels) {
  const selectedSet = new Set(selectedModels);
  return models.filter((model) => selectedSet.has(model));
}

function buildChannelMonitorOrder(order, orderBy) {
  if (!orderBy) {
    return '';
  }

  return order === 'desc' ? `-${orderBy}` : orderBy;
}

function buildChannelMonitorSearchPayload(submittedSearch, page, rowsPerPage, order, orderBy) {
  if (!submittedSearch) {
    return null;
  }

  const { filters, selectedMonitorModels } = submittedSearch;
  const { models: temporaryModelSource, ...searchFilters } = filters;
  void temporaryModelSource;

  return {
    page: page + 1,
    size: rowsPerPage,
    order: buildChannelMonitorOrder(order, orderBy),
    ...searchFilters,
    selected_monitor_models: selectedMonitorModels
  };
}

function buildChannelMonitorHttpConfig(config = {}) {
  return {
    ...config,
    validateStatus: CHANNEL_MONITOR_VALIDATE_STATUS
  };
}

function postChannelMonitorRequest(url, payload, config = {}) {
  return axios.post(url, payload, {
    baseURL: CHANNEL_MONITOR_BASE_URL,
    ...config
  });
}

function isChannelMonitorSuccessfulHttpResponse(response) {
  if (!response) {
    return false;
  }

  if (typeof response.status !== 'number') {
    return true;
  }

  return response.status >= 200 && response.status < 300;
}

function getChannelMonitorResponseMessage(response, fallbackMessage) {
  const responseMessage = response?.data?.message;
  return typeof responseMessage === 'string' && responseMessage.trim() !== '' ? responseMessage : fallbackMessage;
}

function clearChannelMonitorAuthState() {
  localStorage.removeItem('user');
  store.dispatch({ type: LOGIN, payload: null });
}

function handleChannelMonitorUnauthorizedResponse(response) {
  if (response?.status !== 401) {
    return false;
  }

  clearChannelMonitorAuthState();
  return true;
}

function getChannelMonitorStatusText(t, status) {
  switch (status) {
    case 0:
      return t('channel_index.all');
    case 1:
      return t('channel_index.enabled');
    case 2:
      return t('channel_index.disabled');
    case 3:
      return t('channel_index.speedTestDisabled');
    default:
      return t('common.unknown');
  }
}

function isChannelMonitorRequestCanceled(error) {
  return error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError' || error?.message === 'canceled';
}

function getChannelMonitorResponseHeader(headers, headerName) {
  if (!headers) {
    return '';
  }

  if (typeof headers.get === 'function') {
    return headers.get(headerName) || headers.get(headerName.toLowerCase()) || '';
  }

  return headers[headerName] || headers[headerName.toLowerCase()] || '';
}

function getChannelMonitorProgressTarget(progressEvent) {
  return progressEvent?.event?.target || progressEvent?.currentTarget || progressEvent?.target || null;
}

function getChannelMonitorProgressResponse(progressEvent) {
  const target = getChannelMonitorProgressTarget(progressEvent);
  if (typeof target?.response === 'string') {
    return target.response;
  }

  return '';
}

function getChannelMonitorProgressContentType(progressEvent) {
  const target = getChannelMonitorProgressTarget(progressEvent);
  if (typeof target?.getResponseHeader !== 'function') {
    return '';
  }

  return target.getResponseHeader('content-type') || target.getResponseHeader('Content-Type') || '';
}

function detectChannelMonitorStreamTransport(contentType, responseText) {
  const normalizedContentType = typeof contentType === 'string' ? contentType.toLowerCase() : '';
  if (normalizedContentType.includes('text/event-stream')) {
    return 'sse';
  }
  if (normalizedContentType.includes('application/json')) {
    return 'json';
  }

  const normalizedText = typeof responseText === 'string' ? responseText.trimStart() : '';
  if (normalizedText.startsWith('event:') || normalizedText.startsWith('data:')) {
    return 'sse';
  }
  if (normalizedText.startsWith('{') || normalizedText.startsWith('[')) {
    return 'json';
  }

  return 'unknown';
}

function parseChannelMonitorJsonResponse(payload) {
  if (payload && typeof payload === 'object') {
    return payload;
  }
  if (typeof payload !== 'string') {
    return null;
  }

  const normalizedPayload = payload.trim();
  if (normalizedPayload === '') {
    return null;
  }

  try {
    return JSON.parse(normalizedPayload);
  } catch (error) {
    return null;
  }
}

function parseChannelMonitorEventBlock(rawEventBlock) {
  const lines = rawEventBlock.split('\n');
  let eventName = 'message';
  const dataLines = [];

  lines.forEach((line) => {
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim() || 'message';
      return;
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  });

  return {
    eventName,
    data: dataLines.join('\n')
  };
}

function createChannelMonitorEventStreamParser({ onEvent }) {
  let transport = 'unknown';
  let lastProcessedLength = 0;
  let buffer = '';

  const consumeResponseText = (responseText, contentType = '') => {
    if (typeof responseText !== 'string') {
      return;
    }

    if (responseText.length < lastProcessedLength) {
      transport = 'unknown';
      lastProcessedLength = 0;
      buffer = '';
    }

    if (transport === 'unknown') {
      transport = detectChannelMonitorStreamTransport(contentType, responseText);
    }

    const nextChunk = responseText.slice(lastProcessedLength);
    lastProcessedLength = responseText.length;
    if (transport !== 'sse' || nextChunk === '') {
      return;
    }

    buffer += nextChunk.replace(/\r/g, '');

    let separatorIndex = buffer.indexOf('\n\n');
    while (separatorIndex !== -1) {
      const rawEventBlock = buffer.slice(0, separatorIndex).trim();
      buffer = buffer.slice(separatorIndex + 2);

      if (rawEventBlock !== '') {
        const parsedEvent = parseChannelMonitorEventBlock(rawEventBlock);
        if (parsedEvent.eventName === 'message' && parsedEvent.data !== '') {
          try {
            onEvent(JSON.parse(parsedEvent.data));
          } catch (error) {
            // Ignore malformed SSE fragments and keep the current stream alive.
          }
        }
      }

      separatorIndex = buffer.indexOf('\n\n');
    }
  };

  return {
    handleProgress(progressEvent) {
      consumeResponseText(getChannelMonitorProgressResponse(progressEvent), getChannelMonitorProgressContentType(progressEvent));
    },
    consumeResponseText,
    getTransport() {
      return transport;
    }
  };
}

function applyChannelMonitorProbeResult(items, result) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map((item) => {
    if (item.id !== result.channel_id) {
      return item;
    }

    return {
      ...item,
      matched_models: Array.isArray(item.matched_models)
        ? item.matched_models.map((matchedModel) =>
            matchedModel.model === result.model
              ? {
                  ...matchedModel,
                  probe_status: result.probe_status,
                  response_time: result.response_time,
                  error_message: result.error_message || ''
                }
              : matchedModel
          )
        : []
    };
  });
}

function getChannelMonitorProbeStats(items) {
  const stats = {
    total: 0,
    pending: 0,
    completed: 0,
    healthy: 0,
    unhealthy: 0,
    noResponse: 0
  };

  items.forEach((item) => {
    (item.matched_models || []).forEach((matchedModel) => {
      stats.total += 1;

      switch (matchedModel.probe_status) {
        case 'healthy':
          stats.completed += 1;
          stats.healthy += 1;
          break;
        case 'unhealthy':
          stats.completed += 1;
          stats.unhealthy += 1;
          break;
        case 'no_response':
          stats.completed += 1;
          stats.noResponse += 1;
          break;
        default:
          stats.pending += 1;
          break;
      }
    });
  });

  return stats;
}

function getChannelMonitorEmptyState(t, submittedSearch, runPhase) {
  if (!submittedSearch) {
    return {
      title: t('channel_monitor.initialEmptyTitle'),
      description: t('channel_monitor.initialEmptyDescription')
    };
  }

  if (runPhase === CHANNEL_MONITOR_PHASE_SEARCHING) {
    return {
      title: t('channel_monitor.searchingEmptyTitle'),
      description: t('channel_monitor.searchingEmptyDescription')
    };
  }

  return {
    title: t('channel_monitor.noResultTitle'),
    description: t('channel_monitor.noResultDescription')
  };
}

export default function ChannelMonitor() {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const [order, setOrder] = useState('desc');
  const [orderBy, setOrderBy] = useState('id');
  const [rowsPerPage, setRowsPerPage] = useState(() => Math.min(getPageSize('channelMonitor', 10), 10));
  const [listCount, setListCount] = useState(0);
  const [runChannelCount, setRunChannelCount] = useState(0);
  const [monitorItems, setMonitorItems] = useState([]);
  const [runPhase, setRunPhase] = useState(CHANNEL_MONITOR_PHASE_IDLE);
  const [runErrorMessage, setRunErrorMessage] = useState('');
  const [activeRequestId, setActiveRequestId] = useState('');
  const [groupOptions, setGroupOptions] = useState([]);
  const [tags, setTags] = useState([]);
  const [draftKeyword, setDraftKeyword] = useState(originalKeyword);
  const [draftMonitorModels, setDraftMonitorModels] = useState(DEFAULT_CHANNEL_MONITOR_MODELS);
  const [draftSelectedMonitorModels, setDraftSelectedMonitorModels] = useState(DEFAULT_CHANNEL_MONITOR_MODELS);
  const [submittedSearch, setSubmittedSearch] = useState(null);

  const activeRunTokenRef = useRef(0);
  const activeRequestIdRef = useRef('');
  const queryAbortControllerRef = useRef(null);
  const streamAbortControllerRef = useRef(null);
  const translateRef = useRef(t);
  translateRef.current = t;

  const pendingTemporaryModel = draftKeyword.models.trim();
  const submittedTypeOption = submittedSearch && submittedSearch.filters.type !== 0 ? CHANNEL_OPTIONS[submittedSearch.filters.type] : null;
  const probeStats = getChannelMonitorProbeStats(monitorItems);
  const progressValue = probeStats.total === 0 ? 0 : Math.round((probeStats.completed / probeStats.total) * 100);
  const channelMonitorHeadLabel = [
    { id: 'id', label: 'ID', disableSort: false, width: '80px', align: 'left' },
    { id: 'name', label: t('channel_index.channel'), disableSort: false, align: 'left' },
    { id: 'group', label: t('channel_index.group'), disableSort: true, align: 'left' },
    { id: 'type', label: t('channel_index.type'), disableSort: false, align: 'left' },
    { id: 'status', label: t('channel_index.status'), disableSort: false, align: 'left' }
  ];

  const cancelActiveMonitorRun = () => {
    if (queryAbortControllerRef.current) {
      queryAbortControllerRef.current.abort();
      queryAbortControllerRef.current = null;
    }

    if (streamAbortControllerRef.current) {
      streamAbortControllerRef.current.abort();
      streamAbortControllerRef.current = null;
    }

    activeRequestIdRef.current = '';
  };

  const handleSort = (event, id) => {
    const isAsc = orderBy === id && order === 'asc';
    if (id !== '') {
      setOrder(isAsc ? 'desc' : 'asc');
      setOrderBy(id);
    }
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    const newRowsPerPage = Math.min(parseInt(event.target.value, 10), 10);
    setPage(0);
    setRowsPerPage(newRowsPerPage);
    savePageSize('channelMonitor', newRowsPerPage);
  };

  const handleToolBarValue = (event) => {
    setDraftKeyword({ ...draftKeyword, [event.target.name]: event.target.value });
  };

  const handleToggleMonitorModel = (model) => {
    const selectedSet = new Set(draftSelectedMonitorModels);
    if (selectedSet.has(model)) {
      selectedSet.delete(model);
    } else {
      selectedSet.add(model);
    }

    setDraftSelectedMonitorModels(sortSelectedMonitorModels(draftMonitorModels, Array.from(selectedSet)));
  };

  const handleClear = () => {
    cancelActiveMonitorRun();
    activeRunTokenRef.current += 1;

    setPage(0);
    setOrder('desc');
    setOrderBy('id');
    setListCount(0);
    setRunChannelCount(0);
    setMonitorItems([]);
    setRunPhase(CHANNEL_MONITOR_PHASE_IDLE);
    setRunErrorMessage('');
    setActiveRequestId('');
    setDraftKeyword(originalKeyword);
    setDraftMonitorModels(DEFAULT_CHANNEL_MONITOR_MODELS);
    setDraftSelectedMonitorModels(DEFAULT_CHANNEL_MONITOR_MODELS);
    setSubmittedSearch(null);
  };

  const handleSearch = () => {
    cancelActiveMonitorRun();

    const trimmedDraftKeyword = trims(draftKeyword);
    const nextMonitorModels = buildUniqueMonitorModels([...draftMonitorModels, trimmedDraftKeyword.models]);
    const nextSelectedMonitorModels = sortSelectedMonitorModels(nextMonitorModels, [
      ...draftSelectedMonitorModels,
      trimmedDraftKeyword.models
    ]);

    setPage(0);
    setListCount(0);
    setRunChannelCount(0);
    setMonitorItems([]);
    setRunPhase(CHANNEL_MONITOR_PHASE_SEARCHING);
    setRunErrorMessage('');
    setActiveRequestId('');
    setDraftKeyword(trimmedDraftKeyword);
    setDraftMonitorModels(nextMonitorModels);
    setDraftSelectedMonitorModels(nextSelectedMonitorModels);
    setSubmittedSearch({
      filters: trimmedDraftKeyword,
      selectedMonitorModels: nextSelectedMonitorModels,
      submittedAt: Date.now()
    });
  };

  useEffect(() => {
    const fetchGroups = async () => {
      try {
        const groupRes = await API.get('/api/group/', buildChannelMonitorHttpConfig());
        if (!groupRes) {
          return;
        }

        if (!isChannelMonitorSuccessfulHttpResponse(groupRes) || groupRes.data?.success === false) {
          handleChannelMonitorUnauthorizedResponse(groupRes);
          showError(getChannelMonitorResponseMessage(groupRes, translateRef.current('channel_monitor.requestFailed')));
          return;
        }

        setGroupOptions(groupRes.data?.data || []);
      } catch (error) {
        showError(error.message);
      }
    };

    const fetchTags = async () => {
      try {
        const tagRes = await API.get('/api/channel_tag/_all', buildChannelMonitorHttpConfig());
        if (!tagRes) {
          return;
        }

        if (!isChannelMonitorSuccessfulHttpResponse(tagRes) || tagRes.data?.success === false) {
          handleChannelMonitorUnauthorizedResponse(tagRes);
          showError(getChannelMonitorResponseMessage(tagRes, translateRef.current('channel_monitor.requestFailed')));
          return;
        }

        if (tagRes.data?.success) {
          setTags(tagRes.data.data || []);
        }
      } catch (error) {
        showError(error.message);
      }
    };

    fetchGroups();
    fetchTags();
  }, []);

  useEffect(() => {
    if (!submittedSearch) {
      return undefined;
    }

    cancelActiveMonitorRun();

    const runToken = activeRunTokenRef.current + 1;
    activeRunTokenRef.current = runToken;

    const queryController = new AbortController();
    let streamController = null;
    queryAbortControllerRef.current = queryController;
    activeRequestIdRef.current = '';

    setListCount(0);
    setRunChannelCount(0);
    setMonitorItems([]);
    setRunPhase(CHANNEL_MONITOR_PHASE_SEARCHING);
    setRunErrorMessage('');
    setActiveRequestId('');

    const syncRunStillActive = () => activeRunTokenRef.current === runToken;
    const updateRunError = (message, shouldToast = true) => {
      if (!syncRunStillActive()) {
        return;
      }

      setRunPhase(CHANNEL_MONITOR_PHASE_ERROR);
      setRunErrorMessage(message);
      if (shouldToast && message) {
        showError(message);
      }
    };
    const markRunDone = () => {
      if (!syncRunStillActive()) {
        return;
      }

      setRunPhase((currentPhase) => (currentPhase === CHANNEL_MONITOR_PHASE_ERROR ? currentPhase : CHANNEL_MONITOR_PHASE_DONE));
    };
    const searchPayload = buildChannelMonitorSearchPayload(submittedSearch, page, rowsPerPage, order, orderBy);

    const runMonitor = async () => {
      try {
        const searchResponse = await postChannelMonitorRequest(
          '/api/channel/monitor/search',
          searchPayload,
          buildChannelMonitorHttpConfig({
            signal: queryController.signal
          })
        );

        if (!syncRunStillActive() || queryController.signal.aborted) {
          return;
        }

        if (!searchResponse) {
          updateRunError(translateRef.current('channel_monitor.requestFailed'), false);
          return;
        }

        if (!isChannelMonitorSuccessfulHttpResponse(searchResponse)) {
          handleChannelMonitorUnauthorizedResponse(searchResponse);
          updateRunError(getChannelMonitorResponseMessage(searchResponse, translateRef.current('channel_monitor.searchFailed')), false);
          return;
        }

        const { success, message, data } = searchResponse.data || {};
        if (!success) {
          updateRunError(message || translateRef.current('channel_monitor.searchFailed'), false);
          return;
        }

        const requestId = typeof data?.request_id === 'string' ? data.request_id : '';
        const channelIds = Array.isArray(data?.channel_ids) ? data.channel_ids : [];
        const nextItems = Array.isArray(data?.data) ? data.data : [];

        activeRequestIdRef.current = requestId;
        setActiveRequestId(requestId);
        setListCount(typeof data?.total_count === 'number' ? data.total_count : 0);
        setRunChannelCount(channelIds.length);
        setMonitorItems(nextItems);

        if (requestId === '' || channelIds.length === 0) {
          markRunDone();
          return;
        }

        streamController = new AbortController();
        streamAbortControllerRef.current = streamController;
        setRunPhase(CHANNEL_MONITOR_PHASE_STREAMING);

        const parser = createChannelMonitorEventStreamParser({
          onEvent: (eventPayload) => {
            const eventRequestId = eventPayload?.data?.request_id;
            if (!syncRunStillActive() || eventRequestId !== activeRequestIdRef.current) {
              return;
            }

            switch (eventPayload?.type) {
              case 'result':
                setMonitorItems((currentItems) => applyChannelMonitorProbeResult(currentItems, eventPayload.data || {}));
                break;
              case 'error':
                updateRunError(eventPayload?.data?.message || translateRef.current('channel_monitor.streamFailed'), false);
                if (streamController) {
                  streamController.abort();
                }
                break;
              case 'done':
                markRunDone();
                break;
              case 'heartbeat':
              default:
                break;
            }
          }
        });

        const streamResponse = await postChannelMonitorRequest(
          '/api/sse/channel/monitor/run',
          {
            request_id: requestId,
            channel_ids: channelIds,
            selected_monitor_models: submittedSearch.selectedMonitorModels
          },
          {
            headers: {
              Accept: 'text/event-stream'
            },
            responseType: 'text',
            signal: streamController.signal,
            onDownloadProgress: parser.handleProgress,
            validateStatus: CHANNEL_MONITOR_VALIDATE_STATUS
          }
        );

        if (!syncRunStillActive() || streamController.signal.aborted) {
          return;
        }

        if (!streamResponse) {
          updateRunError(translateRef.current('channel_monitor.requestFailed'), false);
          return;
        }

        if (!isChannelMonitorSuccessfulHttpResponse(streamResponse)) {
          handleChannelMonitorUnauthorizedResponse(streamResponse);
          updateRunError(getChannelMonitorResponseMessage(streamResponse, translateRef.current('channel_monitor.streamFailed')), false);
          return;
        }

        const streamContentType = getChannelMonitorResponseHeader(streamResponse?.headers, 'content-type');
        const resolvedTransport =
          parser.getTransport() === 'unknown'
            ? detectChannelMonitorStreamTransport(streamContentType, streamResponse?.data)
            : parser.getTransport();

        if (resolvedTransport === 'sse') {
          parser.consumeResponseText(streamResponse?.data, streamContentType);
          if (!streamController.signal.aborted) {
            markRunDone();
          }
          return;
        }

        const parsedStreamResponse = parseChannelMonitorJsonResponse(streamResponse?.data);
        if (parsedStreamResponse?.success === false) {
          updateRunError(parsedStreamResponse.message || translateRef.current('channel_monitor.streamFailed'), false);
          return;
        }

        markRunDone();
      } catch (error) {
        if (isChannelMonitorRequestCanceled(error)) {
          return;
        }

        handleChannelMonitorUnauthorizedResponse(error?.response);
        updateRunError(error.message || translateRef.current('channel_monitor.requestFailed'), false);
      } finally {
        if (queryAbortControllerRef.current === queryController) {
          queryAbortControllerRef.current = null;
        }

        if (streamController && streamAbortControllerRef.current === streamController) {
          streamAbortControllerRef.current = null;
        }
      }
    };

    runMonitor();

    return () => {
      queryController.abort();
      if (streamController) {
        streamController.abort();
      }

      if (queryAbortControllerRef.current === queryController) {
        queryAbortControllerRef.current = null;
      }

      if (streamController && streamAbortControllerRef.current === streamController) {
        streamAbortControllerRef.current = null;
      }
    };
  }, [submittedSearch, page, rowsPerPage, order, orderBy]);

  const emptyState = getChannelMonitorEmptyState(t, submittedSearch, runPhase);
  const toolbarTip = submittedSearch ? t('channel_monitor.submittedDraftTip') : t('channel_monitor.searchReadyTip');
  const statusSummary =
    runPhase === CHANNEL_MONITOR_PHASE_SEARCHING
      ? { severity: 'info', text: t('channel_monitor.searchingMessage') }
      : runPhase === CHANNEL_MONITOR_PHASE_STREAMING
        ? {
            severity: 'info',
            text: t('channel_monitor.streamingMessage', {
              channels: runChannelCount,
              completed: probeStats.completed,
              total: probeStats.total
            })
          }
        : runPhase === CHANNEL_MONITOR_PHASE_DONE && submittedSearch
          ? monitorItems.length === 0
            ? { severity: 'info', text: t('channel_monitor.noMatchedChannels') }
            : {
                severity: 'success',
                text: t('channel_monitor.doneMessage', {
                  channels: runChannelCount,
                  completed: probeStats.completed,
                  total: probeStats.total
                })
              }
          : null;

  return (
    <AdminContainer>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={5}>
        <Stack direction="column" spacing={1}>
          <Typography variant="h2">{t('channel_monitor.title')}</Typography>
          <Typography variant="subtitle1" color="text.secondary">
            {t('channel_monitor.subtitle')}
          </Typography>
        </Stack>
      </Stack>

      <Stack mb={5} spacing={2}>
        <Alert severity="info">{t('channel_monitor.bootstrapInfo')}</Alert>
        <Alert severity="warning">{t('channel_monitor.temporaryModelInfo')}</Alert>
      </Stack>

      <Card>
        <Box component="form" noValidate>
          <TableToolBar
            filterName={draftKeyword}
            handleFilterName={handleToolBarValue}
            groupOptions={groupOptions}
            tags={tags}
            showFilterTag={false}
          />
        </Box>

        <MonitorModelSelector
          models={draftMonitorModels}
          selectedModels={draftSelectedMonitorModels}
          pendingTemporaryModel={pendingTemporaryModel}
          onToggleModel={handleToggleMonitorModel}
        />

        <Toolbar
          sx={{
            minHeight: 56,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 2,
            px: 3,
            py: 1.5
          }}
        >
          <Typography variant="body2" color="text.secondary">
            {toolbarTip}
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button onClick={handleClear} startIcon={<Icon icon="solar:refresh-circle-bold-duotone" width={18} />}>
              {t('channel_index.refreshClearSearchConditions')}
            </Button>
            <Button variant="contained" onClick={handleSearch} startIcon={<Icon icon="solar:magnifer-bold-duotone" width={18} />}>
              {t('channel_index.search')}
            </Button>
          </Stack>
        </Toolbar>
      </Card>

      {submittedSearch && (
        <Card sx={{ mt: 3, p: 3 }}>
          <Stack spacing={2}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              justifyContent="space-between"
              alignItems={{ xs: 'flex-start', sm: 'center' }}
            >
              <Typography variant="h4">{t('channel_monitor.recentSubmittedFilters')}</Typography>
              <Typography variant="body2" color="text.secondary">
                {t('channel_monitor.submittedAt', { time: new Date(submittedSearch.submittedAt).toLocaleString() })}
              </Typography>
            </Stack>

            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {submittedSearch.filters.name && (
                <Chip label={`${t('channel_index.name')}: ${submittedSearch.filters.name}`} size="small" variant="outlined" />
              )}
              {submittedSearch.filters.test_model && (
                <Chip label={`${t('channel_index.testModel')}: ${submittedSearch.filters.test_model}`} size="small" variant="outlined" />
              )}
              {submittedSearch.filters.key && (
                <Chip label={`${t('channel_row.key')}: ${submittedSearch.filters.key}`} size="small" variant="outlined" />
              )}
              {submittedSearch.filters.other && (
                <Chip label={`${t('channel_index.otherParameters')}: ${submittedSearch.filters.other}`} size="small" variant="outlined" />
              )}
              {submittedSearch.filters.tag && (
                <Chip label={`${t('channel_row.tag')}: ${submittedSearch.filters.tag}`} size="small" variant="outlined" />
              )}
              {submittedSearch.filters.models && (
                <Chip
                  label={`${t('channel_monitor.temporaryModelSource')}: ${submittedSearch.filters.models}`}
                  size="small"
                  color="primary"
                  variant="outlined"
                />
              )}
              {!submittedSearch.filters.name &&
                !submittedSearch.filters.test_model &&
                !submittedSearch.filters.key &&
                !submittedSearch.filters.other &&
                !submittedSearch.filters.tag &&
                !submittedSearch.filters.models && <Chip label={t('channel_monitor.noBaseFilters')} size="small" variant="outlined" />}
            </Stack>

            <Divider />

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
              <Stack spacing={1} sx={{ minWidth: 180 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  {t('channel_index.group')}
                </Typography>
                {submittedSearch.filters.group ? (
                  <GroupLabel group={submittedSearch.filters.group} />
                ) : (
                  <Typography variant="body2">{t('channel_monitor.allGroups')}</Typography>
                )}
              </Stack>

              <Stack spacing={1} sx={{ minWidth: 180 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  {t('channel_index.type')}
                </Typography>
                {submittedTypeOption ? (
                  <Label color={submittedTypeOption.color} variant="outlined">
                    {submittedTypeOption.text}
                  </Label>
                ) : (
                  <Typography variant="body2">{t('channel_monitor.allTypes')}</Typography>
                )}
              </Stack>

              <Stack spacing={1} sx={{ minWidth: 180 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  {t('channel_index.status')}
                </Typography>
                <Typography variant="body2">{getChannelMonitorStatusText(t, submittedSearch.filters.status)}</Typography>
              </Stack>
            </Stack>

            <Stack spacing={1}>
              <Typography variant="subtitle2" color="text.secondary">
                {t('channel_monitor.selectedMonitorModels')}
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {submittedSearch.selectedMonitorModels.length === 0 ? (
                  <Chip label={t('channel_monitor.noMonitorModelsSelected')} size="small" variant="outlined" />
                ) : (
                  submittedSearch.selectedMonitorModels.map((model) => <Chip key={model} label={model} size="small" color="primary" />)
                )}
              </Stack>
            </Stack>
          </Stack>
        </Card>
      )}

      <Card sx={{ mt: 3 }}>
        {submittedSearch && (
          <Stack spacing={1.5} sx={{ px: 3, pt: 3 }}>
            {runErrorMessage && <Alert severity="error">{runErrorMessage}</Alert>}
            {!runErrorMessage && statusSummary && <Alert severity={statusSummary.severity}>{statusSummary.text}</Alert>}
            {activeRequestId && (
              <Typography variant="caption" color="text.secondary">
                {t('channel_monitor.requestId')}: {activeRequestId}
              </Typography>
            )}
            {(runPhase === CHANNEL_MONITOR_PHASE_SEARCHING || runPhase === CHANNEL_MONITOR_PHASE_STREAMING) && (
              <LinearProgress
                variant={runPhase === CHANNEL_MONITOR_PHASE_STREAMING && probeStats.total > 0 ? 'determinate' : 'indeterminate'}
                value={runPhase === CHANNEL_MONITOR_PHASE_STREAMING ? progressValue : undefined}
              />
            )}
          </Stack>
        )}

        <TableContainer>
          <Table sx={{ minWidth: 800 }}>
            <KeywordTableHead order={order} orderBy={orderBy} onRequestSort={handleSort} headLabel={channelMonitorHeadLabel} />
            <TableBody>
              {monitorItems.length > 0 ? (
                monitorItems.map((item) => <MonitorTableRow key={item.id} item={item} detailColSpan={channelMonitorHeadLabel.length} />)
              ) : (
                <TableRow>
                  <TableCell colSpan={channelMonitorHeadLabel.length} align="center" sx={{ py: 8 }}>
                    <Stack spacing={1.5} alignItems="center">
                      <Icon icon="solar:monitor-smartphone-bold-duotone" width={40} />
                      <Typography variant="h4">{emptyState.title}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {emptyState.description}
                      </Typography>
                    </Stack>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          page={page}
          component="div"
          count={listCount}
          rowsPerPage={rowsPerPage}
          onPageChange={handleChangePage}
          rowsPerPageOptions={CHANNEL_MONITOR_PAGE_SIZE_OPTIONS}
          onRowsPerPageChange={handleChangeRowsPerPage}
          showFirstButton
          showLastButton
        />
      </Card>
    </AdminContainer>
  );
}
