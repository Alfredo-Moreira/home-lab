import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Meter } from './Meter';
import { Sparkline } from './Sparkline';
import { StatusBadge, UptimeBars } from './Status';

describe('StatusBadge', () => {
  it('always pairs the color with a word', () => {
    render(<StatusBadge state="down" />);
    expect(screen.getByText('Down')).toBeInTheDocument();
  });
  it('cross-fades only when the state actually changes, never on mount', () => {
    const { container, rerender } = render(<StatusBadge state="up" />);
    expect(container.querySelector('.state-in')).toBeNull();
    rerender(<StatusBadge state="up" />);
    expect(container.querySelector('.state-in')).toBeNull();
    rerender(<StatusBadge state="down" />);
    expect(container.querySelector('.state-in')).not.toBeNull();
  });

  it('does not animate the first result after "not checked yet"', () => {
    const { container, rerender } = render(<StatusBadge state="unknown" />);
    rerender(<StatusBadge state="up" />);
    expect(container.querySelector('.state-in')).toBeNull();
  });

  it('labels unknown state honestly', () => {
    render(<StatusBadge state="unknown" />);
    expect(screen.getByText('Not checked yet')).toBeInTheDocument();
  });
});

describe('UptimeBars', () => {
  const hours = [...Array(23).fill(1), 0.5];

  it('gives screen readers one summary, not 24 stops', () => {
    render(<UptimeBars hours={hours} uptime24h={0.979} />);
    expect(screen.getByRole('img', { name: 'Uptime, last 24 hours: 97.90%' })).toBeInTheDocument();
  });

  it('shows the hovered hour in a tooltip', () => {
    render(<UptimeBars hours={hours} uptime24h={0.979} />);
    const strip = screen.getByRole('img');
    strip.getBoundingClientRect = () => ({
      left: 0,
      width: 240,
      top: 0,
      height: 24,
      right: 240,
      bottom: 24,
      x: 0,
      y: 0,
      toJSON() {},
    });
    fireEvent.pointerMove(strip, { clientX: 239 });
    expect(screen.getByText('Last hour · 50.00% up')).toBeInTheDocument();
    fireEvent.pointerLeave(strip);
    expect(screen.queryByText(/Last hour/)).toBeNull();
  });

  it('only wipes the strip in on a first visit, as one animation', () => {
    const { container, rerender } = render(<UptimeBars hours={hours} uptime24h={1} />);
    expect(container.querySelectorAll('.strip-reveal')).toHaveLength(0);
    rerender(<UptimeBars hours={hours} uptime24h={1} animate />);
    expect(container.querySelectorAll('.strip-reveal')).toHaveLength(1);
  });
});

describe('Meter', () => {
  it('exposes its value and clamps it', () => {
    render(<Meter value={140} label="Disk" />);
    const m = screen.getByRole('meter', { name: 'Disk' });
    expect(m).toHaveAttribute('aria-valuenow', '100');
  });
  it('escalates tone with severity', () => {
    const { container, rerender } = render(<Meter value={50} label="d" />);
    expect(container.querySelector('.bg-accent')).not.toBeNull();
    rerender(<Meter value={80} label="d" />);
    expect(container.querySelector('.bg-warning')).not.toBeNull();
    rerender(<Meter value={95} label="d" />);
    expect(container.querySelector('.bg-critical')).not.toBeNull();
  });
});

describe('Sparkline', () => {
  it('renders nothing meaningful with fewer than two points', () => {
    render(<Sparkline points={[{ t: 0, v: 1 }]} format={String} label="CPU" />);
    expect(screen.queryByRole('img')).toBeNull();
  });
  it('labels the series and its window', () => {
    render(
      <Sparkline
        points={[
          { t: 0, v: 1 },
          { t: 600_000, v: 2 },
        ]}
        format={String}
        label="CPU usage"
      />,
    );
    expect(screen.getByRole('img', { name: 'CPU usage, last 10 minutes' })).toBeInTheDocument();
  });
});
