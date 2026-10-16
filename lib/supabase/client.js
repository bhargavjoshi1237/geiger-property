import { createBrowserClient } from '@supabase/ssr';
import { trackSupabaseFetch } from './activity';
import { isSandbox } from '@/lib/sandbox/sandbox_mode';
import { createSandboxClient } from '@/lib/sandbox/sandbox_client';

function createRealClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      // This app owns the `property` Postgres schema; default all PostgREST
      // table/RPC calls to it (auth + storage are unaffected by db.schema).
      // Suite-shared reads override to `public` (e.g. .schema("public")).
      db: {
        schema: 'property',
      },
      global: {
        fetch: trackSupabaseFetch,
      },
    }
  );
}

const hasEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export function createClient() {
  // Landing playground: in-memory tables + storage; auth stays on the real client.
  if (isSandbox()) return createSandboxClient(() => (hasEnv() ? createRealClient() : null));
  return createRealClient();
}
