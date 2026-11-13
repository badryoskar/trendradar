/**
 * Regenerates the README screenshots from the REAL installed extension and
 * the REAL Hacker News API. Run: SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts
 * Nothing is staged or edited: what you see is what the extension showed.
 */
import { expect, test } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extensionId, launch } from './helpers';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/screenshots');

test('capture README screenshots (real HN data)', async () => {
  test.skip(process.env.SCREENSHOTS !== '1', 'set SCREENSHOTS=1 to regenerate docs/screenshots');
  test.setTimeout(120_000);
  mkdirSync(OUT, { recursive: true });
  const dir = mkdtempSync(join(tmpdir(), 'trendradar-shots-'));
  const context = await launch(dir, { viewport: { width: 1100, height: 820 } });
  try {
    const id = await extensionId(context);
    const page = await context.newPage();
    await page.goto(`chrome-extension://${id}/dashboard.html#sources`);
    await page.getByRole('button', { name: 'J’ai compris' }).click();
    await page.getByRole('button', { name: 'Ajouter Hacker News' }).click();
    await page.getByRole('button', { name: 'Actualiser' }).click();
    await expect(page.getByText(/Hacker News — Top stories : \d+ nouveau/)).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: join(OUT, 'sources.png') });

    await page.getByRole('tab', { name: 'Latest' }).click();
    await page.screenshot({ path: join(OUT, 'latest.png') });

    await page.getByLabel('Publication (date déclarée)').selectOption('today');
    const first = page.locator('li.card').first();
    await first
      .getByText('Pourquoi ces catégories ?')
      .click()
      .catch(() => undefined);
    await page.screenshot({ path: join(OUT, 'filters.png') });

    await page.getByRole('tab', { name: 'Topics' }).click();
    for (const d of await page.locator('details').all())
      await d.evaluate((el) => ((el as HTMLDetailsElement).open = true));
    await page.screenshot({ path: join(OUT, 'topics.png'), fullPage: true });

    await page.getByRole('tab', { name: 'Settings' }).click();
    await page.screenshot({ path: join(OUT, 'settings.png') });

    const popup = await context.newPage();
    await popup.setViewportSize({ width: 360, height: 200 });
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await expect(popup.getByText(/article\(s\) stocké\(s\)/)).toBeVisible();
    await popup.screenshot({ path: join(OUT, 'popup.png') });
  } finally {
    await context.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
