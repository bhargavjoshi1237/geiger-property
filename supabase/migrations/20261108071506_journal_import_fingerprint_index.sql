-- Journal import fingerprint index (CORE-46): replaces the partial ledger_entries_import_fp_idx from 20261108065221_journal_imports.
-- The re-import lookup filters on metadata->>'importFingerprint' = any(...), which never proves the partial predicate (metadata ? ...),
--   so the planner couldn't use it; a plain expression index serves the lookup.

-- @up
set local lock_timeout = '10s';
drop index if exists property.ledger_entries_import_fp_idx;
create index if not exists ledger_entries_import_fingerprint_idx
  on property.ledger_entries (project_id, (metadata->>'importFingerprint'));

-- @down
set local lock_timeout = '10s';
drop index if exists property.ledger_entries_import_fingerprint_idx;
create index if not exists ledger_entries_import_fp_idx
  on property.ledger_entries (project_id, (metadata->>'importFingerprint'))
  where metadata ? 'importFingerprint';
