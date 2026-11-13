import { chromium, expect, test, type BrowserContext } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');

async function launch(userDataDir: string): Promise<BrowserContext> {
  return chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
}

/** The extension has no service worker, so read its id from chrome://extensions. */
async function extensionId(context: BrowserContext): Promise<string> {
  const page = await context.newPage();
  await page.goto('chrome://extensions');
  const id = await page.evaluate(async () => {
    // developerPrivate is exposed to the chrome://extensions WebUI.
    const api = (
      globalThis as unknown as {
        chrome: { developerPrivate: { getExtensionsInfo(): Promise<Array<{ id: string; name: string }>> } };
      }
    ).chrome.developerPrivate;
    const list = await api.getExtensionsInfo();
    return list.find((e) => e.name === 'TrendRadar')?.id ?? null;
  });
  await page.close();
  if (!id) throw new Error('TrendRadar extension not loaded');
  return id;
}

test.describe('installed extension', () => {
  let userDataDir: string;

  test.beforeEach(() => {
    userDataDir = mkdtempSync(join(tmpdir(), 'trendradar-e2e-'));
  });
  test.afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true });
  });

  test('loads with no required permission; popup and dashboard work', async () => {
    const context = await launch(userDataDir);
    const id = await extensionId(context);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await expect(popup.getByText('Configuration requise : aucune source ajoutée.')).toBeVisible();
    const manifest = await popup.evaluate(() => chrome.runtime.getManifest());
    expect(manifest.permissions ?? []).toEqual([]);
    expect(manifest.host_permissions ?? []).toEqual([]);
    expect(await popup.evaluate(() => chrome.permissions.getAll())).toMatchObject({ origins: [] });

    const [dashboard] = await Promise.all([
      context.waitForEvent('page'),
      popup.getByRole('button', { name: 'Ouvrir le tableau de bord' }).click(),
    ]);
    await dashboard.waitForLoadState();
    expect(dashboard.url()).toBe(`chrome-extension://${id}/dashboard.html`);
    await expect(dashboard.getByText('Configuration requise')).toBeVisible();
    await context.close();
  });

  test('favourites, read state, categories and settings persist across a browser restart', async () => {
    let context = await launch(userDataDir);
    const id = await extensionId(context);
    let page = await context.newPage();
    await page.goto(`chrome-extension://${id}/dashboard.html#settings`);
    await page.getByRole('button', { name: 'Charger la démo' }).click();
    await expect(page.getByText(/article\(s\) de démonstration chargé/)).toBeVisible();
    await page.getByLabel('Conserver les articles (jours)').fill('45');
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();

    await page.getByRole('tab', { name: 'Latest' }).click();
    const card = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: /version mineure de PHP/ }) });
    await card.getByRole('button', { name: 'Sauvegarder' }).click();
    await card.getByRole('button', { name: 'Marquer comme lu' }).click();
    await card.getByRole('button', { name: 'Modifier les catégories' }).click();
    await card.getByLabel('Design').check();
    await card.getByRole('button', { name: 'Enregistrer la correction' }).click();
    await expect(card.getByText('correction manuelle')).toBeVisible();
    await context.close();

    context = await launch(userDataDir);
    page = await context.newPage();
    await page.goto(`chrome-extension://${id}/dashboard.html#saved`);
    const saved = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: /version mineure de PHP/ }) });
    await expect(saved).toBeVisible();
    await expect(saved.getByRole('button', { name: 'Retirer des favoris' })).toBeVisible();
    await expect(saved.getByRole('button', { name: 'Marquer comme non lu' })).toBeVisible();
    await expect(saved.getByRole('list', { name: 'Catégories (correction manuelle)' })).toContainText('Design');
    await page.getByRole('tab', { name: 'Settings' }).click();
    await expect(page.getByLabel('Conserver les articles (jours)')).toHaveValue('45');
    await context.close();
  });

  test('Hacker News: real collection is idempotent (network)', async () => {
    test.skip(process.env.E2E_NETWORK !== '1', 'set E2E_NETWORK=1 to call the real HN API');
    const context = await launch(userDataDir);
    const id = await extensionId(context);
    const page = await context.newPage();
    await page.goto(`chrome-extension://${id}/dashboard.html#sources`);
    await page.getByRole('button', { name: 'Ajouter Hacker News' }).click();
    await page.getByRole('button', { name: 'Actualiser' }).click();
    await expect(page.getByText(/Hacker News — Top stories : \d+ nouveau\(x\)/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Actualiser' })).toBeEnabled({ timeout: 30_000 });
    const total = await page.evaluate(async () => {
      const req = indexedDB.open('trendradar');
      const db: IDBDatabase = await new Promise((ok, ko) => {
        req.onsuccess = () => ok(req.result);
        req.onerror = () => ko(req.error);
      });
      const n: number = await new Promise((ok) => {
        const r = db.transaction('articles').objectStore('articles').count();
        r.onsuccess = () => ok(r.result);
      });
      db.close();
      return n;
    });
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(30);

    await page.getByRole('button', { name: 'Actualiser' }).click();
    // Second run: items already stored are recognised (top list may have shifted slightly).
    await expect(page.getByText(/Hacker News — Top stories : \d+ nouveau\(x\), [1-9]\d* déjà connu/)).toBeVisible({
      timeout: 30_000,
    });
    const line = await page.getByText(/Hacker News — Top stories : \d+ nouveau/).textContent();
    const fresh = Number(/: (\d+) nouveau/.exec(line ?? '')?.[1]);
    const known = Number(/(\d+) déjà connu/.exec(line ?? '')?.[1]);
    expect(fresh).toBeLessThan(known);
    // No permission was needed or granted for HN.
    expect(await page.evaluate(() => chrome.permissions.getAll())).toMatchObject({ origins: [] });
    await context.close();
  });
});
