import { describe, expect, it, vi } from 'vitest';

describe('firstVisit', () => {
  it('is true once per session, and calls in the same tick agree (StrictMode)', async () => {
    vi.useFakeTimers();
    const { firstVisit } = await import('./motion');
    expect(firstVisit('k')).toBe(true);
    expect(firstVisit('k')).toBe(true); // same tick: StrictMode double render
    vi.runAllTimers();
    expect(firstVisit('k')).toBe(false); // later navigation: no replay
    vi.useRealTimers();
  });
});
