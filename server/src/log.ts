import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { z } from 'zod';

/*
 * Build log: one Markdown file per entry in content/log, named
 * YYYY-MM-DD-some-slug.md, with YAML frontmatter:
 *
 *   ---
 *   title: Moved ingress to Zoraxy
 *   date: 2026-10-09
 *   tags: [network, zoraxy]
 *   summary: One line for the list view.
 *   ---
 *
 * Loaded once at startup. The body is sent as Markdown and rendered by the
 * client without raw HTML, so an entry can't inject markup.
 */

const frontmatter = z.object({
  title: z.string().trim().min(1).max(120),
  date: z
    .union([z.date(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)])
    .transform((d) => (d instanceof Date ? d.toISOString() : d).slice(0, 10)),
  tags: z.array(z.string().trim().min(1).max(24)).max(8).default([]),
  summary: z.string().trim().max(240).optional(),
});

export type LogEntry = z.infer<typeof frontmatter> & { slug: string; body: string };
export type LogSummary = Omit<LogEntry, 'body'>;

export const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;

export function parseEntry(file: string, source: string): LogEntry {
  const m = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing frontmatter`);
  const meta = frontmatter.safeParse(YAML.parse(m[1]!) ?? {});
  if (!meta.success) throw new Error(`${file}: ${z.prettifyError(meta.error)}`);
  const slug = path.basename(file, '.md').toLowerCase();
  if (!SLUG.test(slug)) throw new Error(`${file}: file name must be lowercase letters, digits and dashes`);
  return { ...meta.data, slug, body: m[2]!.trim() };
}

export function loadLog(dir = process.env.CONTENT_DIR ?? path.resolve(__dirname, '../../content/log')) {
  if (!fs.existsSync(dir)) return [];
  const entries: LogEntry[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.md')) continue;
    const file = path.join(dir, name);
    if (fs.statSync(file).size > 200_000) {
      console.warn(`[log] skipping ${name}: larger than 200 KB`);
      continue;
    }
    try {
      entries.push(parseEntry(name, fs.readFileSync(file, 'utf8')));
    } catch (err) {
      console.warn(`[log] skipping ${(err as Error).message}`);
    }
  }
  return entries.sort((a, b) => b.date.localeCompare(a.date) || b.slug.localeCompare(a.slug));
}
