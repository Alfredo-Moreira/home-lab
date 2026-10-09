import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const PAGES = [
  { path: '/', heading: /homelab/ },
  { path: '/architecture', heading: 'How a request gets in' },
  { path: '/hardware', heading: 'What it runs on, and why' },
  { path: '/log', heading: 'What changed, and why' },
];

/** Collect console errors (CSP violations surface here) for the page's lifetime. */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

for (const { path, heading } of PAGES) {
  test.describe(`page ${path}`, () => {
    test('renders without errors or horizontal overflow', async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      expect(errors).toEqual([]);
    });

    test('has no serious accessibility violations', async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  });
}

test.describe('overview (live demo data)', () => {
  test('shows live metrics, services and containers', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('CPU', { exact: true })).toBeVisible();
    await expect(page.locator('li', { hasText: 'CPU' }).getByText(/^\d+%$/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Services' })).toBeVisible();
    await expect(page.getByRole('img', { name: /Uptime, last 24 hours/ }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: 'meal-prep-calculator' }).first()).toBeVisible();
    await expect(page.getByRole('meter').first()).toBeVisible();
  });

  test('never links LAN-only services', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Home Assistant').first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Home Assistant/ })).toHaveCount(0);
  });
});

test.describe('architecture', () => {
  test('switches between the public and LAN route', async ({ page }) => {
    await page.goto('/architecture');
    await expect(page.getByText('Down the tunnel')).toBeVisible();
    await page.getByRole('radio', { name: 'LAN request' }).click();
    await expect(page.getByRole('radio', { name: 'LAN request' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('Stays inside the house')).toBeVisible();
  });
});

test.describe('build log', () => {
  test('opens an entry', async ({ page }) => {
    await page.goto('/log');
    await page.getByRole('link', { name: /This site is live/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'This site is live' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'How a request gets here' })).toBeVisible();
  });

  test('unknown routes and entries show the 404 page', async ({ page }) => {
    await page.goto('/definitely-not-here');
    await expect(page.getByRole('heading', { name: 'Nothing is routed here' })).toBeVisible();
    await page.goto('/log/not-a-real-entry');
    await expect(page.getByRole('heading', { name: 'Nothing is routed here' })).toBeVisible();
  });
});

test.describe('motion', () => {
  test('reduced motion stops loops and drops movement', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    // The live ping only renders when every service is up, so probe the CSS directly.
    const computed = await page.evaluate(() => {
      const probe = (cls: string) => {
        const el = document.createElement('span');
        el.className = cls;
        document.body.append(el);
        const { animationName } = getComputedStyle(el);
        el.remove();
        return animationName;
      };
      return { ping: probe('ping-soft'), value: probe('value-in'), strip: probe('strip-reveal') };
    });
    expect(computed).toEqual({ ping: 'none', value: 'fade-in', strip: 'fade-in' });
  });
});
