import { DEMO_SOURCE_ID, demoArticles, demoSource } from '../domain/demo-dataset';
import { articleSchema, sourceSchema } from '../domain/content.types';
import type { Clock } from '../shared/clock';
import type { DB } from './db';

/** Inserts the synthetic dataset in one transaction. Idempotent. */
export async function loadDemoData(db: DB, clock: Clock): Promise<number> {
  const source = sourceSchema.parse(demoSource(clock));
  const articles = demoArticles(clock).map((a) => articleSchema.parse(a));
  const tx = db.transaction(['sources', 'articles', 'sourceItems'], 'readwrite');
  await tx.objectStore('sources').put(source);
  for (const a of articles) {
    await tx.objectStore('articles').put(a);
    for (const p of a.provenance) {
      if (p.externalId !== undefined) {
        await tx.objectStore('sourceItems').put({ sourceId: p.sourceId, externalId: p.externalId, articleId: a.id });
      }
    }
  }
  await tx.done;
  return articles.length;
}

/** Removes the synthetic source and everything that references it. */
export async function removeDemoData(db: DB): Promise<number> {
  const tx = db.transaction(['sources', 'articles', 'sourceItems', 'userState'], 'readwrite');
  const articleIds = await tx.objectStore('articles').index('bySourceId').getAllKeys(DEMO_SOURCE_ID);
  for (const id of articleIds) {
    await tx.objectStore('articles').delete(id);
    await tx.objectStore('userState').delete(id);
    for (const key of await tx.objectStore('sourceItems').index('byArticleId').getAllKeys(id)) {
      await tx.objectStore('sourceItems').delete(key);
    }
  }
  await tx.objectStore('sources').delete(DEMO_SOURCE_ID);
  await tx.done;
  return articleIds.length;
}

export async function hasDemoData(db: DB): Promise<boolean> {
  return (await db.getKey('sources', DEMO_SOURCE_ID)) !== undefined;
}
