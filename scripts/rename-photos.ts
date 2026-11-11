// Renames every photo and cover in Cloudinary, so URLs handed out before the gate change return 404. See ADR 0005.
// Run with `npm run rename-photos` for a dry run, and `npm run rename-photos -- --apply` to rename.
import { createClient } from '@supabase/supabase-js';
import { v2 as cloudinary } from 'cloudinary';
import type { Database } from '../src/lib/database.types.ts';
import { parseCloudinaryUpload } from '../src/lib/parseCloudinaryUpload.ts';
import { newPublicId } from './newPublicId.ts';
import { runRenamePhotos } from './runRenamePhotos.ts';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set in .env.local. See .env.example.`);
  return value;
}

cloudinary.config({
  cloud_name: requireEnv('CLOUDINARY_CLOUD_NAME'),
  api_key: requireEnv('CLOUDINARY_API_KEY'),
  api_secret: requireEnv('CLOUDINARY_API_SECRET'),
});

// The service-role key bypasses row-level security, so the script sees private albums too.
const supabase = createClient<Database>(requireEnv('VITE_SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

// The Cloudinary SDK rejects with `{ error: { message } }`, not an Error.
function cloudinaryMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  const message = (error as { error?: { message?: unknown } } | null)?.error?.message;
  return typeof message === 'string' ? message : JSON.stringify(error);
}

// PostgREST returns at most 1000 rows per request.
const PAGE_SIZE = 1000;

async function readAll<Row>(
  readPage: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: Error | null }>
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await readPage(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

const exitCode = await runRenamePhotos(process.argv.slice(2), {
  readPhotos: () =>
    readAll((from, to) => supabase.from('photos').select('id, public_id').order('id').range(from, to)),
  readCovers: () =>
    readAll((from, to) =>
      supabase.from('albums').select('id, cover_public_id').neq('cover_public_id', '').order('id').range(from, to)
    ),
  newPublicId,
  async rename(from, to) {
    let response: unknown;
    try {
      response = await cloudinary.uploader.rename(from, to, { resource_type: 'image', type: 'upload', invalidate: true });
    } catch (error) {
      throw new Error(cloudinaryMessage(error), { cause: error });
    }
    const { publicId, url } = parseCloudinaryUpload(response);
    return { publicId, url };
  },
  async updatePhotos(from, to, url) {
    const { data, error } = await supabase.from('photos').update({ public_id: to, url }).eq('public_id', from).select('id');
    if (error) throw error;
    return data.length;
  },
  async updateCovers(from, to, url) {
    const { data, error } = await supabase
      .from('albums')
      .update({ cover_public_id: to, cover_url: url })
      .eq('cover_public_id', from)
      .select('id');
    if (error) throw error;
    return data.length;
  },
  log: (line) => console.log(line),
});

process.exit(exitCode);
