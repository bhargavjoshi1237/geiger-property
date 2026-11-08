-- Ledger tables take writes only through the definer RPCs or a trusted session (PLAT-01c review).
-- Revokes insert, delete and truncate on property.ledger_entries / ledger_lines from anon and authenticated, and update from anon.
-- ledger_post / ledger_void run as the owner and the service role keeps its grants; signed-in users keep select and the
--   reconciliation update (setLinesCleared), which ledger_lines_guard limits to cleared, cleared_on, reconciliation_id and metadata.

-- @up
do $$
begin
  if to_regclass('property.ledger_entries') is not null then
    revoke insert, delete, truncate on property.ledger_entries from anon, authenticated;
    revoke update on property.ledger_entries from anon;
  end if;
  if to_regclass('property.ledger_lines') is not null then
    revoke insert, delete, truncate on property.ledger_lines from anon, authenticated;
    revoke update on property.ledger_lines from anon;
  end if;
end $$;

-- @down
do $$
begin
  if to_regclass('property.ledger_entries') is not null then
    grant insert, delete, truncate on property.ledger_entries to anon, authenticated;
    grant update on property.ledger_entries to anon;
  end if;
  if to_regclass('property.ledger_lines') is not null then
    grant insert, delete, truncate on property.ledger_lines to anon, authenticated;
    grant update on property.ledger_lines to anon;
  end if;
end $$;
