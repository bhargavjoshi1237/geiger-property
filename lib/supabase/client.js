import { createBrowserClient } from '@supabase/ssr';
import { trackSupabaseFetch } from './activity';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      // This app owns the `events` Postgres schema; default all PostgREST
      // table/RPC calls to it (auth + storage are unaffected by db.schema).
      db: {
        schema: 'events',
      },
      global: {
        fetch: trackSupabaseFetch,
      },
    }
  );
}
