import { describe, expect, it } from 'vitest';
import { ago, bitsPerSecond, bytes, duration, percent, shortHash, uptimePct } from './format';

describe('format', () => {
  it('bytes: decimal for disks, binary for RAM', () => {
    expect(bytes(15.9e12)).toBe('15.9 TB');
    expect(bytes(810e9)).toBe('810 GB');
    expect(bytes(8 * 1024 ** 3, 0, 1024)).toBe('8 GB');
    expect(bytes(512)).toBe('512 B');
    expect(bytes(null)).toBe('—');
  });

  it('bitsPerSecond converts bytes/s to bits', () => {
    expect(bitsPerSecond(1_250_000)).toBe('10.0 Mb/s');
    expect(bitsPerSecond(125)).toBe('1 kb/s');
    expect(bitsPerSecond(2e8)).toBe('1.6 Gb/s');
    expect(bitsPerSecond(undefined)).toBe('—');
  });

  it('uptimePct never rounds a miss up to 100%', () => {
    expect(uptimePct(1)).toBe('100%');
    expect(uptimePct(0.99999)).toBe('99.99%');
    expect(uptimePct(0.99934)).toBe('99.93%');
    expect(uptimePct(null)).toBe('—');
  });

  it('duration and ago', () => {
    expect(duration(90061)).toBe('1d 1h');
    expect(duration(3720)).toBe('1h 2m');
    expect(duration(59)).toBe('0m');
    const now = Date.parse('2026-10-09T12:00:00Z');
    expect(ago('2026-10-09T11:59:30Z', now)).toBe('30s ago');
    expect(ago('2026-10-09T09:00:00Z', now)).toBe('3h ago');
    expect(ago(null, now)).toBe('—');
  });

  it('percent and shortHash', () => {
    expect(percent(23.44)).toBe('23%');
    expect(percent(23.44, 1)).toBe('23.4%');
    expect(shortHash('a')).toMatch(/^[0-9a-f]{7}$/);
    expect(shortHash('a')).toBe(shortHash('a'));
    expect(shortHash('a')).not.toBe(shortHash('b'));
  });
});
