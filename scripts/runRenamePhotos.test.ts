import { runRenamePhotos, type RenamePhotosPorts } from './runRenamePhotos.ts';

function fakePorts() {
  const lines: string[] = [];
  const ports = {
    readPhotos: vi.fn(() =>
      Promise.resolve([
        { id: 'p1', public_id: 'lodi/beach' },
        { id: 'p2', public_id: 'lodi/forest' },
        { id: 'p3', public_id: 'lodi/beach' },
      ])
    ),
    readCovers: vi.fn(() => Promise.resolve([{ id: 'a1', cover_public_id: 'lodi/beach' }])),
    newPublicId: vi.fn((old: string) => `${old}-new`),
    rename: vi.fn((_from: string, to: string) => Promise.resolve({ publicId: to, url: `https://cdn/${to}.jpg` })),
    updatePhotos: vi.fn((from: string) => Promise.resolve(from === 'lodi/beach' ? 2 : 1)),
    updateCovers: vi.fn(() => Promise.resolve(1)),
    log: (line: string) => {
      lines.push(line);
    },
  } satisfies RenamePhotosPorts;
  return { ports, lines };
}

describe('runRenamePhotos', () => {
  it.each([[[]], [['--dry-run']]])('renames and writes nothing with args %j', async (args) => {
    const { ports, lines } = fakePorts();

    expect(await runRenamePhotos(args, ports)).toBe(0);

    expect(ports.rename).not.toHaveBeenCalled();
    expect(ports.updatePhotos).not.toHaveBeenCalled();
    expect(ports.updateCovers).not.toHaveBeenCalled();
    expect(lines).toContain('Assets to rename: 2');
    expect(lines).toContain('photos rows: 3');
    expect(lines).toContain('albums rows with a cover: 1');
  });

  it('rejects unknown args without reading anything', async () => {
    const { ports } = fakePorts();

    expect(await runRenamePhotos(['--aply'], ports)).toBe(2);
    expect(await runRenamePhotos(['--apply', '--dry-run'], ports)).toBe(2);
    expect(ports.readPhotos).not.toHaveBeenCalled();
  });

  it('with --apply, renames each asset and points its rows at the new id and url', async () => {
    const { ports, lines } = fakePorts();

    expect(await runRenamePhotos(['--apply'], ports)).toBe(0);

    expect(ports.rename.mock.calls).toEqual([
      ['lodi/beach', 'lodi/beach-new'],
      ['lodi/forest', 'lodi/forest-new'],
    ]);
    expect(ports.updatePhotos.mock.calls).toEqual([
      ['lodi/beach', 'lodi/beach-new', 'https://cdn/lodi/beach-new.jpg'],
      ['lodi/forest', 'lodi/forest-new', 'https://cdn/lodi/forest-new.jpg'],
    ]);
    expect(ports.updateCovers.mock.calls).toEqual([
      ['lodi/beach', 'lodi/beach-new', 'https://cdn/lodi/beach-new.jpg'],
    ]);
    expect(lines.at(-1)).toBe('Renamed 2, failed 0. Updated 3 photos rows and 1 albums rows.');
  });

  it('leaves the rows of a failed rename untouched, counts it, and carries on', async () => {
    const { ports, lines } = fakePorts();
    ports.rename.mockImplementation((from, to) =>
      from === 'lodi/beach'
        ? Promise.reject(new Error('Resource not found'))
        : Promise.resolve({ publicId: to, url: `https://cdn/${to}.jpg` })
    );

    expect(await runRenamePhotos(['--apply'], ports)).toBe(1);

    expect(ports.updatePhotos.mock.calls).toEqual([
      ['lodi/forest', 'lodi/forest-new', 'https://cdn/lodi/forest-new.jpg'],
    ]);
    expect(ports.updateCovers).not.toHaveBeenCalled();
    expect(lines.at(-1)).toBe('Renamed 1, failed 1. Updated 1 photos rows and 0 albums rows.');
  });

  it('stops after a renamed asset whose rows fail to update', async () => {
    const { ports, lines } = fakePorts();
    ports.updatePhotos.mockImplementation(() => Promise.reject(new Error('connection reset')));

    expect(await runRenamePhotos(['--apply'], ports)).toBe(1);

    expect(ports.rename).toHaveBeenCalledTimes(1);
    expect(lines.some((line) => line.includes('lodi/beach-new') && line.includes('connection reset'))).toBe(true);
    expect(lines.at(-1)).toBe('Renamed 1, failed 0. Updated 0 photos rows and 0 albums rows.');
  });
});
