import type { ReactNode } from 'react';
import { cn } from '../lib/format';

/** Dashboard card: a titled white panel. The site's one container. */
export function Card({
  title,
  icon,
  meta,
  children,
  className,
  bodyClassName = 'p-4 sm:p-5',
}: {
  title?: ReactNode;
  icon?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn('min-w-0 rounded-xs border border-line bg-surface shadow-card', className)}>
      {title && (
        <div className="flex items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
          {icon && (
            <span className="text-accent" aria-hidden>
              {icon}
            </span>
          )}
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{title}</h2>
          {meta}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** Page title block, shared by every route. */
export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-6 sm:mb-8">
      <p className="font-mono text-xs font-medium uppercase tracking-wider text-accent">{eyebrow}</p>
      <h1 className="mt-1.5 text-2xl font-bold text-fg headline-balance sm:text-3xl">{title}</h1>
      {children && <div className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">{children}</div>}
    </header>
  );
}

/** A small pill, e.g. "Public" / "LAN only". */
export function Pill({
  children,
  tone = 'neutral',
  icon,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent';
  icon?: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
        tone === 'accent' ? 'bg-accent-soft text-accent-dim' : 'bg-surface-2 text-muted',
      )}
    >
      {icon}
      {children}
    </span>
  );
}
