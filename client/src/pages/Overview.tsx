import {
  IconArrowDown,
  IconArrowRight,
  IconArrowUp,
  IconArrowUpRight,
  IconBox,
  IconCircleCheckFilled,
  IconCircleDashed,
  IconCircleXFilled,
  IconAlertTriangleFilled,
  IconDatabase,
  IconLock,
  IconServer2,
  IconWorld,
  IconActivityHeartbeat,
} from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card, PageHeader, Pill } from '../components/Card';
import { Meter } from '../components/Meter';
import { SocialIcons } from '../components/Social';
import { Sparkline } from '../components/Sparkline';
import { StatusBadge, UptimeBars } from '../components/Status';
import { useApi } from '../lib/api';
import { ago, bitsPerSecond, bytes, cn, duration, longDate, percent, shortHash, uptimePct } from '../lib/format';
import { firstVisit, useReducedMotion } from '../lib/motion';
import { useSite } from '../lib/site';
import type {
  Container,
  ContainersResponse,
  LogSummary,
  NasPoint,
  NasResponse,
  PublicService,
  ServiceStatus,
} from '../lib/types';

export function Overview() {
  const { site, status } = useSite();
  const nas = useApi<NasResponse>('/nas', 15_000);
  const containers = useApi<ContainersResponse>('/containers', 30_000);
  const log = useApi<LogSummary[]>('/log');

  const reduce = useReducedMotion();
  // One "first visit this session" decision drives every entrance on the page.
  // Polling, navigation and keyboard never replay them.
  const [intro] = useState(() => !reduce && firstVisit('overview-intro'));
  const owner = site?.site.owner;
  const firstName = owner?.name.split(' ')[0];

  return (
    <>
      <PageHeader eyebrow="Overview" title={firstName ? `${firstName}'s homelab` : 'homelab'}>
        {site?.site.tagline}
      </PageHeader>

      <KpiRow nas={nas.data} services={status?.services ?? null} animate={intro} />

      <div className="mt-4 grid gap-4 lg:mt-6 lg:grid-cols-3 lg:gap-6">
        <ServicesCard
          className="lg:col-span-2"
          services={site?.services ?? []}
          statuses={status?.services ?? []}
          animate={intro}
        />
        <div className="grid content-start gap-4 lg:gap-6">
          <SystemCard nas={nas.data} />
          <StorageCard nas={nas.data} animate={intro} />
        </div>
      </div>

      <ContainersCard className="mt-4 lg:mt-6" data={containers.data} error={containers.error} />

      <div className="mt-4 grid gap-4 lg:mt-6 lg:grid-cols-2 lg:gap-6">
        <LatestLog entries={log.data} />
        {site && owner && (
          <Card title={`About ${firstName}`} bodyClassName="p-4 sm:p-5">
            <p className="text-[15px] leading-relaxed text-muted">{owner.bio}</p>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <SocialIcons links={site.site.links} className="-ml-2" />
              {site.site.links.find((l) => l.kind === 'portfolio') && (
                <a
                  href={site.site.links.find((l) => l.kind === 'portfolio')!.url}
                  target="_blank"
                  rel="noopener noreferrer me"
                  className="pressable inline-flex items-center gap-1.5 rounded-xs bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-dim"
                >
                  View portfolio <IconArrowUpRight size={16} aria-hidden />
                </a>
              )}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ KPIs */

const series = (h: NasPoint[], key: 'cpu' | 'mem' | 'temp') =>
  h.flatMap((p) => (p[key] === null ? [] : [{ t: p.t, v: p[key] as number }]));

function KpiRow({
  nas,
  services,
  animate,
}: {
  nas: NasResponse | null;
  services: ServiceStatus[] | null;
  animate: boolean;
}) {
  const live = nas?.available;
  const history = nas?.history ?? [];
  const up = services?.filter((s) => s.state === 'up' || s.state === 'degraded').length ?? 0;
  const total = services?.length ?? 0;
  const uptimes = services?.map((s) => s.uptime24h).filter((u): u is number => u !== null) ?? [];
  const avg = uptimes.length ? uptimes.reduce((a, b) => a + b, 0) / uptimes.length : null;

  const tiles: { label: string; value: string; detail: ReactNode; trend?: ReactNode }[] = [
    {
      label: 'Services up',
      value: services ? `${up}/${total}` : '—',
      detail: avg === null ? 'Waiting for first checks' : `${uptimePct(avg)} avg uptime, 24h`,
    },
    {
      label: 'CPU',
      value: live ? percent(nas.cpu.percent) : '—',
      detail: live ? `${nas.cpu.cores ? `${nas.cpu.cores} cores · ` : ''}load ${nas.load?.[0] ?? '—'}` : offline(nas),
      trend: live && (
        <Sparkline points={series(history, 'cpu')} max={100} format={(v) => `${v.toFixed(0)}%`} label="CPU usage" />
      ),
    },
    {
      label: 'Memory',
      value: live ? percent(nas.memory.percent) : '—',
      detail: live
        ? `${bytes(nas.memory.usedBytes, 1, 1024)} of ${bytes(nas.memory.totalBytes, 0, 1024)}`
        : offline(nas),
      trend: live && (
        <Sparkline points={series(history, 'mem')} max={100} format={(v) => `${v.toFixed(0)}%`} label="Memory usage" />
      ),
    },
    {
      label: 'SoC temperature',
      value: live && nas.temperatureC !== null ? `${nas.temperatureC.toFixed(0)}°C` : '—',
      detail: live ? (nas.temperatureC === null ? 'No sensor reported' : 'Hottest sensor') : offline(nas),
      trend: live && (
        <Sparkline points={series(history, 'temp')} format={(v) => `${v.toFixed(1)}°C`} label="Temperature" />
      ),
    },
  ];

  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:gap-6">
      {tiles.map((t, i) => (
        <li
          key={t.label}
          className={cn(
            'flex min-w-0 flex-col rounded-xs border border-line bg-surface p-4 shadow-card',
            animate && 'reveal',
          )}
          style={animate ? { animationDelay: `${i * 50}ms` } : undefined}
        >
          <p className="text-[13px] font-medium text-muted">{t.label}</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-fg sm:text-[2rem]">
            <LiveValue value={t.value} />
          </p>
          <p className="mt-0.5 truncate text-xs text-muted">{t.detail}</p>
          {t.trend && <div className="mt-auto pt-3">{t.trend}</div>}
        </li>
      ))}
    </ul>
  );
}

/**
 * A polled number. A new reading settles in (blur + rise, 180ms); an unchanged
 * one doesn't move. Never on mount or on the first load from "—": those happen
 * on every visit, and navigation doesn't animate.
 */
function LiveValue({ value }: { value: string }) {
  const [prev, setPrev] = useState(value);
  const [changed, setChanged] = useState(false);
  if (prev !== value) {
    setPrev(value);
    setChanged(prev !== '—');
  }
  return (
    <span key={value} className={changed ? 'value-in' : undefined}>
      {value}
    </span>
  );
}

function offline(nas: NasResponse | null) {
  if (!nas) return 'Loading…';
  return nas.enabled ? 'Metrics offline' : 'Metrics not connected';
}

/* -------------------------------------------------------------- Services */

function ServicesCard({
  services,
  statuses,
  className,
  animate,
}: {
  services: PublicService[];
  statuses: ServiceStatus[];
  className?: string;
  animate: boolean;
}) {
  const byId = new Map(statuses.map((s) => [s.id, s]));
  const groups = [
    { key: 'public', title: 'Public', hint: 'Reachable on the internet through the tunnel', Icon: IconWorld },
    { key: 'internal', title: 'LAN only', hint: 'Status only. These never leave the house', Icon: IconLock },
  ] as const;
  const updated =
    statuses
      .map((s) => s.checkedAt)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

  return (
    <Card
      className={className}
      title="Services"
      icon={<IconActivityHeartbeat size={18} />}
      meta={<span className="text-xs text-muted">{updated ? `Checked ${ago(updated)}` : null}</span>}
      bodyClassName=""
    >
      {services.length === 0 && <p className="p-5 text-sm text-muted">No services configured yet.</p>}
      {groups.map(({ key, title, hint, Icon }) => {
        const list = services.filter((s) => s.visibility === key);
        if (!list.length) return null;
        return (
          <div key={key}>
            <div className="flex items-center gap-2 border-b border-line bg-surface-2/60 px-4 py-2 sm:px-5">
              <Icon size={14} className="text-muted" aria-hidden />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</h3>
              <span className="hidden truncate text-xs text-muted sm:inline">· {hint}</span>
            </div>
            <ul className="divide-y divide-line">
              {list.map((s) => (
                <ServiceRow key={s.id} service={s} status={byId.get(s.id)} animate={animate} />
              ))}
            </ul>
          </div>
        );
      })}
    </Card>
  );
}

function ServiceRow({
  service,
  status,
  animate,
}: {
  service: PublicService;
  status?: ServiceStatus;
  animate: boolean;
}) {
  const state = status?.state ?? 'unknown';
  return (
    <li className="grid gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_200px] sm:items-center sm:gap-6 sm:px-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {service.url ? (
            <a
              href={service.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-fg transition-colors duration-150 hover:text-accent"
            >
              {service.name}
              <IconArrowUpRight size={14} className="text-muted" aria-hidden />
            </a>
          ) : (
            <span className="font-semibold text-fg">{service.name}</span>
          )}
          {service.monitored ? <StatusBadge state={state} /> : <Pill>Not monitored</Pill>}
        </div>
        <p className="mt-0.5 text-sm text-muted">{service.description}</p>
        {status && (
          <p className="mt-1.5 font-mono text-[11px] text-muted">
            {status.latencyMs !== null && <span>{status.latencyMs} ms · </span>}
            <span>24h {uptimePct(status.uptime24h)}</span>
            <span> · 30d {uptimePct(status.uptime30d)}</span>
          </p>
        )}
      </div>
      {status && <UptimeBars hours={status.hours} uptime24h={status.uptime24h} animate={animate} />}
    </li>
  );
}

/* ---------------------------------------------------------------- System */

function SystemCard({ nas }: { nas: NasResponse | null }) {
  const live = nas?.available;
  const rows: [string, ReactNode][] = [
    ['Uptime', live ? duration(nas.uptimeSeconds) : '—'],
    ['Load (1/5/15m)', live && nas.load ? nas.load.join(' / ') : '—'],
    [
      'Network',
      live && nas.network ? (
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex items-center gap-0.5">
            <IconArrowDown size={12} aria-label="download" /> {bitsPerSecond(nas.network.rxBps)}
          </span>
          <span className="inline-flex items-center gap-0.5">
            <IconArrowUp size={12} aria-label="upload" /> {bitsPerSecond(nas.network.txBps)}
          </span>
        </span>
      ) : (
        '—'
      ),
    ],
    ['Platform', 'RK3588C · arm64'],
  ];
  return (
    <Card
      title="System"
      icon={<IconServer2 size={18} />}
      meta={<span className="text-xs text-muted">{live ? `Updated ${ago(nas.updatedAt)}` : offline(nas)}</span>}
    >
      <dl className="grid gap-2.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4">
            <dt className="text-muted">{k}</dt>
            <dd className="text-right font-mono text-[13px] text-fg">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function StorageCard({ nas, animate }: { nas: NasResponse | null; animate: boolean }) {
  const volumes = nas?.available ? nas.volumes : [];
  return (
    <Card title="Storage" icon={<IconDatabase size={18} />}>
      {volumes.length === 0 ? (
        <p className="text-sm text-muted">{nas?.available ? 'No volumes configured.' : offline(nas)}</p>
      ) : (
        <ul className="grid gap-4">
          {volumes.map((v) => {
            const level = v.percent >= 90 ? 'Nearly full' : v.percent >= 75 ? 'Filling up' : 'Healthy';
            return (
              <li key={v.label}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium text-fg">{v.label}</span>
                  <span className="font-mono text-xs text-muted">
                    {bytes(v.usedBytes)} / {bytes(v.sizeBytes)}
                  </span>
                </div>
                <Meter value={v.percent} label={`${v.label} used`} animate={animate} />
                <p className="mt-1 text-xs text-muted">
                  {percent(v.percent)} used · {level}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------ Containers */

const CONTAINER_STATE = (c: Container) => {
  if (c.health === 'unhealthy') return { label: 'Unhealthy', Icon: IconCircleXFilled, cls: 'text-critical' };
  if (c.state === 'running')
    return c.health === 'starting'
      ? { label: 'Starting', Icon: IconAlertTriangleFilled, cls: 'text-warning' }
      : { label: 'Running', Icon: IconCircleCheckFilled, cls: 'text-good' };
  if (c.state === 'restarting') return { label: 'Restarting', Icon: IconAlertTriangleFilled, cls: 'text-warning' };
  if (c.state === 'dead') return { label: 'Dead', Icon: IconCircleXFilled, cls: 'text-critical' };
  return {
    label: c.state === 'exited' ? 'Stopped' : c.state[0]!.toUpperCase() + c.state.slice(1),
    Icon: IconCircleDashed,
    cls: 'text-muted',
  };
};

function ContainersCard({
  data,
  error,
  className,
}: {
  data: ContainersResponse | null;
  error: Error | null;
  className?: string;
}) {
  const list = data?.containers ?? [];
  const running = list.filter((c) => c.state === 'running').length;
  const unavailable = data && (!data.enabled || !data.available);

  return (
    <Card
      className={className}
      title="Containers"
      icon={<IconBox size={18} />}
      meta={
        list.length > 0 && (
          <span className="text-xs text-muted">
            {running} running · {list.length - running} stopped
          </span>
        )
      }
      bodyClassName=""
    >
      {!data && !error && <p className="p-5 text-sm text-muted">Loading…</p>}
      {(error || unavailable) && (
        <p className="p-5 text-sm text-muted">
          {data && !data.enabled ? 'Docker metrics are not connected.' : 'Docker is unreachable right now.'}
        </p>
      )}
      {list.length > 0 && (
        // Focusable so keyboard users can scroll it horizontally on small screens.
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Containers table">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2/60 text-xs font-semibold uppercase tracking-wider text-muted">
                <th scope="col" className="px-4 py-2 font-semibold sm:px-5">
                  Name
                </th>
                <th scope="col" className="px-4 py-2 font-semibold">
                  State
                </th>
                <th scope="col" className="hidden px-4 py-2 font-semibold sm:table-cell">
                  Image
                </th>
                <th scope="col" className="px-4 py-2 font-semibold sm:pr-5">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map((c) => {
                const s = CONTAINER_STATE(c);
                return (
                  <tr key={c.name}>
                    <td className="px-4 py-2.5 font-mono text-[13px] text-fg sm:px-5">{c.name}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-fg">
                        <s.Icon size={14} className={s.cls} aria-hidden />
                        {s.label}
                      </span>
                    </td>
                    <td className="hidden max-w-[220px] truncate px-4 py-2.5 font-mono text-xs text-muted sm:table-cell">
                      {c.image ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted sm:pr-5">{c.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* --------------------------------------------------------------- Log */

function LatestLog({ entries }: { entries: LogSummary[] | null }) {
  return (
    <Card
      title="Latest from the build log"
      meta={
        <Link
          to="/log"
          className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-dim"
        >
          All entries <IconArrowRight size={14} aria-hidden />
        </Link>
      }
      bodyClassName=""
    >
      <ul className="divide-y divide-line">
        {(entries ?? []).slice(0, 3).map((e) => (
          <li key={e.slug}>
            <Link
              to={`/log/${e.slug}`}
              className="block px-4 py-3.5 transition-colors duration-150 hover:bg-surface-2/60 sm:px-5"
            >
              <p className="font-mono text-[11px] text-muted">
                <span className="text-accent-2">{shortHash(e.slug)}</span> · {longDate(e.date)}
              </p>
              <p className="mt-0.5 font-semibold text-fg">{e.title}</p>
              {e.summary && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{e.summary}</p>}
            </Link>
          </li>
        ))}
        {entries && entries.length === 0 && <li className="p-5 text-sm text-muted">No entries yet.</li>}
      </ul>
    </Card>
  );
}
