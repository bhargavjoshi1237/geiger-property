-- Private storage bucket for Property (PLAT-01g slice, ORCH-10)
--
-- Owns the storage bucket `property-private`: non-public, with no storage.objects
-- policies for anon or authenticated, so only the service role (server code)
-- can read or write it. Intake email attachments (vendor invoices, photos) land
-- here under intake/<projectId>/<intakeKey>/…; records store the storage path,
-- and the UI shows files through short-lived signed URLs.

-- @up
insert into storage.buckets (id, name, public, file_size_limit)
values ('property-private', 'property-private', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- @down
-- The property-private bucket is left in place: storage rows can only be removed
-- through the Storage API (storage.protect_delete blocks direct deletes).
