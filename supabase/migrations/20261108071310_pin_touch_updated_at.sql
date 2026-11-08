-- Pin touch_updated_at again (PLAT-01h)
--
-- In-flight branches (CORE-46 journal_imports, CORE-13 jurisdiction_rules) redefine property.touch_updated_at from the
-- table template without a search_path, which un-pins it on the shared database (the Security Advisor's mutable
-- search_path). ALTER FUNCTION sets only the setting; the body and grants stay as they are. Sorting after both, it also
-- keeps a database built in version order pinned. New table migrations define it with `set search_path = ''`.

-- @up
alter function property.touch_updated_at() set search_path = '';

-- @down
alter function property.touch_updated_at() reset search_path;
