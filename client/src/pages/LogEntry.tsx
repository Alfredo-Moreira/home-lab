import { IconArrowLeft } from '@tabler/icons-react';
import Markdown from 'react-markdown';
import { Link, useParams } from 'react-router-dom';
import remarkGfm from 'remark-gfm';
import { Card, PageHeader, Pill } from '../components/Card';
import { HttpError, useApi } from '../lib/api';
import { longDate, shortHash } from '../lib/format';
import type { LogEntry } from '../lib/types';
import { NotFound } from './NotFound';

// Lazy-loaded route: keeps the Markdown renderer out of the main bundle.
export default function LogEntryPage() {
  const { slug = '' } = useParams();
  const { data, error } = useApi<LogEntry>(`/log/${encodeURIComponent(slug)}`);

  if (error instanceof HttpError && error.status === 404) return <NotFound />;

  return (
    <article className="max-w-3xl">
      <Link to="/log" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-accent">
        <IconArrowLeft size={16} aria-hidden /> Build log
      </Link>
      {error && <p className="text-sm text-muted">Couldn't load this entry.</p>}
      {data && (
        <>
          <PageHeader eyebrow={`${shortHash(data.slug)} · ${longDate(data.date)}`} title={data.title}>
            {data.summary}
          </PageHeader>
          <Card>
            {/* No raw HTML: react-markdown escapes it by default. */}
            <div className="prose-log">
              <Markdown remarkPlugins={[remarkGfm]}>{data.body}</Markdown>
            </div>
            {data.tags.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-1.5 border-t border-line pt-4">
                {data.tags.map((t) => (
                  <Pill key={t}>{t}</Pill>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </article>
  );
}
