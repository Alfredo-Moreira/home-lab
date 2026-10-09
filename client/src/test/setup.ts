import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  sessionStorage.clear();
});

// jsdom gaps the app relies on.
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('min-width: 768px'), // desktop layout by default
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}
if (!Element.prototype.animate) {
  Element.prototype.animate = function () {
    return { cancel() {}, finished: Promise.resolve() } as unknown as Animation;
  };
}
// Like current Chrome, which returns a Promise (an effect must not return it).
window.scrollTo = (() => Promise.resolve()) as unknown as typeof window.scrollTo;
// jsdom has no SVG geometry; the diagram samples its paths for the packet.
const svgProto = (globalThis as unknown as { SVGElement: typeof SVGElement }).SVGElement.prototype as unknown as Record<
  string,
  unknown
>;
svgProto.getTotalLength ??= () => 100;
svgProto.getPointAtLength ??= (n: number) => ({ x: n, y: 0 });
