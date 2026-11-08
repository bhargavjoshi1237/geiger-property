-- Recurring charges: legacy Monthly anchors keep their own day (CORE-03 follow-up)
--
-- 20261108034359 gave every existing charge bill_with_rent = true, which snaps a Monthly charge to the
-- rent due date. A charge created before that migration whose next date isn't the 1st was anchored on
-- its own day by the old job, so it keeps that day: bill_with_rent = false, marked legacyAnchored for
-- @down. "Before" is the time 20261108034359 was applied, read from the migration ledger, so charges
-- made with the new screens keep their choice. No live row matches (every live Monthly charge is on the 1st).

-- @up
update property.recurring_charges rc
set bill_with_rent = false, metadata = rc.metadata || '{"legacyAnchored": true}'::jsonb
where rc.bill_with_rent
  and rc.frequency = 'Monthly'
  and rc.next_date is not null
  and extract(day from rc.next_date) <> 1
  and rc.created_at < coalesce(
    (select m.applied_at from property.geiger_migrations m where m.version = '20261108034359'),
    now()
  );

-- @down
update property.recurring_charges
set bill_with_rent = true, metadata = metadata - 'legacyAnchored'
where metadata ? 'legacyAnchored';
