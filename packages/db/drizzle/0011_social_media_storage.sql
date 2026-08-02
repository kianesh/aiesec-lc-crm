-- ------------------------------------------------------------------ --
-- 0011: Storage bucket for social media images                        --
-- Run via Supabase SQL editor or psql. Safe to re-run (idempotent).    --
-- ------------------------------------------------------------------ --

-- The mobile composer uploads photos straight from the camera roll. It uploads
-- to Storage directly rather than through /api/mobile/v1, because Vercel caps
-- serverless request bodies at 4.5 MB and a modern phone photo blows past that.
--
-- The bucket is PUBLIC on purpose: Instagram's Graph API publishes from an
-- `image_url` it fetches itself, so the file has to be reachable without a
-- token. Treat anything uploaded here as world-readable.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'social-media',
  'social-media',
  true,
  15728640, -- 15 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Objects are keyed <lc_id>/<uuid>.<ext>. The first path segment is the tenant
-- boundary: a member may only write into a folder named after an LC they
-- actually belong to, which stops one LC from filling (or overwriting) another's.
create or replace function public.can_write_lc_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.lc_members
    where user_id = auth.uid()
      and lc_id::text = (storage.foldername(object_name))[1]
  );
$$;

drop policy if exists "lc members can upload social media" on storage.objects;
create policy "lc members can upload social media"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'social-media'
  and public.can_write_lc_object(name)
);

drop policy if exists "lc members can update their social media" on storage.objects;
create policy "lc members can update their social media"
on storage.objects for update
to authenticated
using (bucket_id = 'social-media' and public.can_write_lc_object(name))
with check (bucket_id = 'social-media' and public.can_write_lc_object(name));

drop policy if exists "lc members can delete their social media" on storage.objects;
create policy "lc members can delete their social media"
on storage.objects for delete
to authenticated
using (bucket_id = 'social-media' and public.can_write_lc_object(name));

-- Reads are open because the bucket is public and Instagram fetches the URL
-- anonymously; this policy just makes that explicit rather than implicit.
drop policy if exists "social media is publicly readable" on storage.objects;
create policy "social media is publicly readable"
on storage.objects for select
to public
using (bucket_id = 'social-media');
