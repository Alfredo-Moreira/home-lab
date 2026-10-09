import { Link } from 'react-router-dom';
import { PageHeader } from '../components/Card';

export function NotFound() {
  return (
    <>
      <PageHeader eyebrow="404" title="Nothing is routed here">
        Zoraxy looked, but no service answers on this path.
      </PageHeader>
      <Link
        to="/"
        className="pressable inline-flex rounded-xs bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-dim"
      >
        Back to the overview
      </Link>
    </>
  );
}
