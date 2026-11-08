-- Pin function search_path (PLAT-01h)
--
-- The Security Advisor's "function search_path mutable" finding: property functions created without a pinned
-- search_path get `search_path = ''`. ALTER FUNCTION changes only the setting, so each body and grant stays exactly as
-- pg_get_functiondef shows it (every reference in them is already schema-qualified). touch_updated_at, the fourth, is
-- pinned by its redefinition in 20261108063346_integration_secrets. A later `create or replace` of any of them must
-- repeat `set search_path = ''` (lib/function_lockdown.test.js checks it).

-- @up
alter function property.chat_bump_activity() set search_path = '';
alter function property.audit_log_reject_change() set search_path = '';
alter function property.enable_audit(text) set search_path = '';

-- @down
alter function property.chat_bump_activity() reset search_path;
alter function property.audit_log_reject_change() reset search_path;
alter function property.enable_audit(text) reset search_path;
