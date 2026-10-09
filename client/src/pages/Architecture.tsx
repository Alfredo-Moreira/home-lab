import {
  IconCloudLock,
  IconLock,
  IconRoute,
  IconShieldCheck,
  IconTopologyStar3,
  IconTruckDelivery,
} from '@tabler/icons-react';
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Card, PageHeader } from '../components/Card';
import { cn } from '../lib/format';
import { firstVisit, useReducedMotion } from '../lib/motion';
import { useSite } from '../lib/site';
import type { PublicService } from '../lib/types';

/*
 * Request-path diagram. Two routes share the same boxes: a public request
 * (Internet → Cloudflare → tunnel → Zoraxy → public apps) and a LAN request
 * (device → router → Zoraxy → LAN-only apps). Picking a route highlights it
 * and sends one packet along it.
 *
 * Motion: the packet is explanatory and user-triggered (rare), so it runs
 * longer than the UI budget (1.4s, ease-in-out). It animates `transform`
 * only via WAAPI, so a new pick cancels it mid-flight cleanly. Reduced
 * motion: no packet, the highlight alone explains the route.
 */

type Route = 'public' | 'lan';
type NodeId = 'visitor' | 'cloudflare' | 'cloudflared' | 'lan' | 'router' | 'zoraxy' | 'publicApps' | 'lanApps';
type Pt = { x: number; y: number };

const NODES: Record<NodeId, { title: string; sub: string; d: Pt; m: Pt }> = {
  visitor: { title: 'Visitor', sub: 'Any browser', d: { x: 90, y: 110 }, m: { x: 92, y: 48 } },
  cloudflare: { title: 'Cloudflare edge', sub: 'TLS · WAF · DNS', d: { x: 300, y: 110 }, m: { x: 92, y: 148 } },
  cloudflared: { title: 'cloudflared', sub: 'Tunnel connector', d: { x: 520, y: 110 }, m: { x: 92, y: 300 } },
  lan: { title: 'LAN device', sub: 'Phone, laptop', d: { x: 90, y: 310 }, m: { x: 268, y: 48 } },
  router: { title: 'Home router', sub: 'No ports forwarded', d: { x: 300, y: 310 }, m: { x: 268, y: 148 } },
  zoraxy: { title: 'Zoraxy', sub: 'Reverse proxy', d: { x: 710, y: 210 }, m: { x: 180, y: 420 } },
  publicApps: { title: 'Public apps', sub: '', d: { x: 900, y: 115 }, m: { x: 92, y: 560 } },
  lanApps: { title: 'LAN-only apps', sub: '', d: { x: 900, y: 305 }, m: { x: 268, y: 560 } },
};

const ROUTES: Record<Route, NodeId[]> = {
  public: ['visitor', 'cloudflare', 'cloudflared', 'zoraxy', 'publicApps'],
  lan: ['lan', 'router', 'zoraxy', 'lanApps'],
};

const STEPS: Record<Route, { title: string; body: string }[]> = {
  public: [
    {
      title: 'Cloudflare answers first',
      body: 'DNS points at Cloudflare, not my house. TLS ends at the edge, and the WAF and DDoS protection sit in front of everything.',
    },
    {
      title: 'Down the tunnel',
      body: 'cloudflared on the NAS holds an outbound connection to Cloudflare. Requests ride back down it, so the router has zero open inbound ports.',
    },
    {
      title: 'Zoraxy routes the hostname',
      body: 'The tunnel hands every public hostname to Zoraxy, which picks the container. One place for routing rules, logs and headers.',
    },
    {
      title: 'The app answers',
      body: 'Only containers I have deliberately published are reachable this way. Everything else has no public hostname at all.',
    },
  ],
  lan: [
    {
      title: 'Stays inside the house',
      body: 'Devices on the home network resolve internal hostnames straight to the NAS. Nothing leaves the LAN.',
    },
    {
      title: 'Zoraxy routes it',
      body: 'The same reverse proxy serves LAN-only hostnames that Cloudflare has never heard of.',
    },
    {
      title: 'Private apps answer',
      body: 'Home Assistant, the NAS admin UI, the registry and my in-progress apps only exist on this side.',
    },
  ],
};

const W = { d: 1000, m: 360 };
const H_ = { d: 420, m: 680 };
const NODE_W = { d: 160, m: 156 };

function useWide() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia('(min-width: 768px)');
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia('(min-width: 768px)').matches,
    () => true,
  );
}

function appLines(list: PublicService[]) {
  const names = list.map((s) => s.name);
  return names.length > 5 ? [...names.slice(0, 4), `+${names.length - 4} more`] : names;
}

export function Architecture() {
  const { site } = useSite();
  const wide = useWide();
  const reduce = useReducedMotion();
  const [route, setRoute] = useState<Route>('public');
  // The first visit this session shows the public route travelled once; after that, only on a pick.
  const [plays, setPlays] = useState(() => (firstVisit('arch-packet') ? 1 : 0));
  const packetRef = useRef<SVGCircleElement>(null);
  const edgeRefs = useRef(new Map<string, SVGPathElement>());

  const L = wide ? 'd' : 'm';
  const nodeW = NODE_W[L];
  const services = site?.services ?? [];
  const lists: Partial<Record<NodeId, string[]>> = {
    publicApps: appLines(services.filter((s) => s.visibility === 'public')),
    lanApps: appLines(services.filter((s) => s.visibility === 'internal')),
  };
  const heightOf = (id: NodeId) => (lists[id] ? 40 + Math.max(1, lists[id]!.length) * 17 : 56);
  const pos = (id: NodeId) => NODES[id][L];

  const edgePath = (a: NodeId, b: NodeId) => {
    const p = pos(a),
      q = pos(b);
    if (wide) {
      const x1 = p.x + nodeW / 2,
        x2 = q.x - nodeW / 2,
        mx = (x1 + x2) / 2;
      return p.y === q.y ? `M${x1},${p.y} L${x2},${q.y}` : `M${x1},${p.y} C${mx},${p.y} ${mx},${q.y} ${x2},${q.y}`;
    }
    const y1 = p.y + heightOf(a) / 2,
      y2 = q.y - heightOf(b) / 2,
      my = (y1 + y2) / 2;
    return p.x === q.x ? `M${p.x},${y1} L${q.x},${y2}` : `M${p.x},${y1} C${p.x},${my} ${q.x},${my} ${q.x},${y2}`;
  };

  const edges = (Object.keys(ROUTES) as Route[]).flatMap((r) =>
    ROUTES[r].slice(1).map((to, i) => ({ route: r, from: ROUTES[r][i]!, to, key: `${ROUTES[r][i]}-${to}` })),
  );
  const onRoute = new Set(ROUTES[route]);

  // Tunnel: an outbound connection from the NAS to Cloudflare, drawn as a dashed arc.
  const cfd = pos('cloudflared'),
    cf = pos('cloudflare');
  const tunnel = wide
    ? `M${cfd.x},${cfd.y - 28} C${cfd.x - 40},${cfd.y - 95} ${cf.x + 40},${cf.y - 95} ${cf.x},${cf.y - 28}`
    : // Hugs the left edge (nodes start at x=14), staying inside the viewBox.
      `M${cfd.x - nodeW / 2},${cfd.y} C${cfd.x - nodeW / 2 - 12},${cfd.y - 50} ${cf.x - nodeW / 2 - 12},${cf.y + 50} ${cf.x - nodeW / 2},${cf.y}`;

  // NAS boundary.
  const nas = wide ? { x: 430, y: 30, w: 560, h: 370 } : { x: 8, y: 240, w: 344, h: 430 };

  // One packet along the chosen route. WAAPI on transform: GPU, cancellable.
  const played = useRef(0);
  useLayoutEffect(() => {
    const dot = packetRef.current;
    // Only a click (plays++) sends a packet; keyboard or resize changes don't.
    if (!dot || reduce || plays === played.current) return;
    const previous = played.current;
    played.current = plays;
    const segs = ROUTES[route]
      .slice(1)
      .map((to, i) => edgeRefs.current.get(`${ROUTES[route][i]}-${to}`)!)
      .filter(Boolean);
    const total = segs.reduce((s, p) => s + p.getTotalLength(), 0);
    const frames: Keyframe[] = [];
    let acc = 0;
    for (const seg of segs) {
      const len = seg.getTotalLength();
      for (let i = 0; i <= 12; i++) {
        const pt = seg.getPointAtLength((len * i) / 12);
        frames.push({
          transform: `translate(${pt.x}px, ${pt.y}px)`,
          offset: Math.min(1, (acc + (len * i) / 12) / total),
          opacity: 1,
        });
      }
      acc += len;
    }
    frames[frames.length - 1]!.opacity = 0;
    const anim = dot.animate(frames, { duration: 1400, easing: 'cubic-bezier(0.77, 0, 0.175, 1)', fill: 'forwards' });
    return () => {
      anim.cancel();
      played.current = previous; // StrictMode re-runs the effect: let it play again
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- route/layout are read for the current play only
  }, [plays]);

  const choose = (r: Route) => {
    setRoute(r);
    setPlays((n) => n + 1);
  };

  return (
    <>
      <PageHeader eyebrow="Architecture" title="How a request gets in">
        Public sites come in through an outbound-only Cloudflare tunnel; everything else stays on the LAN. One reverse
        proxy, Zoraxy, routes both.
      </PageHeader>

      <Card
        title="Request path"
        icon={<IconRoute size={18} />}
        bodyClassName=""
        meta={
          <div
            role="radiogroup"
            aria-label="Route"
            className="relative grid grid-cols-2 rounded-xs bg-surface-2 p-0.5 text-xs font-semibold"
          >
            {/* One pill slides between the options (transform, interruptible transition). */}
            <span
              aria-hidden
              className="absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-[3px] bg-surface shadow-sm transition-transform duration-[220ms] ease-[var(--ease-in-out-strong)] motion-reduce:transition-none"
              style={{ transform: route === 'lan' ? 'translateX(100%)' : 'translateX(0)' }}
            />
            {(['public', 'lan'] as const).map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={route === r}
                onClick={() => choose(r)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                    e.preventDefault();
                    // Keyboard: move the selection, but no packet (keyboard changes are instant).
                    const next = r === 'public' ? 'lan' : 'public';
                    setRoute(next);
                    (
                      e.currentTarget.parentElement?.querySelector(`[data-route="${next}"]`) as HTMLElement | null
                    )?.focus();
                  }
                }}
                data-route={r}
                tabIndex={route === r ? 0 : -1}
                className={cn(
                  'pressable relative z-10 whitespace-nowrap rounded-[3px] px-2.5 py-1.5',
                  route === r ? 'text-accent-dim' : 'text-muted hover:text-fg',
                )}
              >
                {r === 'public' ? 'Public request' : 'LAN request'}
              </button>
            ))}
          </div>
        }
      >
        <div>
          <div className="border-b border-line p-3 sm:p-5">
            <svg
              viewBox={`0 0 ${W[L]} ${H_[L]}`}
              className="mx-auto block w-full"
              style={{ maxWidth: wide ? undefined : 420 }}
              role="img"
              aria-label={`Diagram of the ${route === 'public' ? 'public' : 'LAN'} request path: ${ROUTES[route].map((n) => NODES[n].title).join(', then ')}.`}
            >
              <defs>
                <marker
                  id="arrow"
                  viewBox="0 0 8 8"
                  refX="7"
                  refY="4"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M0,0 L8,4 L0,8 z" fill="context-stroke" />
                </marker>
              </defs>

              <rect
                x={nas.x}
                y={nas.y}
                width={nas.w}
                height={nas.h}
                rx="10"
                fill="var(--color-surface-2)"
                fillOpacity="0.55"
                stroke="var(--color-line-strong)"
                strokeDasharray="6 5"
              />
              <text
                x={nas.x + 14}
                y={nas.y + nas.h - 14}
                className="fill-muted text-[11px] font-semibold uppercase tracking-wider"
              >
                UGREEN DH4300 Plus · Docker
              </text>

              <path
                d={tunnel}
                fill="none"
                stroke={route === 'public' ? 'var(--color-accent-2)' : 'var(--color-line-strong)'}
                strokeWidth="1.5"
                strokeDasharray="4 4"
                markerEnd="url(#arrow)"
              />
              <text
                x={wide ? (cf.x + cfd.x) / 2 : cf.x + 10}
                y={wide ? cf.y - 82 : (cf.y + cfd.y) / 2}
                textAnchor={wide ? 'middle' : 'start'}
                className={cn('font-mono text-[11px]', route === 'public' ? 'fill-accent-2' : 'fill-muted')}
              >
                {wide ? 'outbound-only tunnel' : 'outbound tunnel'}
              </text>

              {edges.map((e) => {
                const active = e.route === route;
                return (
                  <path
                    key={e.key}
                    ref={(el) => {
                      if (el) edgeRefs.current.set(e.key, el);
                    }}
                    d={edgePath(e.from, e.to)}
                    fill="none"
                    style={{
                      stroke: active ? 'var(--color-accent)' : 'var(--color-line-strong)',
                      strokeWidth: active ? 2 : 1.5,
                    }}
                    markerEnd="url(#arrow)"
                    className="transition-[stroke] duration-200"
                  />
                );
              })}

              {(Object.keys(NODES) as NodeId[]).map((id) => {
                const n = NODES[id];
                const p = pos(id);
                const h = heightOf(id);
                const active = onRoute.has(id);
                const list = lists[id];
                return (
                  <g key={id} className="transition-opacity duration-200" style={{ opacity: active ? 1 : 0.55 }}>
                    <rect
                      x={p.x - nodeW / 2}
                      y={p.y - h / 2}
                      width={nodeW}
                      height={h}
                      rx="6"
                      className="transition-[fill,stroke] duration-200"
                      style={{
                        fill: active ? 'var(--color-accent-soft)' : 'var(--color-surface)',
                        stroke: active ? 'var(--color-accent)' : 'var(--color-line-strong)',
                        strokeWidth: active ? 1.5 : 1,
                      }}
                    />
                    <text x={p.x - nodeW / 2 + 12} y={p.y - h / 2 + 22} className="fill-fg text-[13px] font-semibold">
                      {n.title}
                    </text>
                    {list ? (
                      (list.length ? list : ['none yet']).map((name, i) => (
                        <text
                          key={name}
                          x={p.x - nodeW / 2 + 12}
                          y={p.y - h / 2 + 40 + i * 17}
                          className="fill-muted font-mono text-[11px]"
                        >
                          {name.length > 20 ? `${name.slice(0, 19)}…` : name}
                        </text>
                      ))
                    ) : (
                      <text x={p.x - nodeW / 2 + 12} y={p.y - h / 2 + 40} className="fill-muted text-[11px]">
                        {n.sub}
                      </text>
                    )}
                  </g>
                );
              })}

              <circle
                ref={packetRef}
                r="5.5"
                cx="0"
                cy="0"
                fill="var(--color-accent)"
                stroke="#fff"
                strokeWidth="2"
                opacity="0"
                aria-hidden
              />
            </svg>
          </div>

          <ol className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-4">
            {STEPS[route].map((s, i) => (
              <li key={s.title} className="grid grid-cols-[24px_minmax(0,1fr)] gap-3">
                <span className="grid size-6 place-items-center rounded-full bg-accent-soft font-mono text-xs font-semibold text-accent-dim">
                  {i + 1}
                </span>
                <div>
                  <p className="text-sm font-semibold text-fg">{s.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-muted">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:mt-6 lg:grid-cols-2 lg:gap-6">
        <Card title="Security model" icon={<IconShieldCheck size={18} />}>
          <ul className="grid gap-3.5 text-sm">
            {[
              {
                Icon: IconCloudLock,
                t: 'Zero inbound ports',
                b: 'The tunnel is outbound-only. Port scans of my home IP find nothing.',
              },
              {
                Icon: IconLock,
                t: 'Private by default',
                b: 'A service is LAN-only unless I give it a public hostname in Cloudflare on purpose.',
              },
              {
                Icon: IconTopologyStar3,
                t: 'One choke point',
                b: 'Every request, public or LAN, passes through Zoraxy, so routing and access rules live in one place.',
              },
              {
                Icon: IconShieldCheck,
                t: 'This page is allowlisted',
                b: 'The API builds every response field by field. Internal hostnames, IPs, ports and image tags never reach your browser.',
              },
            ].map(({ Icon, t, b }) => (
              <li key={t} className="grid grid-cols-[20px_minmax(0,1fr)] gap-3">
                <Icon size={20} stroke={1.75} className="text-accent" aria-hidden />
                <div>
                  <p className="font-semibold text-fg">{t}</p>
                  <p className="mt-0.5 leading-relaxed text-muted">{b}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Deploy pipeline" icon={<IconTruckDelivery size={18} />}>
          <ol className="relative grid gap-4 text-sm before:absolute before:bottom-3 before:left-[11px] before:top-3 before:w-px before:bg-line-strong">
            {[
              {
                t: 'Build on the laptop',
                b: 'docker buildx builds linux/amd64 and linux/arm64 from the same Dockerfile.',
                code: 'scripts/build-and-push.sh',
              },
              {
                t: 'Push to the private registry',
                b: 'A versioned tag from the VERSION file, plus :latest.',
                code: ':v1.0.0',
              },
              {
                t: 'NAS pulls, never builds',
                b: 'docker compose on the NAS pulls the arm64 image and restarts the container.',
                code: 'docker-compose.nas.yml',
              },
              {
                t: 'Rollback = change a tag',
                b: 'Every release stays in the registry, so going back is one line.',
                code: null,
              },
            ].map((s, i) => (
              <li key={s.t} className="relative grid grid-cols-[24px_minmax(0,1fr)] gap-3">
                <span className="relative grid size-6 place-items-center rounded-full border border-line-strong bg-surface font-mono text-xs font-semibold text-muted">
                  {i + 1}
                </span>
                <div>
                  <p className="font-semibold text-fg">{s.t}</p>
                  <p className="mt-0.5 leading-relaxed text-muted">{s.b}</p>
                  {s.code && (
                    <code className="mt-1 inline-block rounded-[3px] bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-accent-2">
                      {s.code}
                    </code>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  );
}
