import { useSyncExternalStore } from 'react';

const query = '(prefers-reduced-motion: reduce)';

export function useReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

// Calls in the same task agree (StrictMode double-invokes initialisers); the
// answer then flips to false so returning to the page later doesn't replay.
const decided = new Map<string, boolean>();

/** True for the first view in a browser session (rare, so it may animate). */
export function firstVisit(key: string) {
  if (!decided.has(key)) {
    let first = false;
    try {
      first = !sessionStorage.getItem(key);
      sessionStorage.setItem(key, '1');
    } catch {
      /* storage blocked: treat as seen, no animation */
    }
    decided.set(key, first);
    if (first) setTimeout(() => decided.set(key, false), 0);
  }
  return decided.get(key)!;
}
