import { describe, expect, it } from 'vitest';
import {
  addCustomCategory,
  deleteCustomCategory,
  getUserState,
  listCategories,
  putArticle,
  putSource,
  setCategoryOverride,
  setSaved,
  updateCategory,
} from '../../src/persistence/repositories';
import { fixedClock } from '../../src/shared/clock';
import { freshDb, makeArticle, makeSource } from '../helpers';

describe('custom categories', () => {
  it('adds a custom category before "Unclassified", with a unique id', async () => {
    const db = await freshDb();
    const c = await addCustomCategory(db, { label: 'Rust & Go', keywords: ['rust', 'golang'] });
    expect(c).toMatchObject({ id: 'custom-rust-go', isCustom: true, hidden: false });
    const { items } = await listCategories(db);
    expect(items.at(-1)?.id).toBe('unclassified');
    expect(items.at(-2)?.id).toBe('custom-rust-go');
    await expect(addCustomCategory(db, { label: 'rust & go', keywords: [] })).rejects.toThrow(/existe déjà/);
    const c2 = await addCustomCategory(db, { label: 'Rust - Go', keywords: [] });
    expect(c2.id).toBe('custom-rust-go-2');
  });

  it('renames, edits keywords and hides any category; ids are immutable', async () => {
    const db = await freshDb();
    const next = await updateCategory(db, 'design', (c) => ({ ...c, label: 'UX/UI', hidden: true, keywords: ['ux'] }));
    expect(next).toMatchObject({ id: 'design', label: 'UX/UI', hidden: true, keywords: ['ux'] });
    await expect(updateCategory(db, 'design', (c) => ({ ...c, id: 'other' }))).rejects.toThrow(/immutable/);
  });

  it('deleting a custom category removes it from overrides, sources and articles atomically', async () => {
    const db = await freshDb();
    const c = await addCustomCategory(db, { label: 'Perso', keywords: [] });
    await putSource(db, makeSource({ categoryIds: [c.id, 'technology'] }));
    await putArticle(db, makeArticle({ autoCategories: [c.id] }));
    await setCategoryOverride(db, 'art-1', [c.id, 'ai']);
    await deleteCustomCategory(db, c.id);
    expect((await getUserState(db, 'art-1')).categoryOverride).toEqual(['ai']);
    expect((await db.get('sources', 'src-a'))?.categoryIds).toEqual(['technology']);
    expect((await db.get('articles', 'art-1'))?.autoCategories).toEqual([]);
    expect((await listCategories(db)).items.some((x) => x.id === c.id)).toBe(false);
  });

  it('built-in categories cannot be deleted', async () => {
    const db = await freshDb();
    await expect(deleteCustomCategory(db, 'ai')).rejects.toThrow(/personnalisées/);
    expect((await listCategories(db)).items.some((x) => x.id === 'ai')).toBe(true);
  });
});

describe('manual category override', () => {
  it('sets and clears an override without touching saved/read state', async () => {
    const db = await freshDb();
    await putArticle(db, makeArticle());
    await setSaved(db, 'art-1', true, fixedClock('2026-11-12T12:00:00.000Z'));
    await setCategoryOverride(db, 'art-1', ['design', 'design']);
    expect(await getUserState(db, 'art-1')).toMatchObject({ isSaved: true, categoryOverride: ['design'] });
    await setCategoryOverride(db, 'art-1', undefined);
    const s = await getUserState(db, 'art-1');
    expect(s.categoryOverride).toBeUndefined();
    expect(s.isSaved).toBe(true);
  });
});
