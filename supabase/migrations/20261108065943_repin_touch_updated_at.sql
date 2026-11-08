-- Re-pin touch_updated_at (PLAT-01h)
--
-- 20261108063751_payment_returns (CORE-17) redefines property.touch_updated_at without a search_path, and it sorts after
-- the PLAT-01h pin, so a database built in version order would end up with a mutable search_path again. ALTER FUNCTION
-- sets only the setting; the body and grants stay as they are. On the live database (where the pin ran last) it is a no-op.

-- @up
alter function property.touch_updated_at() set search_path = '';

-- @down
alter function property.touch_updated_at() reset search_path;
