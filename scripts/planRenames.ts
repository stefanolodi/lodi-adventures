export type PhotoRow = { id: string; public_id: string };
export type CoverRow = { id: string; cover_public_id: string };

export type Rename = {
  from: string;
  to: string;
  photoIds: string[];
  albumIds: string[];
};

export function planRenames(
  photos: PhotoRow[],
  covers: CoverRow[],
  makeId: (oldPublicId: string) => string
): Rename[] {
  const byPublicId = new Map<string, Rename>();
  const renameFor = (publicId: string): Rename => {
    let rename = byPublicId.get(publicId);
    if (!rename) {
      rename = { from: publicId, to: makeId(publicId), photoIds: [], albumIds: [] };
      byPublicId.set(publicId, rename);
    }
    return rename;
  };

  for (const photo of photos) {
    if (photo.public_id !== '') renameFor(photo.public_id).photoIds.push(photo.id);
  }
  for (const album of covers) {
    if (album.cover_public_id !== '') renameFor(album.cover_public_id).albumIds.push(album.id);
  }
  return [...byPublicId.values()];
}
