/* @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ChannelMonitor from './index';
import SettingMenu from '../../menu-items/setting';
import MainRoutes from '../../routes/MainRoutes';

const { mockApiGet, mockAxiosPost, mockShowError, mockStoreDispatch } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockAxiosPost: vi.fn(),
  mockShowError: vi.fn(),
  mockStoreDispatch: vi.fn()
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, options) => {
      if (!options || Object.keys(options).length === 0) {
        return key;
      }

      const serializedOptions = Object.entries(options)
        .map(([name, value]) => `${name}=${value}`)
        .join(',');
      return `${key}:${serializedOptions}`;
    }
  })
}));

vi.mock('utils/api', () => ({
  API: {
    get: mockApiGet
  }
}));

vi.mock('axios', () => ({
  default: {
    post: mockAxiosPost
  }
}));

vi.mock('store', () => ({
  store: {
    dispatch: mockStoreDispatch
  }
}));

vi.mock('store/actions', () => ({
  LOGIN: '@account/LOGIN'
}));

vi.mock('utils/common', () => ({
  showError: mockShowError,
  trims: (values) => {
    if (typeof values === 'string') {
      return values.trim();
    }

    if (Array.isArray(values)) {
      return values.map((value) => value.trim());
    }

    if (typeof values === 'object' && values !== null) {
      return Object.keys(values).reduce((result, key) => {
        result[key] = typeof values[key] === 'string' ? values[key].trim() : values[key];
        return result;
      }, {});
    }

    return values;
  }
}));

function createDeferred() {
  let resolve;
  let reject;

  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    resolve,
    reject
  };
}

function buildSseEvent(type, data) {
  return `event: message\ndata:${JSON.stringify({ type, data })}\n\n`;
}

function buildProgressEvent(responseText, contentType = 'text/event-stream') {
  const target = {
    response: responseText,
    getResponseHeader: (name) => (name.toLowerCase() === 'content-type' ? contentType : null)
  };

  return {
    currentTarget: target,
    event: {
      target
    }
  };
}

function buildSearchResponse(overrides = {}) {
  return {
    status: 200,
    data: {
      success: true,
      message: '',
      data: {
        request_id: 'req-1',
        channel_ids: [],
        data: [],
        page: 1,
        size: 10,
        total_count: 0,
        ...overrides
      }
    }
  };
}

function buildAxiosNetworkError(message = 'Network Error') {
  const error = new Error(message);
  error.name = 'AxiosError';
  error.code = 'ERR_NETWORK';
  return error;
}

describe('ChannelMonitor', () => {
  beforeEach(() => {
    localStorage.clear();
    mockApiGet.mockReset();
    mockAxiosPost.mockReset();
    mockShowError.mockReset();
    mockStoreDispatch.mockReset();

    mockApiGet.mockImplementation((url) => {
      if (url === '/api/group/') {
        return Promise.resolve({
          status: 200,
          data: {
            success: true,
            data: ['', 'default', 'vip']
          }
        });
      }

      if (url === '/api/channel_tag/_all') {
        return Promise.resolve({
          status: 200,
          data: {
            success: true,
            data: [{ tag: 'alpha' }, { tag: 'beta' }]
          }
        });
      }

      return Promise.reject(new Error(`unexpected url: ${url}`));
    });

    mockAxiosPost.mockImplementation((url) => Promise.reject(new Error(`unexpected post: ${url}`)));
  });

  afterEach(() => {
    cleanup();
  });

  it('bootstraps only groups and tags, keeps default monitor models selected, and does not auto search', async () => {
    render(<ChannelMonitor />);

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledTimes(2);
    });

    expect(mockApiGet).toHaveBeenNthCalledWith(
      1,
      '/api/group/',
      expect.objectContaining({
        validateStatus: expect.any(Function)
      })
    );
    expect(mockApiGet).toHaveBeenNthCalledWith(
      2,
      '/api/channel_tag/_all',
      expect.objectContaining({
        validateStatus: expect.any(Function)
      })
    );
    expect(mockAxiosPost).not.toHaveBeenCalled();
    expect(screen.getByText('channel_monitor_page.initialEmptyTitle')).toBeTruthy();
    expect(screen.getByText('channel_monitor_page.healthCriteriaTitle')).toBeTruthy();
    expect(screen.getByText('channel_monitor_page.healthCriteriaHealthy')).toBeTruthy();
    expect(screen.getByText('channel_monitor_page.healthCriteriaUnhealthy')).toBeTruthy();
    expect(screen.getByText('channel_monitor_page.healthCriteriaNoResponse')).toBeTruthy();

    ['gpt-5.4', 'gpt-5.5', 'claude-sonnet-4-6', 'claude-sonnet-5', 'gemini-3.5-flash'].forEach((model) => {
      expect(screen.getByRole('button', { name: model }).getAttribute('aria-pressed')).toBe('true');
    });
  });

  it('hides filter_tag control while keeping tag selector visible', async () => {
    render(<ChannelMonitor />);

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledTimes(2);
    });

    expect(document.getElementById('channel-filter_tag-label')).toBeNull();
    expect(screen.queryByText('channel_index.filterTags')).toBeNull();
    expect(document.getElementById('channel-tag-label')).toBeTruthy();
  });

  it('keeps submitted conditions stable while draft inputs continue changing', async () => {
    mockAxiosPost.mockImplementation((url) => {
      if (url === '/api/channel/monitor/search') {
        return Promise.resolve(buildSearchResponse());
      }

      throw new Error(`unexpected post: ${url}`);
    });

    render(<ChannelMonitor />);

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledTimes(2);
    });

    const modelsInput = document.querySelector('input[name="models"]');
    fireEvent.change(modelsInput, { target: { name: 'models', value: 'gpt-temporary' } });

    expect(modelsInput.value).toBe('gpt-temporary');

    fireEvent.click(screen.getByRole('button', { name: 'channel_index.search' }));

    await waitFor(() => {
      expect(screen.getByText('channel_monitor_page.recentSubmittedFilters')).toBeTruthy();
    });

    expect(screen.getByText('channel_monitor_page.temporaryModelSource: gpt-temporary')).toBeTruthy();

    fireEvent.change(modelsInput, { target: { name: 'models', value: 'gpt-next' } });

    expect(modelsInput.value).toBe('gpt-next');
    expect(screen.getByText('channel_monitor_page.temporaryModelSource: gpt-temporary')).toBeTruthy();
    expect(screen.queryByText('channel_monitor_page.temporaryModelSource: gpt-next')).toBeNull();
  });

  it('renders submitted status summary with readable text instead of raw status code', async () => {
    mockAxiosPost.mockImplementation((url) => {
      if (url === '/api/channel/monitor/search') {
        return Promise.resolve(buildSearchResponse());
      }

      throw new Error(`unexpected post: ${url}`);
    });

    render(<ChannelMonitor />);

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledTimes(2);
    });

    fireEvent.mouseDown(document.getElementById('channel-status-label'));
    fireEvent.click(screen.getByRole('option', { name: 'channel_index.disabled' }));

    fireEvent.click(screen.getByRole('button', { name: 'channel_index.search' }));

    await waitFor(() => {
      expect(screen.getByText('channel_monitor_page.recentSubmittedFilters')).toBeTruthy();
    });

    expect(screen.getAllByText('channel_index.status').length).toBeGreaterThan(0);
    expect(screen.getAllByText('channel_index.disabled').some((node) => node.tagName === 'P')).toBe(true);
    expect(screen.queryByText('2')).toBeNull();
  });

  it('renders each result as a card grid item without showing group or type text', async () => {
    mockAxiosPost.mockImplementation((url) => {
      if (url === '/api/channel/monitor/search') {
        return Promise.resolve(
          buildSearchResponse({
            request_id: '',
            channel_ids: [],
            total_count: 1,
            data: [
              {
                id: 11,
                name: 'alpha-disabled',
                group: 'default',
                type: 1,
                status: 3,
                matched_models: [{ model: 'gpt-5.4', probe_status: 'pending', response_time: null, error_message: '' }]
              }
            ]
          })
        );
      }

      throw new Error(`unexpected post: ${url}`);
    });

    render(<ChannelMonitor />);

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByRole('button', { name: 'channel_index.search' }));

    await waitFor(() => {
      expect(screen.getByText('alpha-disabled')).toBeTruthy();
    });

    expect(screen.getByTestId('channel-monitor-result-grid')).toBeTruthy();

    const cards = screen.getAllByTestId(/channel-monitor-card-/);
    expect(cards).toHaveLength(1);

    const card = screen.getByTestId('channel-monitor-card-11');
    expect(within(card).getByText('alpha-disabled')).toBeTruthy();
    expect(within(card).getByText('channel_index.speedTestDisabled')).toBeTruthy();
    expect(within(card).getByText('channel_monitor_page.statusPending')).toBeTruthy();
    expect(within(card).queryByText('default')).toBeNull();
    expect(within(card).queryByText('OpenAI')).toBeNull();
  });

  it('lets tag filter return to all via explicit empty option', async () => {
    render(<ChannelMonitor />);

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledTimes(2);
    });

    fireEvent.mouseDown(document.getElementById('channel-tag-label'));
    expect(screen.getByRole('option', { name: 'channel_index.all' })).toBeTruthy();

    fireEvent.click(screen.getByRole('option', { name: 'alpha' }));
    expect(document.getElementById('channel-tag-label').textContent).toBe('alpha');

    fireEvent.mouseDown(document.getElementById('channel-tag-label'));
    fireEvent.click(screen.getByRole('option', { name: 'channel_index.all' }));

    expect(document.getElementById('channel-tag-label').textContent).toBe('channel_index.all');
  });

  it('keeps group options when tag bootstrap fails', async () => {
    mockApiGet.mockImplementation((url) => {
      if (url === '/api/group/') {
        return Promise.resolve({
          status: 200,
          data: {
            success: true,
            data: ['', 'default', 'vip']
          }
        });
      }

      if (url === '/api/channel_tag/_all') {
        return Promise.resolve({
          status: 500,
          data: {
            success: false,
            message: 'tag bootstrap failed'
          }
        });
      }

      return Promise.reject(new Error(`unexpected url: ${url}`));
    });

    render(<ChannelMonitor />);

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith('tag bootstrap failed');
    });

    fireEvent.mouseDown(document.getElementById('channel-group-label'));

    expect(screen.getByRole('option', { name: 'vip' })).toBeTruthy();
  });

  it('clears the local auth state when bootstrap requests return 401', async () => {
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'expired-user' }));

    mockApiGet.mockImplementation((url) => {
      if (url === '/api/group/') {
        return Promise.resolve({
          status: 401,
          data: {
            success: false,
            message: 'login expired'
          }
        });
      }

      if (url === '/api/channel_tag/_all') {
        return Promise.resolve({
          status: 200,
          data: {
            success: true,
            data: [{ tag: 'alpha' }, { tag: 'beta' }]
          }
        });
      }

      return Promise.reject(new Error(`unexpected url: ${url}`));
    });

    render(<ChannelMonitor />);

    await waitFor(() => {
      expect(mockStoreDispatch).toHaveBeenCalledWith({
        type: '@account/LOGIN',
        payload: null
      });
    });

    expect(localStorage.getItem('user')).toBeNull();
    expect(mockShowError).toHaveBeenCalledWith('login expired');
  });

  it('keeps tag options when group bootstrap fails', async () => {
    mockApiGet.mockImplementation((url) => {
      if (url === '/api/group/') {
        return Promise.resolve({
          status: 500,
          data: {
            success: false,
            message: 'group bootstrap failed'
          }
        });
      }

      if (url === '/api/channel_tag/_all') {
        return Promise.resolve({
          status: 200,
          data: {
            success: true,
            data: [{ tag: 'alpha' }, { tag: 'beta' }]
          }
        });
      }

      return Promise.reject(new Error(`unexpected url: ${url}`));
    });

    render(<ChannelMonitor />);

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith('group bootstrap failed');
    });

    fireEvent.mouseDown(document.getElementById('channel-tag-label'));

    expect(screen.getByRole('option', { name: 'alpha' })).toBeTruthy();
  });

  it('submits search payload without the models filter and starts the SSE run with request_id and channel_ids', async () => {
    mockAxiosPost.mockImplementation((url, payload) => {
      void payload;

      if (url === '/api/channel/monitor/search') {
        return Promise.resolve(
          buildSearchResponse({
            request_id: 'req-payload',
            channel_ids: [11],
            total_count: 1,
            data: [
              {
                id: 11,
                name: 'alpha-primary',
                group: 'default',
                type: 1,
                status: 1,
                matched_models: [{ model: 'gpt-5.4', probe_status: 'pending', response_time: null, error_message: '' }]
              }
            ]
          })
        );
      }

      if (url === '/api/sse/channel/monitor/run') {
        const responseText = buildSseEvent('done', { request_id: 'req-payload' });
        return Promise.resolve({
          data: responseText,
          headers: {
            'content-type': 'text/event-stream'
          }
        });
      }

      throw new Error(`unexpected post: ${url}`);
    });

    render(<ChannelMonitor />);

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledTimes(2);
    });

    fireEvent.change(document.querySelector('input[name="name"]'), {
      target: { name: 'name', value: 'alpha' }
    });
    fireEvent.change(document.querySelector('input[name="models"]'), {
      target: { name: 'models', value: ' gpt-temp ' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'channel_index.search' }));

    await waitFor(() => {
      expect(mockAxiosPost).toHaveBeenCalledTimes(2);
    });

    const searchPayload = mockAxiosPost.mock.calls[0][1];
    expect(searchPayload).toMatchObject({
      page: 1,
      size: 10,
      order: '-id',
      name: 'alpha'
    });
    expect(searchPayload.models).toBeUndefined();
    expect(searchPayload.selected_monitor_models).toEqual(
      expect.arrayContaining(['gpt-5.4', 'gpt-5.5', 'claude-sonnet-4-6', 'claude-sonnet-5', 'gemini-3.5-flash', 'gpt-temp'])
    );

    const streamPayload = mockAxiosPost.mock.calls[1][1];
    expect(streamPayload.request_id).toBe('req-payload');
    expect(streamPayload.channel_ids).toEqual([11]);
    expect(streamPayload.selected_monitor_models).toEqual(searchPayload.selected_monitor_models);
  });

  it('reruns the search with the new sort order after the user changes table sorting', async () => {
    mockAxiosPost.mockImplementation((url) => {
      if (url === '/api/channel/monitor/search') {
        return Promise.resolve(
          buildSearchResponse({
            request_id: '',
            channel_ids: [],
            total_count: 2,
            data: [
              {
                id: 11,
                name: 'alpha-primary',
                group: 'default',
                type: 1,
                status: 1,
                matched_models: [{ model: 'gpt-5.4', probe_status: 'pending', response_time: null, error_message: '' }]
              }
            ]
          })
        );
      }

      throw new Error(`unexpected post: ${url}`);
    });

    render(<ChannelMonitor />);

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByRole('button', { name: 'channel_index.search' }));

    await waitFor(() => {
      expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    });

    const idSortButton = screen.getByRole('button', { name: 'ID' });
    fireEvent.click(idSortButton);

    await waitFor(() => {
      expect(mockAxiosPost).toHaveBeenCalledTimes(2);
    });

    expect(mockAxiosPost.mock.calls[0][1]).toMatchObject({
      page: 1,
      order: '-id'
    });
    expect(mockAxiosPost.mock.calls[1][1]).toMatchObject({
      page: 1,
      order: 'id'
    });
  });

  it('reruns the search with the next page when pagination changes after an initial search', async () => {
    mockAxiosPost.mockImplementation((url) => {
      if (url === '/api/channel/monitor/search') {
        return Promise.resolve(
          buildSearchResponse({
            request_id: '',
            channel_ids: [],
            total_count: 25,
            data: [
              {
                id: 11,
                name: 'alpha-primary',
                group: 'default',
                type: 1,
                status: 1,
                matched_models: [{ model: 'gpt-5.4', probe_status: 'pending', response_time: null, error_message: '' }]
              }
            ]
          })
        );
      }

      throw new Error(`unexpected post: ${url}`);
    });

    render(<ChannelMonitor />);

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByRole('button', { name: 'channel_index.search' }));

    await waitFor(() => {
      expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByLabelText('Go to next page'));

    await waitFor(() => {
      expect(mockAxiosPost).toHaveBeenCalledTimes(2);
    });

    expect(mockAxiosPost.mock.calls[0][1]).toMatchObject({
      page: 1,
      size: 10
    });
    expect(mockAxiosPost.mock.calls[1][1]).toMatchObject({
      page: 2,
      size: 10
    });
  });

  it('shows pending results first and then backfills probe status from SSE chunks', async () => {
    let streamConfig;
    let resolveStream;

    mockAxiosPost.mockImplementation((url, payload, config) => {
      void payload;

      if (url === '/api/channel/monitor/search') {
        return Promise.resolve(
          buildSearchResponse({
            request_id: 'req-1',
            channel_ids: [11],
            total_count: 1,
            data: [
              {
                id: 11,
                name: 'alpha-primary',
                group: 'default,group-a',
                type: 1,
                status: 1,
                matched_models: [
                  { model: 'gpt-5.4', probe_status: 'pending', response_time: null, error_message: '' },
                  { model: 'claude-sonnet-5', probe_status: 'pending', response_time: null, error_message: '' }
                ]
              }
            ]
          })
        );
      }

      if (url === '/api/sse/channel/monitor/run') {
        streamConfig = config;
        return new Promise((resolve) => {
          resolveStream = resolve;
        });
      }

      throw new Error(`unexpected post: ${url}`);
    });

    render(<ChannelMonitor />);

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByRole('button', { name: 'channel_index.search' }));

    await waitFor(() => {
      expect(screen.getAllByText('channel_monitor_page.statusPending')).toHaveLength(2);
    });

    const card = screen.getByTestId('channel-monitor-card-11');

    const firstChunk = buildSseEvent('result', {
      request_id: 'req-1',
      channel_id: 11,
      model: 'gpt-5.4',
      probe_status: 'healthy',
      response_time: 980,
      error_message: ''
    });

    await act(async () => {
      streamConfig.onDownloadProgress(buildProgressEvent(firstChunk));
    });

    await waitFor(() => {
      expect(within(card).getByText('channel_monitor_page.statusHealthy')).toBeTruthy();
      expect(within(card).getByText('980 ms')).toBeTruthy();
    });

    const fullStream = `${firstChunk}${buildSseEvent('result', {
      request_id: 'req-1',
      channel_id: 11,
      model: 'claude-sonnet-5',
      probe_status: 'no_response',
      response_time: null,
      error_message: 'gateway timeout'
    })}${buildSseEvent('done', {
      request_id: 'req-1'
    })}`;

    await act(async () => {
      streamConfig.onDownloadProgress(buildProgressEvent(fullStream));
      resolveStream({
        data: fullStream,
        headers: {
          'content-type': 'text/event-stream'
        }
      });
    });

    await waitFor(() => {
      expect(within(card).getByText('channel_monitor_page.statusNoResponse')).toBeTruthy();
      expect(within(card).getByText('channel_monitor_page.notAvailable')).toBeTruthy();
      expect(within(card).getByText('gateway timeout')).toBeTruthy();
      expect(screen.queryByText('channel_monitor_page.statusPending')).toBeNull();
    });
  });

  it('uses the current run channel_ids count in streaming and done summaries instead of total_count', async () => {
    let resolveStream;

    mockAxiosPost.mockImplementation((url, payload) => {
      void payload;

      if (url === '/api/channel/monitor/search') {
        return Promise.resolve(
          buildSearchResponse({
            request_id: 'req-count',
            channel_ids: [11, 12],
            total_count: 32,
            data: [
              {
                id: 11,
                name: 'alpha-primary',
                group: 'default',
                type: 1,
                status: 1,
                matched_models: [{ model: 'gpt-5.4', probe_status: 'pending', response_time: null, error_message: '' }]
              },
              {
                id: 12,
                name: 'beta-primary',
                group: 'default',
                type: 1,
                status: 1,
                matched_models: [{ model: 'gpt-5.5', probe_status: 'pending', response_time: null, error_message: '' }]
              }
            ]
          })
        );
      }

      if (url === '/api/sse/channel/monitor/run') {
        return new Promise((resolve) => {
          resolveStream = resolve;
        });
      }

      throw new Error(`unexpected post: ${url}`);
    });

    render(<ChannelMonitor />);

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByRole('button', { name: 'channel_index.search' }));

    await waitFor(() => {
      expect(screen.getByText('channel_monitor_page.streamingMessage:channels=2,completed=0,total=2')).toBeTruthy();
    });

    expect(screen.queryByText('channel_monitor_page.streamingMessage:channels=32,completed=0,total=2')).toBeNull();

    await act(async () => {
      resolveStream({
        status: 200,
        data: buildSseEvent('done', { request_id: 'req-count' }),
        headers: {
          'content-type': 'text/event-stream'
        }
      });
    });

    await waitFor(() => {
      expect(screen.getByText('channel_monitor_page.doneMessage:channels=2,completed=0,total=2')).toBeTruthy();
    });

    expect(screen.queryByText('channel_monitor_page.doneMessage:channels=32,completed=0,total=2')).toBeNull();
  });

  it('keeps the latest search result when an older search resolves late and aborts the previous request', async () => {
    const firstSearch = createDeferred();
    const secondSearch = createDeferred();
    let searchCallCount = 0;
    let firstSignal;

    mockAxiosPost.mockImplementation((url, payload, config) => {
      void payload;

      if (url === '/api/channel/monitor/search') {
        searchCallCount += 1;
        if (searchCallCount === 1) {
          firstSignal = config.signal;
          return firstSearch.promise;
        }

        return secondSearch.promise;
      }

      throw new Error(`unexpected post: ${url}`);
    });

    render(<ChannelMonitor />);

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledTimes(2);
    });

    const nameInput = document.querySelector('input[name="name"]');
    const searchButton = screen.getByRole('button', { name: 'channel_index.search' });

    fireEvent.change(nameInput, {
      target: { name: 'name', value: 'alpha' }
    });
    fireEvent.click(searchButton);

    fireEvent.change(nameInput, {
      target: { name: 'name', value: 'beta' }
    });
    fireEvent.click(searchButton);

    await waitFor(() => {
      expect(firstSignal?.aborted).toBe(true);
    });

    await act(async () => {
      secondSearch.resolve(
        buildSearchResponse({
          request_id: 'req-2',
          total_count: 1,
          data: [
            {
              id: 22,
              name: 'beta-primary',
              group: 'default',
              type: 1,
              status: 1,
              matched_models: [{ model: 'gpt-5.4', probe_status: 'pending', response_time: null, error_message: '' }]
            }
          ]
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText('beta-primary')).toBeTruthy();
    });

    await act(async () => {
      firstSearch.resolve(
        buildSearchResponse({
          request_id: 'req-1',
          total_count: 1,
          data: [
            {
              id: 11,
              name: 'alpha-primary',
              group: 'default',
              type: 1,
              status: 1,
              matched_models: [{ model: 'gpt-5.4', probe_status: 'pending', response_time: null, error_message: '' }]
            }
          ]
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText('beta-primary')).toBeTruthy();
    });

    expect(screen.queryByText('alpha-primary')).toBeNull();
  });

  it('treats JSON stream responses as normal JSON errors instead of SSE events', async () => {
    mockAxiosPost.mockImplementation((url, payload, config) => {
      void payload;

      if (url === '/api/channel/monitor/search') {
        return Promise.resolve(
          buildSearchResponse({
            request_id: 'req-json',
            channel_ids: [11],
            total_count: 1,
            data: [
              {
                id: 11,
                name: 'alpha-primary',
                group: 'default',
                type: 1,
                status: 1,
                matched_models: [{ model: 'gpt-5.4', probe_status: 'pending', response_time: null, error_message: '' }]
              }
            ]
          })
        );
      }

      if (url === '/api/sse/channel/monitor/run') {
        const jsonText = JSON.stringify({
          success: false,
          message: 'stream failed hard'
        });

        config.onDownloadProgress(buildProgressEvent(jsonText, 'application/json'));
        return Promise.resolve({
          status: 200,
          data: jsonText,
          headers: {
            'content-type': 'application/json'
          }
        });
      }

      throw new Error(`unexpected post: ${url}`);
    });

    render(<ChannelMonitor />);

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByRole('button', { name: 'channel_index.search' }));

    await waitFor(() => {
      expect(screen.getByText('stream failed hard')).toBeTruthy();
    });

    expect(mockShowError).not.toHaveBeenCalled();
    expect(screen.getByText('channel_monitor_page.statusPending')).toBeTruthy();
  });

  it('shows backend search errors from non-2xx responses without turning them into TypeError toasts', async () => {
    mockAxiosPost.mockImplementation((url) => {
      if (url === '/api/channel/monitor/search') {
        return Promise.resolve({
          status: 502,
          data: {
            success: false,
            message: 'search upstream failed'
          }
        });
      }

      throw new Error(`unexpected post: ${url}`);
    });

    render(<ChannelMonitor />);

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByRole('button', { name: 'channel_index.search' }));

    await waitFor(() => {
      expect(screen.getByText('search upstream failed')).toBeTruthy();
    });

    expect(mockShowError).not.toHaveBeenCalled();
    expect(screen.queryByText(/Cannot read properties/i)).toBeNull();
    expect(mockAxiosPost.mock.calls[0][2]).toEqual(
      expect.objectContaining({
        validateStatus: expect.any(Function)
      })
    );
  });

  it('clears the local auth state when the search request returns 401 while keeping the page-level error path', async () => {
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'expired-user' }));

    mockAxiosPost.mockImplementation((url) => {
      if (url === '/api/channel/monitor/search') {
        return Promise.resolve({
          status: 401,
          data: {
            success: false,
            message: 'search login expired'
          }
        });
      }

      throw new Error(`unexpected post: ${url}`);
    });

    render(<ChannelMonitor />);

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByRole('button', { name: 'channel_index.search' }));

    await waitFor(() => {
      expect(mockStoreDispatch).toHaveBeenCalledWith({
        type: '@account/LOGIN',
        payload: null
      });
    });

    expect(localStorage.getItem('user')).toBeNull();
    expect(screen.getByText('search login expired')).toBeTruthy();
    expect(mockShowError).not.toHaveBeenCalled();
  });

  it('keeps the original network error for the search request without showing an extra toast', async () => {
    mockAxiosPost.mockImplementation((url) => {
      if (url === '/api/channel/monitor/search') {
        return Promise.reject(buildAxiosNetworkError('Network Error'));
      }

      throw new Error(`unexpected post: ${url}`);
    });

    render(<ChannelMonitor />);

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByRole('button', { name: 'channel_index.search' }));

    await waitFor(() => {
      expect(screen.getByText('Network Error')).toBeTruthy();
    });

    expect(mockShowError).not.toHaveBeenCalled();
    expect(screen.queryByText(/Cannot read properties/i)).toBeNull();
  });

  it('keeps non-2xx stream responses in the error state instead of treating them as completed runs', async () => {
    mockAxiosPost.mockImplementation((url) => {
      if (url === '/api/channel/monitor/search') {
        return Promise.resolve(
          buildSearchResponse({
            request_id: 'req-stream-http',
            channel_ids: [11],
            total_count: 1,
            data: [
              {
                id: 11,
                name: 'alpha-primary',
                group: 'default',
                type: 1,
                status: 1,
                matched_models: [{ model: 'gpt-5.4', probe_status: 'pending', response_time: null, error_message: '' }]
              }
            ]
          })
        );
      }

      if (url === '/api/sse/channel/monitor/run') {
        return Promise.resolve({
          status: 503,
          data: {
            success: false,
            message: 'stream gateway failed'
          },
          headers: {
            'content-type': 'application/json'
          }
        });
      }

      throw new Error(`unexpected post: ${url}`);
    });

    render(<ChannelMonitor />);

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByRole('button', { name: 'channel_index.search' }));

    await waitFor(() => {
      expect(screen.getByText('stream gateway failed')).toBeTruthy();
    });

    expect(mockShowError).not.toHaveBeenCalled();
    expect(screen.queryByText(/channel_monitor_page.doneMessage/)).toBeNull();
    expect(mockAxiosPost.mock.calls[1][2]).toEqual(
      expect.objectContaining({
        validateStatus: expect.any(Function)
      })
    );
  });

  it('keeps the original network error for the stream request without showing an extra toast', async () => {
    mockAxiosPost.mockImplementation((url) => {
      if (url === '/api/channel/monitor/search') {
        return Promise.resolve(
          buildSearchResponse({
            request_id: 'req-stream-network',
            channel_ids: [11],
            total_count: 1,
            data: [
              {
                id: 11,
                name: 'alpha-primary',
                group: 'default',
                type: 1,
                status: 1,
                matched_models: [{ model: 'gpt-5.4', probe_status: 'pending', response_time: null, error_message: '' }]
              }
            ]
          })
        );
      }

      if (url === '/api/sse/channel/monitor/run') {
        return Promise.reject(buildAxiosNetworkError('stream network failed'));
      }

      throw new Error(`unexpected post: ${url}`);
    });

    render(<ChannelMonitor />);

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByRole('button', { name: 'channel_index.search' }));

    await waitFor(() => {
      expect(screen.getByText('stream network failed')).toBeTruthy();
    });

    expect(mockShowError).not.toHaveBeenCalled();
    expect(screen.queryByText(/Cannot read properties/i)).toBeNull();
  });

  it('treats swallowed search responses as request failures instead of dereferencing undefined', async () => {
    mockAxiosPost.mockImplementation((url) => {
      if (url === '/api/channel/monitor/search') {
        return Promise.resolve(undefined);
      }

      throw new Error(`unexpected post: ${url}`);
    });

    render(<ChannelMonitor />);

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByRole('button', { name: 'channel_index.search' }));

    await waitFor(() => {
      expect(screen.getByText('channel_monitor_page.requestFailed')).toBeTruthy();
    });

    expect(mockShowError).not.toHaveBeenCalled();
    expect(screen.queryByText(/Cannot read properties/i)).toBeNull();
  });

  it('registers channel monitor route in main panel routes', () => {
    const channelMonitorRoute = MainRoutes.children.find((item) => item.path === 'channel_monitor');

    expect(channelMonitorRoute).toBeTruthy();
    expect(channelMonitorRoute.path).toBe('channel_monitor');
    expect(channelMonitorRoute.element).toBeTruthy();
  });

  it('registers channel monitor admin menu entry immediately after channel', () => {
    const channelIndex = SettingMenu.children.findIndex((item) => item.id === 'channel');
    const channelMonitorIndex = SettingMenu.children.findIndex((item) => item.id === 'channel_monitor');
    const channelMonitorItem = SettingMenu.children[channelMonitorIndex];

    expect(channelIndex).toBeGreaterThanOrEqual(0);
    expect(channelMonitorIndex).toBe(channelIndex + 1);
    expect(channelMonitorItem).toMatchObject({
      id: 'channel_monitor',
      title: '渠道监控',
      type: 'item',
      url: '/panel/channel_monitor',
      breadcrumbs: false,
      isAdmin: true
    });
  });
});
