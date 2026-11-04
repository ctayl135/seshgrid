alter table public.artist_profiles add column username text unique check(username ~ '^[a-z0-9_]{3,24}$');
alter table public.artist_profiles add column avatar_path text check(avatar_path is null or avatar_path like id::text || '/%');
alter table public.artist_profiles add column website text not null default '' check(char_length(website)<=200 and (website='' or website ~ '^https://'));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('artist-avatars','artist-avatars',false,2097152,array['image/jpeg','image/png','image/webp']);
create policy "Members see avatars" on storage.objects for select to authenticated using(bucket_id='artist-avatars');
create policy "Artists upload avatars" on storage.objects for insert to authenticated with check(bucket_id='artist-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Artists delete avatars" on storage.objects for delete to authenticated using(bucket_id='artist-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
