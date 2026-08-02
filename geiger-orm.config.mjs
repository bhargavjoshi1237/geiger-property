// Migration config for @geiger/orm. This product's tables live in the dedicated
// "property" Postgres schema of the suite-shared Supabase project, and so does
// its migration ledger (property.geiger_migrations).
export default {
  schema: "property",
  url: process.env.STRING_URI,
};
