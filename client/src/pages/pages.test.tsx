import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import App from '../App';
import { mockApi, nas } from '../test/fixtures';

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

describe('Overview', () => {
  it('shows KPIs, services, storage and containers from the API', async () => {
    mockApi();
    renderAt('/');
    expect(await screen.findByRole('heading', { name: "Alfredo's homelab" })).toBeInTheDocument();
    expect(await screen.findByText('23%')).toBeInTheDocument(); // CPU
    expect(screen.getByText('52°C')).toBeInTheDocument();
    expect(screen.getByText('4.0 GB of 8 GB')).toBeInTheDocument();
    expect(screen.getAllByText('1/2').length).toBeGreaterThan(0);
    expect(screen.getByText('94% used · Nearly full')).toBeInTheDocument();
    expect(screen.getByText('Unhealthy')).toBeInTheDocument();
    expect(screen.getByText('Stopped')).toBeInTheDocument();
  });

  it('animates a KPI only when a new reading arrives, not on load', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetch = mockApi();
    const { container } = renderAt('/');
    await screen.findByText('23%');
    expect(container.querySelector('.value-in')).toBeNull(); // first load from "—"
    fetch.mockRestore();
    mockApi({ '/api/nas': { ...nas, cpu: { percent: 61, cores: 8 } } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_100);
    });
    const value = await screen.findByText('61%');
    expect(value).toHaveClass('value-in');
    vi.useRealTimers();
  });

  it('links public services but never internal ones', async () => {
    mockApi();
    renderAt('/');
    const web = await screen.findByRole('link', { name: /Website/ });
    expect(web).toHaveAttribute('href', 'https://example.com');
    expect(screen.getByText('Home Assistant').closest('a')).toBeNull();
    expect(screen.getByText('Not monitored')).toBeInTheDocument();
  });

  it('degrades gracefully when metrics and Docker are not connected', async () => {
    mockApi({
      '/api/nas': { enabled: false, available: false, cpu: {}, memory: {}, volumes: [], history: [] },
      '/api/containers': { enabled: false, available: false, containers: [] },
    });
    renderAt('/');
    expect((await screen.findAllByText('Metrics not connected')).length).toBeGreaterThan(0);
    expect(await screen.findByText('Docker metrics are not connected.')).toBeInTheDocument();
  });

  it('plays the entrance once per session only', async () => {
    mockApi();
    vi.resetModules(); // fresh "first visit" state
    const { default: FreshApp } = await import('../App');
    const at = () =>
      render(
        <MemoryRouter>
          <FreshApp />
        </MemoryRouter>,
      );
    const first = at();
    await screen.findByText('23%');
    expect(first.container.querySelectorAll('.reveal')).toHaveLength(4);
    expect(first.container.querySelectorAll('.strip-reveal').length).toBeGreaterThan(0);
    first.unmount();
    await new Promise((r) => setTimeout(r, 0));
    const second = at();
    await screen.findByText('23%');
    expect(second.container.querySelectorAll('.reveal')).toHaveLength(0);
    expect(second.container.querySelectorAll('.strip-reveal')).toHaveLength(0);
  });
});

describe('Architecture', () => {
  it('switches routes and their explanation', async () => {
    mockApi();
    renderAt('/architecture');
    expect(await screen.findByText('Down the tunnel')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'LAN request' }));
    expect(screen.getByText('Stays inside the house')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /LAN request path/ })).toBeInTheDocument();
  });

  it('sends a packet on click but not on keyboard (keyboard changes are instant)', async () => {
    mockApi();
    const animate = vi.spyOn(Element.prototype, 'animate');
    renderAt('/architecture');
    const lan = await screen.findByRole('radio', { name: 'LAN request' });
    const pub = screen.getByRole('radio', { name: 'Public request' });
    animate.mockClear();
    fireEvent.keyDown(pub, { key: 'ArrowRight' });
    expect(lan).toHaveAttribute('aria-checked', 'true');
    expect(animate).not.toHaveBeenCalled();
    fireEvent.click(pub);
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it('lists app names from the API in the diagram, never URLs', async () => {
    mockApi();
    renderAt('/architecture');
    const svg = await screen.findByRole('img', { name: /request path/ });
    await waitFor(() => expect(within(svg).getByText('Website')).toBeInTheDocument());
    expect(svg.textContent).not.toContain('https://');
  });
});

describe('Other routes', () => {
  it('renders hardware and stack', async () => {
    mockApi();
    renderAt('/hardware');
    expect(await screen.findByText('DH4300 Plus')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Zoraxy/ })).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('navigates from the log list to an entry (client-side)', async () => {
    mockApi({
      '/api/log/2026-10-09-launch': {
        slug: '2026-10-09-launch',
        title: 'Launch',
        date: '2026-10-09',
        tags: [],
        body: 'Body',
      },
    });
    renderAt('/log');
    fireEvent.click(await screen.findByRole('link', { name: /Launch/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Launch' })).toBeInTheDocument();
  });

  it('lists the build log', async () => {
    mockApi();
    renderAt('/log');
    expect(await screen.findByText('Launch')).toBeInTheDocument();
  });

  it('renders a log entry as Markdown without raw HTML', async () => {
    mockApi({
      '/api/log/2026-10-09-launch': {
        slug: '2026-10-09-launch',
        title: 'Launch',
        date: '2026-10-09',
        tags: [],
        body: '## Heading\n\n<img src=x onerror=alert(1)> **bold**',
      },
    });
    const { container } = renderAt('/log/2026-10-09-launch');
    expect(await screen.findByRole('heading', { name: 'Heading' })).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('bold').tagName).toBe('STRONG');
  });

  it('shows the 404 page for unknown routes and unknown entries', async () => {
    mockApi();
    renderAt('/nope');
    expect(await screen.findByText('Nothing is routed here')).toBeInTheDocument();
  });
});
