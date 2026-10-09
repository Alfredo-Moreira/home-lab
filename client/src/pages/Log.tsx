import { Link } from 'react-router-dom';
import { Card, PageHeader, Pill } from '../components/Card';
import { useApi } from '../lib/api';
import { longDate, shortHash } from '../lib/format';
import type { LogSummary } from '../lib/types';

/** The build log as a commit history: newest first, hash + date + title. */
export function Log() {
  const { data, error } = useApi<LogSummary[]>('/log');
  return (
    <>
      <PageHeader eyebrow="Build log" title="What changed, and why">
        Dated notes on everything I add, break, and fix. Think of it as the homelab's commit history.
      </PageHeader>
      <Card bodyClassName="">
        {error && <p className="p-5 text-sm text-muted">Couldn't load the log.</p>}
        {!data && !error && <p className="p-5 text-sm text-muted">Loading…</p>}
        <ol className="divide-y divide-line">
          {(data ?? []).map((e) => (
            <li key={e.slug}>
              <Link
                to={`/log/${e.slug}`}
                className="grid gap-1 px-4 py-4 transition-colors duration-150 hover:bg-surface-2/60 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-6 sm:px-5"
              >
                <p className="font-mono text-xs text-muted">
                  <span className="text-accent-2">{shortHash(e.slug)}</span>
                  <span className="sm:block"> · {longDate(e.date)}</span>
                </p>
                <div className="min-w-0">
                  <p className="font-semibold text-fg">{e.title}</p>
                  {e.summary && <p className="mt-0.5 text-sm leading-relaxed text-muted">{e.summary}</p>}
                  {e.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {e.tags.map((t) => (
                        <Pill key={t}>{t}</Pill>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}
