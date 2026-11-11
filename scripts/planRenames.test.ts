import { newPublicId } from './newPublicId.ts';
import { planRenames } from './planRenames.ts';

const photos = [
  { id: 'p1', public_id: 'lodi/beach' },
  { id: 'p2', public_id: 'lodi/forest' },
  { id: 'p3', public_id: 'lodi/beach' },
  { id: 'p4', public_id: '' },
];
const covers = [
  { id: 'a1', cover_public_id: 'lodi/beach' },
  { id: 'a2', cover_public_id: 'covers/sunset' },
];

describe('planRenames', () => {
  it('gives each distinct public id one new id, shared by every row that used it', () => {
    let n = 0;
    const plan = planRenames(photos, covers, (old) => `${old}-new${++n}`);

    expect(plan).toEqual([
      { from: 'lodi/beach', to: 'lodi/beach-new1', photoIds: ['p1', 'p3'], albumIds: ['a1'] },
      { from: 'lodi/forest', to: 'lodi/forest-new2', photoIds: ['p2'], albumIds: [] },
      { from: 'covers/sunset', to: 'covers/sunset-new3', photoIds: [], albumIds: ['a2'] },
    ]);
  });

  it('keeps each new id in the old folder with a name of 20 lowercase letters and digits', () => {
    const plan = planRenames(photos, [...covers, { id: 'a3', cover_public_id: 'root-level' }], newPublicId);

    for (const { from, to } of plan) {
      const folder = from.slice(0, from.lastIndexOf('/') + 1);
      expect(to.startsWith(folder)).toBe(true);
      expect(to.slice(folder.length)).toMatch(/^[a-z0-9]{20}$/);
    }
  });

  it('makes different ids on two runs', () => {
    const first = planRenames(photos, covers, newPublicId).map((rename) => rename.to);
    const second = planRenames(photos, covers, newPublicId).map((rename) => rename.to);

    expect(new Set([...first, ...second]).size).toBe(first.length + second.length);
  });
});
