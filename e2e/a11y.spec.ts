import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extensionId, launch } from './helpers';

const TABS = ['Latest', 'Topics', 'Saved', 'Sources', 'Settings'] as const;
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

for (const colorScheme of ['light', 'dark'] as const) {
  test(`axe: no WCAG A/AA violation on popup and every dashboard tab (${colorScheme})`, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'trendradar-a11y-'));
    const context = await launch(dir, { colorScheme });
    try {
      const id = await extensionId(context);
      const page = await context.newPage();

      await page.goto(`chrome-extension://${id}/popup.html`);
      await expect(page.getByRole('button', { name: 'Ouvrir le tableau de bord' })).toBeVisible();
      const popup = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      expect(popup.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);

      await page.goto(`chrome-extension://${id}/dashboard.html#settings`);
      await page.getByRole('button', { name: 'Charger la démo' }).click();
      await expect(page.getByText(/article\(s\) de démonstration chargé/)).toBeVisible();
      // Open an article's category editor and explanation so they are audited too.
      await page.getByRole('tab', { name: 'Latest' }).click();
      const firstCard = page.locator('li.card').first();
      await firstCard.getByRole('button', { name: 'Modifier les catégories' }).click();
      await firstCard.getByRole('button', { name: 'Sauvegarder' }).click();

      for (const tab of TABS) {
        await page.getByRole('tab', { name: tab }).click();
        await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
        for (const d of await page.locator('details').all())
          await d.evaluate((el) => ((el as HTMLDetailsElement).open = true));
        const r = await new AxeBuilder({ page }).withTags(WCAG).analyze();
        expect(
          r.violations.map((v) => `${tab}/${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
        ).toEqual([]);
      }
    } finally {
      await context.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('keyboard only: skip link, tab navigation and visible focus', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'trendradar-kbd-'));
  const context = await launch(dir);
  try {
    const id = await extensionId(context);
    const page = await context.newPage();
    await page.goto(`chrome-extension://${id}/dashboard.html`);
    await expect(page.getByRole('tab', { name: 'Latest' })).toBeVisible(); // app mounted after DB open
    await page.keyboard.press('Tab'); // skip link
    await expect(page.getByRole('link', { name: 'Aller au contenu' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('tab', { name: 'Latest' })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Topics' })).toBeFocused();
    await expect(page.getByRole('tab', { name: 'Topics' })).toHaveAttribute('aria-selected', 'true');
    const outline = await page.getByRole('tab', { name: 'Topics' }).evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe('none');
  } finally {
    await context.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('narrow viewport (360 px): no horizontal scrolling', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'trendradar-narrow-'));
  const context = await launch(dir, { viewport: { width: 360, height: 800 } });
  try {
    const id = await extensionId(context);
    const page = await context.newPage();
    await page.goto(`chrome-extension://${id}/dashboard.html#settings`);
    await page.getByRole('button', { name: 'Charger la démo' }).click();
    for (const tab of TABS) {
      await page.getByRole('tab', { name: tab }).click();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${tab} overflows horizontally`).toBeLessThanOrEqual(0);
    }
  } finally {
    await context.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
