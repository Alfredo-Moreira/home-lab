import {
  IconBrandFacebook,
  IconBrandGithub,
  IconBrandInstagram,
  IconBrandLinkedin,
  IconBrandX,
  IconBrandYoutube,
  IconLink,
  IconMail,
  IconWorld,
} from '@tabler/icons-react';
import { cn } from '../lib/format';
import type { LinkKind, Site } from '../lib/types';

export const LINK_ICON: Record<LinkKind, typeof IconWorld> = {
  portfolio: IconWorld,
  github: IconBrandGithub,
  linkedin: IconBrandLinkedin,
  instagram: IconBrandInstagram,
  facebook: IconBrandFacebook,
  x: IconBrandX,
  youtube: IconBrandYoutube,
  email: IconMail,
  other: IconLink,
};

export function SocialIcons({ links, className }: { links: Site['site']['links']; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap gap-1', className)}>
      {links.map((l) => {
        const Icon = LINK_ICON[l.kind];
        return (
          <li key={l.url}>
            <a
              href={l.url}
              target="_blank"
              rel="noopener noreferrer me"
              aria-label={l.label}
              title={l.label}
              className="pressable grid size-9 place-items-center rounded-xs text-muted hover:bg-surface-2 hover:text-accent"
            >
              <Icon size={18} stroke={1.75} />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
