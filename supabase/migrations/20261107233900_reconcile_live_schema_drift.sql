-- Reconcile migrations with the live database (DRIFT-01)
--
-- The live property schema carries columns and indexes the code and demo seeds use
-- that no earlier migration creates, so a database built from migrations alone
-- would not match production. This migration adds them with the live types,
-- nullability and defaults. Every step is guarded, so on the live DB it is a no-op.
--
-- Only objects the current code uses are reconciled; orphan tables left by a deleted
-- branch, and unused live-only columns, are deliberately not recreated.
-- Objects actually created here are tagged with a 'DRIFT-01' comment so @down removes
-- only those (on the live DB it removes nothing).

-- @up
do $$
declare
  col_specs text[] := array[
    'esign_requests|provider|text not null default ''internal''',
    'esign_requests|provider_envelope_id|text',
    'esign_requests|sent_at|timestamptz',
    'esign_requests|signed_at|timestamptz',
    'announcements|publish_on|date',
    'announcements|expires_on|date',
    'announcements|priority|text not null default ''Normal''',
    'applications|applicant_name|text',
    'applications|property_label|text',
    'applications|property_id|uuid',
    'applications|listing_id|uuid',
    'applications|source|text',
    'applications|occupants|integer not null default 1',
    'applications|requested_lease_start|date',
    'applications|decision|text not null default ''Pending''',
    'applications|score|integer not null default 0',
    'applications|applied_on|date',
    'automations|trigger_rule|text',
    'automations|action_rule|text',
    'automations|audience|text',
    'automations|run_count|integer not null default 0',
    'automations|last_run_on|date',
    'bank_accounts|bank|text',
    'bank_accounts|apy|numeric not null default 0',
    'bank_accounts|is_operating|boolean not null default false',
    'bank_accounts|property_label|text',
    'bills|property_label|text',
    'bills|category|text',
    'bills|paid_on|date',
    'bills|method|text',
    'bills|reference|text',
    'budgets|period|text not null default ''2026''',
    'budgets|budgeted_amount|numeric not null default 0',
    'listings|headline|text',
    'listings|property_label|text',
    'listings|deposit|numeric not null default 0',
    'listings|sqft|integer not null default 0',
    'listings|available_on|date',
    'listings|syndicated|boolean not null default false',
    'listings|virtual_tour_url|text',
    'listings|description|text',
    'listings|contact_name|text',
    'listings|contact_email|text',
    'listings|contact_phone|text',
    'message_templates|audience|text',
    'owners|portfolio_label|text',
    'owners|properties_count|integer not null default 0',
    'owners|portal_access|boolean not null default true',
    'owners|since|date',
    'recurring_charges|description|text',
    'recurring_charges|property_id|uuid',
    'recurring_charges|category|text',
    'renewals|offered_rent|numeric not null default 0',
    'renewals|term_months|integer not null default 12',
    'renewals|offer_sent_on|date',
    'renewals|response_due|date',
    'rent_comps|address|text',
    'rent_comps|comp_date|date',
    'showings|listing_name|text',
    'showings|scheduled_for|date',
    'showings|feedback|text',
    'showings|listing_id|uuid',
    'showings|prospect_contact|text',
    'showings|scheduled_time|text',
    'showings|duration_minutes|integer not null default 30',
    'team_members|phone|text',
    'team_members|role_label|text',
    'team_members|title|text',
    'team_members|invited_on|date',
    'transactions|tenant_id|uuid',
    'transactions|lease_id|uuid',
    'waitlist_entries|prospect_name|text',
    'waitlist_entries|contact|text',
    'waitlist_entries|desired_unit|text',
    'waitlist_entries|desired_bedrooms|integer not null default 0',
    'waitlist_entries|budget|numeric not null default 0',
    'waitlist_entries|joined_on|date'
  ];
  idx_specs text[] := array[
    'property_announcements_publish_idx|announcements|publish_on|where deleted_at is null',
    'property_announcements_status_idx|announcements|status|where deleted_at is null',
    'property_applications_decision_idx|applications|decision|where deleted_at is null',
    'property_applications_listing_idx|applications|listing_id|where deleted_at is null',
    'property_applications_property_idx|applications|property_id|where deleted_at is null',
    'property_applications_status_idx|applications|status|where deleted_at is null',
    'property_automations_enabled_idx|automations|enabled|where deleted_at is null',
    'property_automations_status_idx|automations|status|where deleted_at is null',
    'property_bank_accounts_account_type_idx|bank_accounts|account_type|where deleted_at is null',
    'property_bank_accounts_status_idx|bank_accounts|status|where deleted_at is null',
    'property_bills_due_idx|bills|due_date|where deleted_at is null',
    'property_bills_status_idx|bills|status|where deleted_at is null',
    'property_bills_vendor_idx|bills|vendor_name|where deleted_at is null',
    'property_budgets_period_idx|budgets|period|where deleted_at is null',
    'property_budgets_status_idx|budgets|status|where deleted_at is null',
    'property_esign_requests_lease_idx|esign_requests|lease_id|where deleted_at is null',
    'property_esign_requests_status_idx|esign_requests|status|where deleted_at is null',
    'property_inspections_lease_idx|inspections|lease_id|where deleted_at is null',
    'property_inspections_move_idx|inspections|move_id|where deleted_at is null',
    'property_inspections_unit_idx|inspections|unit_id|where deleted_at is null',
    'property_lease_addenda_lease_idx|lease_addenda|lease_id|where deleted_at is null',
    'property_leases_property_idx|leases|property_id|where deleted_at is null',
    'property_leases_tenant_idx|leases|tenant_id|where deleted_at is null',
    'property_leases_term_end_idx|leases|term_end|where deleted_at is null',
    'property_leases_unit_idx|leases|unit_id|where deleted_at is null',
    'property_listings_property_idx|listings|property_id|where deleted_at is null',
    'property_listings_status_idx|listings|status|where deleted_at is null',
    'property_listings_unit_idx|listings|unit_id|where deleted_at is null',
    'property_message_templates_channel_idx|message_templates|channel|where deleted_at is null',
    'property_message_templates_status_idx|message_templates|status|where deleted_at is null',
    'property_moves_lease_idx|moves|lease_id|where deleted_at is null',
    'property_moves_unit_idx|moves|unit_id|where deleted_at is null',
    'property_owners_status_idx|owners|status|where deleted_at is null',
    'property_recurring_charges_next_idx|recurring_charges|next_date|where deleted_at is null',
    'property_recurring_charges_status_idx|recurring_charges|status|where deleted_at is null',
    'property_recurring_charges_tenant_idx|recurring_charges|tenant_id|where deleted_at is null',
    'property_renewals_lease_idx|renewals|lease_id|where deleted_at is null',
    'property_renewals_response_idx|renewals|response_due|where deleted_at is null',
    'property_renewals_status_idx|renewals|status|where deleted_at is null',
    'property_rent_comps_status_idx|rent_comps|status|where deleted_at is null',
    'property_security_deposits_lease_idx|security_deposits|lease_id|where deleted_at is null',
    'property_security_deposits_unit_idx|security_deposits|unit_id|where deleted_at is null',
    'property_showings_listing_idx|showings|listing_id|where deleted_at is null',
    'property_showings_scheduled_idx|showings|scheduled_for|where deleted_at is null',
    'property_showings_status_idx|showings|status|where deleted_at is null',
    'property_team_members_status_idx|team_members|status|where deleted_at is null',
    'property_transactions_status_idx|transactions|status|where deleted_at is null',
    'property_transactions_tenant_idx|transactions|tenant_id|where deleted_at is null',
    'property_unit_turns_move_out_idx|unit_turns|move_out_date|where deleted_at is null',
    'property_unit_turns_status_idx|unit_turns|status|where deleted_at is null',
    'property_waitlist_entries_status_idx|waitlist_entries|status|where deleted_at is null'
  ];
  s text;
  p text[];
begin
  foreach s in array col_specs loop
    p := string_to_array(s, '|');
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'property' and table_name = p[1] and column_name = p[2]
    ) then
      execute format('alter table property.%I add column if not exists %I %s', p[1], p[2], p[3]);
      execute format('comment on column property.%I.%I is %L', p[1], p[2], 'DRIFT-01');
    end if;
  end loop;

  foreach s in array idx_specs loop
    p := string_to_array(s, '|');
    if to_regclass(format('property.%I', p[1])) is null then
      execute format('create index if not exists %I on property.%I (%s) %s', p[1], p[2], p[3], p[4]);
      execute format('comment on index property.%I is %L', p[1], 'DRIFT-01');
    end if;
  end loop;
end
$$;

-- @down
-- Drops only objects tagged 'DRIFT-01' by @up (created on a fresh DB); a no-op on the live DB.
do $$
declare
  r record;
begin
  for r in
    select c.relname as idx from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'property' and c.relkind = 'i'
      and obj_description(c.oid, 'pg_class') = 'DRIFT-01'
  loop
    execute format('drop index if exists property.%I', r.idx);
  end loop;

  for r in
    select c.relname as tbl, a.attname as col
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'property' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
      and col_description(c.oid, a.attnum) = 'DRIFT-01'
  loop
    execute format('alter table property.%I drop column if exists %I', r.tbl, r.col);
  end loop;
end
$$;
