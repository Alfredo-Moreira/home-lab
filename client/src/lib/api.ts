import { useEffect, useState } from 'react';

export class HttpError extends Error {
  status: number;
  constructor(status: number) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`/api${path}`, { signal, headers: { accept: 'application/json' } });
  if (!res.ok) throw new HttpError(res.status);
  return res.json() as Promise<T>;
}

type State<T> = { data: T | null; error: Error | null; loading: boolean };

/**
 * Fetch once, or every `intervalMs` while the tab is visible. Keeps the last
 * good data on a failed refresh so a blip doesn't blank the page.
 */
export function useApi<T>(path: string, intervalMs?: number): State<T> {
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: true });

  useEffect(() => {
    let ctrl = new AbortController();
    let timer: number | undefined;
    let cancelled = false;

    const run = async () => {
      ctrl.abort();
      ctrl = new AbortController();
      try {
        const data = await getJson<T>(path, ctrl.signal);
        if (!cancelled) setState({ data, error: null, loading: false });
      } catch (err) {
        if (cancelled || (err as Error).name === 'AbortError') return;
        setState((s) => ({ data: s.data, error: err as Error, loading: false }));
      }
    };

    const schedule = () => {
      window.clearInterval(timer);
      if (intervalMs && document.visibilityState === 'visible') timer = window.setInterval(run, intervalMs);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && intervalMs) void run();
      schedule();
    };

    setState((s) => ({ ...s, loading: true }));
    void run();
    schedule();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      ctrl.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [path, intervalMs]);

  return state;
}
