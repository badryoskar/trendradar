import { chromium, type BrowserContext } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');

export async function launch(
  userDataDir: string,
  opts: { colorScheme?: 'light' | 'dark'; viewport?: { width: number; height: number } } = {},
): Promise<BrowserContext> {
  return chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    colorScheme: opts.colorScheme ?? 'light',
    viewport: opts.viewport ?? { width: 1100, height: 900 },
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
}

/** The extension has no service worker, so read its id from chrome://extensions. */
export async function extensionId(context: BrowserContext): Promise<string> {
  const page = await context.newPage();
  await page.goto('chrome://extensions');
  const id = await page.evaluate(async () => {
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
