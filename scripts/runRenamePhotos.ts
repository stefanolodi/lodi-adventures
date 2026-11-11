import { planRenames, type CoverRow, type PhotoRow, type Rename } from './planRenames.ts';

export type RenamePhotosPorts = {
  readPhotos: () => Promise<PhotoRow[]>;
  readCovers: () => Promise<CoverRow[]>;
  newPublicId: (oldPublicId: string) => string;
  rename: (from: string, to: string) => Promise<{ publicId: string; url: string }>;
  updatePhotos: (from: string, to: string, url: string) => Promise<number>;
  updateCovers: (from: string, to: string, url: string) => Promise<number>;
  log: (line: string) => void;
};

const USAGE = 'Usage: npm run rename-photos [-- --dry-run | -- --apply]';

function parseApply(args: string[]): boolean | null {
  const unknown = args.filter((arg) => arg !== '--apply' && arg !== '--dry-run');
  if (unknown.length > 0) return null;
  if (args.includes('--apply') && args.includes('--dry-run')) return null;
  return args.includes('--apply');
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function count(plan: Rename[], rows: (rename: Rename) => string[]): number {
  return plan.reduce((total, rename) => total + rows(rename).length, 0);
}

// Returns the process exit code.
export async function runRenamePhotos(args: string[], ports: RenamePhotosPorts): Promise<number> {
  const apply = parseApply(args);
  if (apply === null) {
    ports.log(USAGE);
    return 2;
  }

  const plan = planRenames(await ports.readPhotos(), await ports.readCovers(), ports.newPublicId);
  ports.log(`Assets to rename: ${plan.length}`);
  ports.log(`photos rows: ${count(plan, (rename) => rename.photoIds)}`);
  ports.log(`albums rows with a cover: ${count(plan, (rename) => rename.albumIds)}`);

  if (!apply) {
    ports.log('Dry run. Nothing was renamed or written. Run again with -- --apply to rename.');
    return 0;
  }

  let renamed = 0;
  let failed = 0;
  let photoRows = 0;
  let coverRows = 0;
  const summary = () =>
    `Renamed ${renamed}, failed ${failed}. Updated ${photoRows} photos rows and ${coverRows} albums rows.`;

  // One asset at a time, so an interrupted run leaves every row pointing at an asset that exists.
  for (const { from, to, photoIds, albumIds } of plan) {
    let result: { publicId: string; url: string };
    try {
      result = await ports.rename(from, to);
    } catch (error) {
      failed++;
      ports.log(`Failed to rename ${from}, its rows are unchanged: ${describe(error)}`);
      continue;
    }
    renamed++;

    try {
      if (photoIds.length > 0) photoRows += await ports.updatePhotos(from, result.publicId, result.url);
      if (albumIds.length > 0) coverRows += await ports.updateCovers(from, result.publicId, result.url);
    } catch (error) {
      // The asset now lives at the new id, so the rows that still hold the old one show a broken image.
      // Stopping keeps it to one asset, and the line below says what to fix by hand.
      ports.log(`Renamed ${from} to ${result.publicId} (${result.url}), but updating its rows failed: ${describe(error)}`);
      ports.log('Stopped. Point the rows that still use the old id at the new id and url, then run again.');
      ports.log(summary());
      return 1;
    }
  }

  ports.log(summary());
  return failed > 0 ? 1 : 0;
}
