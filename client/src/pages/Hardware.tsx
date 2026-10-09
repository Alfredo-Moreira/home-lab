import {
  IconArrowUpRight,
  IconBolt,
  IconCpu,
  IconDatabase,
  IconNetwork,
  IconPlug,
  IconStack2,
} from '@tabler/icons-react';
import { Card, PageHeader } from '../components/Card';
import { useSite } from '../lib/site';

const GROUP_ICON: Record<string, typeof IconCpu> = {
  compute: IconCpu,
  storage: IconDatabase,
  network: IconNetwork,
  power: IconBolt,
  'i/o': IconPlug,
};

export function Hardware() {
  const { site } = useSite();
  return (
    <>
      <PageHeader eyebrow="Hardware & stack" title="What it runs on, and why">
        A quiet 4-bay ARM box that idles at low power, and the handful of tools that turn it into a small production
        environment.
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:gap-6">
        {(site?.hardware ?? []).map((g) => {
          const Icon = GROUP_ICON[g.group.toLowerCase()] ?? IconCpu;
          return (
            <Card key={g.group} title={g.group} icon={<Icon size={18} />} bodyClassName="">
              <ul className="divide-y divide-line">
                {g.items.map((it) => (
                  <li key={it.name} className="px-4 py-3.5 sm:px-5">
                    <p className="font-semibold text-fg">{it.name}</p>
                    <p className="mt-0.5 font-mono text-[13px] leading-relaxed text-accent-2">{it.detail}</p>
                    {it.why && <p className="mt-1.5 text-sm leading-relaxed text-muted">{it.why}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>

      {site && site.stack.length > 0 && (
        <Card className="mt-4 lg:mt-6" title="Software stack" icon={<IconStack2 size={18} />} bodyClassName="">
          <ul className="divide-y divide-line">
            {site.stack.map((s) => (
              <li key={s.name} className="grid gap-1 px-4 py-3.5 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-6 sm:px-5">
                <div>
                  {s.href ? (
                    <a
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-fg transition-colors duration-150 hover:text-accent"
                    >
                      {s.name}
                      <IconArrowUpRight size={14} className="text-muted" aria-hidden />
                    </a>
                  ) : (
                    <span className="font-semibold text-fg">{s.name}</span>
                  )}
                  <p className="text-xs text-muted">{s.role}</p>
                </div>
                <p className="text-sm leading-relaxed text-muted">{s.why}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
