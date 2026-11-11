type Row = Record<string, unknown>;
type Result = { data: unknown; error: { message: string } | null };

export type FakeDatabase = Record<string, Row[]>;

type SortKey = { column: string; ascending: boolean };

function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const left = String(a);
  const right = String(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

// Answers the query chains the hooks build, against rows the test owns. It ignores
// row-level security, so it returns private rows to guests the way a broken policy would.
type Mode = 'many' | 'single' | 'maybeSingle';

class FakeQuery implements PromiseLike<Result> {
  constructor(
    private readonly rows: Row[],
    private readonly failure: string | null = null,
    private readonly mode: Mode = 'many',
    private readonly sortKeys: SortKey[] = []
  ) {}

  private with(rows: Row[], mode = this.mode, sortKeys = this.sortKeys) {
    return new FakeQuery(rows, this.failure, mode, sortKeys);
  }

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    return this.with(this.rows.filter((row) => row[column] === value));
  }

  // Like Postgres, each later order call only breaks the ties the earlier ones left.
  order(column: string, { ascending = true }: { ascending?: boolean } = {}) {
    const sortKeys = [...this.sortKeys, { column, ascending }];
    const sorted = [...this.rows].sort((a, b) => {
      for (const key of sortKeys) {
        const delta = compare(a[key.column], b[key.column]);
        if (delta !== 0) return key.ascending ? delta : -delta;
      }
      return 0;
    });
    return this.with(sorted, this.mode, sortKeys);
  }

  limit(count: number) {
    return this.with(this.rows.slice(0, count));
  }

  single() {
    return this.with(this.rows, 'single');
  }

  maybeSingle() {
    return this.with(this.rows, 'maybeSingle');
  }

  private result(): Result {
    if (this.failure) return { data: null, error: { message: this.failure } };
    const first = this.rows[0] ?? null;
    if (this.mode === 'single') return { data: first, error: first ? null : { message: 'No rows' } };
    if (this.mode === 'maybeSingle') return { data: first, error: null };
    return { data: this.rows, error: null };
  }

  then<A = Result, B = never>(
    onFulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null
  ): PromiseLike<A | B> {
    return Promise.resolve(this.result()).then(onFulfilled, onRejected);
  }
}

export type FakeSession = { access_token: string; user: { id: string; is_anonymous: boolean } };

type AuthCall = 'getSession' | 'signInAnonymously' | 'signOut' | 'claim_guest' | 'is_guest';

// Stands in for Supabase Auth and the guest tables in the private schema. A call named in failing
// answers with an error, or rejects for getSession. A call named in stalled never answers. A call
// named in held reads its answer at once and delivers it when the promise resolves, like a slow
// response. calls logs each auth call and guest RPC, with the scope after a colon for signOut.
export type FakeAuth = {
  session: FakeSession | null;
  guestPassword: string;
  guests: Set<string>;
  wrongAttempts: Map<string, number>;
  failing: Set<AuthCall>;
  stalled: Set<AuthCall>;
  held: Map<AuthCall, Promise<void>>;
  calls: string[];
};

export function fakeAuth(overrides: Partial<FakeAuth> = {}): FakeAuth {
  return {
    session: { access_token: 'owner-token', user: { id: 'owner', is_anonymous: false } },
    guestPassword: 'letmein',
    guests: new Set(),
    wrongAttempts: new Map(),
    failing: new Set(),
    stalled: new Set(),
    held: new Map(),
    calls: [],
    ...overrides,
  };
}

type AuthListener = (event: 'SIGNED_IN' | 'SIGNED_OUT', session: FakeSession | null) => void;

// A table named in failingReads answers every select with an error, the way a dropped
// connection or a denying policy would.
export function fakeSupabase(db: FakeDatabase, failingReads: Set<string> = new Set(), auth: FakeAuth = fakeAuth()) {
  const listeners = new Set<AuthListener>();

  // Records the call, then holds it forever when the test stalls it.
  function answer<T>(call: AuthCall, label: string, result: () => T): Promise<T> {
    auth.calls.push(label);
    if (auth.stalled.has(call)) return new Promise<T>(() => {});
    const release = auth.held.get(call);
    if (release) {
      const early = Promise.resolve().then(result);
      return release.then(() => early);
    }
    return Promise.resolve().then(result);
  }

  function setSession(event: 'SIGNED_IN' | 'SIGNED_OUT', session: FakeSession | null) {
    auth.session = session;
    listeners.forEach((listener) => listener(event, session));
  }

  const failure = (call: AuthCall) => ({ message: `${call} failed` });

  return {
    from: (table: string) => {
      const rows = (db[table] ??= []);
      return {
        select: () => new FakeQuery(rows, failingReads.has(table) ? `Could not read ${table}` : null),
        insert: (row: Row) => {
          const saved = { id: `new-${rows.length}`, ...row };
          rows.push(saved);
          return new FakeQuery([saved]);
        },
        update: (patch: Row) => ({
          eq: (column: string, value: unknown) => {
            const matched = rows.filter((row) => row[column] === value);
            matched.forEach((row) => Object.assign(row, patch));
            return new FakeQuery(matched);
          },
        }),
      };
    },
    // Mirrors the SQL functions in supabase/migrations/.
    rpc: (name: string, args: Row = {}): PromiseLike<Result> => {
      if (name === 'set_featured_album') {
        const albumId = args.album_id ?? null;
        for (const row of db.albums ?? []) row.is_featured = albumId !== null && row.id === albumId;
        return Promise.resolve({ data: null, error: null });
      }
      if (name === 'delete_album') return Promise.resolve(deleteAlbum(db, args.album_id));
      if (name === 'is_guest') {
        return answer('is_guest', 'is_guest', () =>
          auth.failing.has('is_guest')
            ? { data: null, error: failure('is_guest') }
            : { data: !!auth.session && auth.guests.has(auth.session.user.id), error: null }
        );
      }
      if (name === 'claim_guest') {
        return answer('claim_guest', 'claim_guest', () =>
          auth.failing.has('claim_guest')
            ? { data: null, error: failure('claim_guest') }
            : claimGuest(auth, args.password)
        );
      }
      return Promise.resolve({ data: null, error: { message: `No function ${name}` } });
    },
    auth: {
      getSession: () =>
        answer('getSession', 'getSession', () => {
          if (auth.failing.has('getSession')) throw new Error('storage unavailable');
          return { data: { session: auth.session }, error: null };
        }),
      onAuthStateChange: (listener: AuthListener) => {
        listeners.add(listener);
        return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
      },
      signInAnonymously: () =>
        answer('signInAnonymously', 'signInAnonymously', () => {
          if (auth.failing.has('signInAnonymously')) {
            return { data: { session: null, user: null }, error: failure('signInAnonymously') };
          }
          // Numbered from the log, so the ids restart whenever a test resets auth.
          const n = auth.calls.filter((call) => call === 'signInAnonymously').length;
          const session = { access_token: `anon-token-${n}`, user: { id: `anon-${n}`, is_anonymous: true } };
          setSession('SIGNED_IN', session);
          return { data: { session, user: session.user }, error: null };
        }),
      signOut: ({ scope = 'global' }: { scope?: 'global' | 'local' | 'others' } = {}) =>
        answer('signOut', `signOut:${scope}`, () => {
          if (auth.failing.has('signOut')) return { error: failure('signOut') };
          setSession('SIGNED_OUT', null);
          return { error: null };
        }),
    },
  };
}

// Mirrors claim_guest in supabase/migrations/20261111082945_guest_access.sql.
function claimGuest(auth: FakeAuth, password: unknown): Result {
  const userId = auth.session?.user.id;
  if (!userId) return { data: null, error: { message: 'claim_guest needs a signed-in user' } };
  if (auth.guests.has(userId)) return { data: 'guest', error: null };
  const wrong = auth.wrongAttempts.get(userId) ?? 0;
  if (wrong >= 5) return { data: 'locked', error: null };
  if (password === auth.guestPassword) {
    auth.guests.add(userId);
    return { data: 'guest', error: null };
  }
  auth.wrongAttempts.set(userId, wrong + 1);
  return { data: 'wrong', error: null };
}

function deleteAlbum(db: FakeDatabase, albumId: unknown): Result {
  const album = (db.albums ?? []).find((row) => row.id === albumId);
  if (!album) return { data: null, error: { message: `Album ${String(albumId)} was not deleted` } };
  const photos = (db.photos ?? []).filter((row) => row.album_id === albumId);
  db.photos = (db.photos ?? []).filter((row) => row.album_id !== albumId);
  db.albums = (db.albums ?? []).filter((row) => row !== album);
  const publicIds = [...photos.map((row) => row.public_id), album.cover_public_id].filter((id) => typeof id === 'string' && id !== '');
  return { data: publicIds, error: null };
}
