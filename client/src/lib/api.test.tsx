import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HttpError, useApi } from './api';

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('useApi', () => {
  it('loads data', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok({ a: 1 }));
    const { result } = renderHook(() => useApi<{ a: number }>('/x'));
    await waitFor(() => expect(result.current.data).toEqual({ a: 1 }));
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/x', expect.anything());
  });

  it('keeps the last good data when a refresh fails', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(ok({ v: 1 }))
      .mockResolvedValue(new Response('', { status: 503 }));
    const { result } = renderHook(() => useApi<{ v: number }>('/x', 1000));
    await waitFor(() => expect(result.current.data).toEqual({ v: 1 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    await waitFor(() => expect(result.current.error).toBeInstanceOf(HttpError));
    expect(result.current.data).toEqual({ v: 1 });
    expect(fetch.mock.calls.length).toBeGreaterThanOrEqual(2);
    vi.useRealTimers();
  });

  it('does not poll while the tab is hidden', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok({}));
    renderHook(() => useApi('/x', 1000));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fetch).toHaveBeenCalledTimes(1); // the initial load only
    visibility.mockRestore();
    vi.useRealTimers();
  });
});
