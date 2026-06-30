/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Table, TableBody } from '@mui/material';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import LogTableRow from './TableRow';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key
  })
}));

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('display_in_currency', 'false');
});

afterEach(() => {
  cleanup();
});

function createColumnVisibility(overrides = {}) {
  return {
    channel_id: true,
    completion: false,
    content: false,
    created_at: false,
    detail: true,
    duration: false,
    error_code: false,
    error_type: false,
    group: false,
    message: false,
    model_name: false,
    quota: false,
    request_path: false,
    request_time: false,
    source_ip: false,
    status_code: false,
    token_name: false,
    type: false,
    user_id: false,
    ...overrides
  };
}

function createRetryTrace() {
  return {
    attempt_count: 3,
    retry_count: 2,
    total_duration_ms: 17680,
    attempts: [
      {
        sequence: 1,
        channel_id: 14993,
        channel_name: 'gemini-ti',
        duration: 130,
        status_code: 404,
        error_code: 'INVALID_ARGUMENT',
        error_type: 'invalid_request_error',
        message: 'attempt-1',
        success: false
      },
      {
        sequence: 2,
        channel_id: 14123,
        channel_name: 'gemini-b',
        duration: 220,
        status_code: 0,
        error_code: 'realtime_first_message_failed',
        error_type: '',
        message: 'attempt-2',
        success: false
      },
      {
        sequence: 3,
        channel_id: 14415,
        channel_name: 'gemini-ymvm',
        duration: 17330,
        status_code: 200,
        error_code: '',
        error_type: '',
        message: 'success',
        success: true
      }
    ]
  };
}

function createRetryTraceWithSummaryOverrides() {
  return {
    ...createRetryTrace(),
    attempt_count: 11,
    retry_count: 10,
    total_duration_ms: 99999
  };
}

function createSingleAttemptRetryTrace() {
  return {
    attempt_count: 1,
    retry_count: 0,
    total_duration_ms: 17330,
    attempts: [
      {
        sequence: 1,
        channel_id: 14415,
        channel_name: 'gemini-ymvm',
        duration: 17330,
        status_code: 200,
        error_code: '',
        error_type: '',
        message: 'success',
        success: true
      }
    ]
  };
}

function createItem(overrides = {}) {
  const base = {
    id: 1,
    type: 2,
    quota: 1200,
    content: 'detail',
    channel_id: 14415,
    prompt_tokens: 64,
    completion_tokens: 32,
    channel: {
      name: 'gemini-ymvm'
    },
    metadata: {
      retry_trace: createRetryTrace()
    }
  };

  return {
    ...base,
    ...overrides,
    channel: {
      ...base.channel,
      ...(overrides.channel || {})
    },
    metadata: {
      ...base.metadata,
      ...(overrides.metadata || {})
    }
  };
}

function renderRow(columnVisibility, options = {}) {
  return render(
    <Table>
      <TableBody>
        <LogTableRow
          item={options.item || createItem()}
          userIsAdmin={options.userIsAdmin ?? true}
          userGroup={options.userGroup || {}}
          columnVisibility={columnVisibility}
          isErrorLog={options.isErrorLog ?? false}
        />
      </TableBody>
    </Table>
  );
}

describe('LogTableRow', () => {
  it('shows retry chain text and keeps retry panel available when quota column is hidden', async () => {
    renderRow(createColumnVisibility({ quota: false }));

    expect(screen.getByText('14993(gemini-ti)->14123(gemini-b)->14415(gemini-ymvm)')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'logPage.retryDetail.title' }));

    await waitFor(() => {
      expect(screen.getByText('logPage.retryDetail.title')).toBeTruthy();
    });

    expect(screen.getByText(/logPage\.retryDetail\.attemptCount/)).toBeTruthy();
    expect(screen.getByText(/logPage\.retryDetail\.message: attempt-1/)).toBeTruthy();
  });

  it('renders retry summary metrics from retry_trace fields and per-attempt durations from attempt.duration', async () => {
    renderRow(createColumnVisibility({ quota: false }), {
      item: createItem({
        metadata: {
          retry_trace: createRetryTraceWithSummaryOverrides()
        }
      })
    });

    fireEvent.click(screen.getByRole('button', { name: 'logPage.retryDetail.title' }));

    await waitFor(() => {
      expect(screen.getByText('logPage.retryDetail.title')).toBeTruthy();
    });

    expect(screen.getByText('11')).toBeTruthy();
    expect(screen.getByText('10')).toBeTruthy();
    expect(screen.getByText('99999 ms')).toBeTruthy();

    expect(screen.getByText('logPage.retryDetail.duration: 130 ms')).toBeTruthy();
    expect(screen.getByText('logPage.retryDetail.duration: 220 ms')).toBeTruthy();
    expect(screen.getByText('logPage.retryDetail.duration: 17330 ms')).toBeTruthy();
  });

  it('switches between retry and quota panels without showing both at once', async () => {
    renderRow(createColumnVisibility({ quota: true }));

    fireEvent.click(screen.getByRole('button', { name: 'logPage.retryDetail.title' }));

    await waitFor(() => {
      expect(screen.getByText('logPage.retryDetail.title')).toBeTruthy();
    });
    expect(screen.queryByText('logPage.quotaDetail.finalCalculation')).toBeNull();

    fireEvent.click(screen.getByText('1200'));

    await waitFor(() => {
      expect(screen.getByText('logPage.quotaDetail.finalCalculation')).toBeTruthy();
    });
    expect(screen.queryByText('logPage.retryDetail.title')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'logPage.retryDetail.title' }));

    await waitFor(() => {
      expect(screen.getByText('logPage.retryDetail.title')).toBeTruthy();
    });
    expect(screen.queryByText('logPage.quotaDetail.finalCalculation')).toBeNull();
  });

  it('auto-collapses quota panel when quota column is hidden and keeps retry trigger usable', async () => {
    const { rerender } = renderRow(createColumnVisibility({ quota: true, channel_id: true }));

    fireEvent.click(screen.getByText('1200'));

    await waitFor(() => {
      expect(screen.getByText('logPage.quotaDetail.finalCalculation')).toBeTruthy();
    });

    rerender(
      <Table>
        <TableBody>
          <LogTableRow item={createItem()} userIsAdmin={true} userGroup={{}} columnVisibility={createColumnVisibility({ quota: false })} />
        </TableBody>
      </Table>
    );

    await waitFor(() => {
      expect(screen.queryByText('logPage.quotaDetail.finalCalculation')).toBeNull();
    });
    expect(screen.getByRole('button', { name: 'logPage.retryDetail.title' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'logPage.retryDetail.title' }));

    await waitFor(() => {
      expect(screen.getByText('logPage.retryDetail.title')).toBeTruthy();
    });
  });

  it('collapses retry panel when channel column becomes hidden', async () => {
    const { rerender } = renderRow(createColumnVisibility({ channel_id: true, quota: false }));

    fireEvent.click(screen.getByRole('button', { name: 'logPage.retryDetail.title' }));

    await waitFor(() => {
      expect(screen.getByText('logPage.retryDetail.title')).toBeTruthy();
    });

    rerender(
      <Table>
        <TableBody>
          <LogTableRow
            item={createItem()}
            userIsAdmin={true}
            userGroup={{}}
            columnVisibility={createColumnVisibility({ channel_id: false, quota: false })}
          />
        </TableBody>
      </Table>
    );

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'logPage.retryDetail.title' })).toBeNull();
      expect(screen.queryByText('logPage.retryDetail.title')).toBeNull();
    });
  });

  it('keeps the old channel display and no retry trigger when retry_trace is absent', () => {
    renderRow(createColumnVisibility({ quota: false }), {
      item: createItem({
        metadata: {
          retry_trace: undefined
        }
      })
    });

    expect(screen.getByText('14415 (gemini-ymvm)')).toBeTruthy();
    expect(screen.queryByText('14993(gemini-ti)->14123(gemini-b)->14415(gemini-ymvm)')).toBeNull();
    expect(screen.queryByRole('button', { name: 'logPage.retryDetail.title' })).toBeNull();
  });

  it('keeps the old channel display when retry_trace only contains one successful attempt', () => {
    renderRow(createColumnVisibility({ quota: false }), {
      item: createItem({
        metadata: {
          retry_trace: createSingleAttemptRetryTrace()
        }
      })
    });

    expect(screen.getByText('14415 (gemini-ymvm)')).toBeTruthy();
    expect(screen.queryByText('14415(gemini-ymvm)')).toBeNull();
    expect(screen.queryByRole('button', { name: 'logPage.retryDetail.title' })).toBeNull();
  });

  it('keeps retry detail admin-only even when retry_trace is present', () => {
    renderRow(createColumnVisibility({ channel_id: true, quota: false }), {
      userIsAdmin: false
    });

    expect(screen.queryByText('14993(gemini-ti)->14123(gemini-b)->14415(gemini-ymvm)')).toBeNull();
    expect(screen.queryByRole('button', { name: 'logPage.retryDetail.title' })).toBeNull();
    expect(screen.queryByText('logPage.retryDetail.title')).toBeNull();
  });

  it('keeps error log rows on the old rendering path even if retry_trace exists', () => {
    renderRow(
      createColumnVisibility({
        channel_id: true,
        status_code: true,
        error_code: true,
        error_type: true,
        request_path: true,
        content: true,
        detail: false
      }),
      {
        isErrorLog: true,
        item: createItem({
          type: 5,
          status_code: 429,
          error_code: 'rate_limit',
          error_type: 'rate_limit_error',
          request_path: '/v1/chat/completions',
          content: 'upstream error'
        })
      }
    );

    expect(screen.getByText('14415 (gemini-ymvm)')).toBeTruthy();
    expect(screen.queryByText('14993(gemini-ti)->14123(gemini-b)->14415(gemini-ymvm)')).toBeNull();
    expect(screen.queryByRole('button', { name: 'logPage.retryDetail.title' })).toBeNull();
    expect(screen.getByText('429')).toBeTruthy();
    expect(screen.getByText('rate_limit')).toBeTruthy();
    expect(screen.getByText('upstream error')).toBeTruthy();
  });
});
