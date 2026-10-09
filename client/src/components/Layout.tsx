import { IconCpu, IconGitCommit, IconLayoutDashboard, IconTopologyStar3 } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { cn } from '../lib/format';
import { useSite } from '../lib/site';
import { SocialIcons } from './Social';

const NAV = [
  { to: '/', label: 'Overview', Icon: IconLayoutDashboard, end: true },
  { to: '/architecture', label: 'Architecture', Icon: IconTopologyStar3, end: false },
  { to: '/hardware', label: 'Hardware', Icon: IconCpu, end: false },
  { to: '/log', label: 'Build log', Icon: IconGitCommit, end: false },
];

function Logo() {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-[7px] bg-accent" aria-hidden>
      <svg viewBox="0 0 32 32" className="size-8">
        <rect x="7" y="8" width="18" height="5" rx="1.5" fill="#fff" />
        <rect x="7" y="15" width="18" height="5" rx="1.5" fill="#fff" fillOpacity=".85" />
        <rect x="7" y="22" width="18" height="3" rx="1.5" fill="#fff" fillOpacity=".6" />
      </svg>
    </span>
  );
}

/** "Live" summary: services up / total. The ping only runs when everything is up. */
function LiveSummary({ compact = false }: { compact?: boolean }) {
  const { status } = useSite();
  if (!status || status.summary.total === 0) return null;
  const { up, total } = status.summary;
  const allUp = up === total;
  return (
    <span className="inline-flex items-center gap-2 text-xs font-medium text-fg" role="status">
      <span className="relative flex size-2" aria-hidden>
        {allUp && <span className="ping-soft absolute inset-0 rounded-full bg-good" />}
        <span className={cn('relative size-2 rounded-full', allUp ? 'bg-good' : 'bg-warning')} />
      </span>
      {compact ? `${up}/${total} up` : allUp ? `All ${total} services up` : `${up} of ${total} services up`}
    </span>
  );
}

function NavItem({ to, label, Icon, end, mobile }: (typeof NAV)[number] & { mobile?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'pressable flex items-center gap-2.5 rounded-xs text-sm font-medium',
          mobile ? 'shrink-0 px-3 py-2' : 'px-3 py-2',
          isActive ? 'bg-accent-soft text-accent-dim' : 'text-muted hover:bg-surface-2 hover:text-fg',
        )
      }
    >
      <Icon size={18} stroke={1.75} aria-hidden />
      {label}
    </NavLink>
  );
}

export function Layout() {
  const { site } = useSite();
  const { pathname } = useLocation();

  // New page, start at the top (instant, navigation never animates).
  useEffect(() => {
    window.scrollTo(0, 0); // braces: newer browsers return a Promise here, not a cleanup
  }, [pathname]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-xs focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>

      {/* Desktop sidebar: the column carries the background, the inner panel sticks. */}
      <div className="hidden border-r border-line bg-surface lg:block">
        <aside className="sticky top-0 flex h-dvh flex-col px-4 py-5">
          <NavLink to="/" className="flex items-center gap-3 px-1">
            <Logo />
            <span className="min-w-0">
              <span className="block text-[15px] font-bold leading-tight text-fg">{site?.site.title ?? 'homelab'}</span>
              <span className="block truncate font-mono text-[11px] text-muted">
                {site ? `${site.site.owner.handle}@lab` : ' '}
              </span>
            </span>
          </NavLink>

          <nav aria-label="Main" className="mt-8 flex flex-col gap-1">
            {NAV.map((n) => (
              <NavItem key={n.to} {...n} />
            ))}
          </nav>

          <div className="mt-6 rounded-xs border border-line bg-surface-2/60 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Status</p>
            <div className="mt-1.5 min-h-5">
              <LiveSummary />
            </div>
          </div>

          {site && (
            <div className="mt-auto border-t border-line pt-4">
              <div className="flex items-center gap-3 px-1">
                <span
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-bold text-accent-dim"
                  aria-hidden
                >
                  {initials(site.site.owner.name)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-fg">{site.site.owner.name}</span>
                  <span className="block truncate text-xs text-muted">{site.site.owner.role}</span>
                </span>
              </div>
              <SocialIcons links={site.site.links} className="mt-3" />
            </div>
          )}
        </aside>
      </div>

      {/* Mobile top bar + tabs */}
      <div className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur lg:hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <NavLink to="/" className="flex min-w-0 flex-1 items-center gap-2.5">
            <Logo />
            <span className="truncate text-[15px] font-bold text-fg">{site?.site.title ?? 'homelab'}</span>
          </NavLink>
          <LiveSummary compact />
        </div>
        <nav aria-label="Main" className="-mb-px flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none]">
          {NAV.map((n) => (
            <NavItem key={n.to} {...n} mobile />
          ))}
        </nav>
      </div>

      <div className="flex min-w-0 flex-col">
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
          <Outlet />
        </main>
        <Footer>{site && <SocialIcons links={site.site.links} className="lg:hidden" />}</Footer>
      </div>
    </div>
  );
}

function Footer({ children }: { children?: ReactNode }) {
  return (
    <footer className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-5 text-xs text-muted sm:px-6 lg:px-10">
      <p>
        Served from a UGREEN DH4300 Plus through a Cloudflare tunnel. <span className="font-mono">GET /api</span> is
        read-only.
      </p>
      {children}
    </footer>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
