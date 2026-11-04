create table public.artist_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check(char_length(display_name) between 1 and 60),
 bio text not null default '' check(char_length(bio)<=500),
 genre text not null default 'Underground' check(char_length(genre) between 1 and 40),
 updated_at timestamptz not null default now()
);
alter table public.artist_profiles enable row level security;
revoke all on public.artist_profiles from anon;
grant select,insert,update on public.artist_profiles to authenticated;
create policy "Members read artist profiles" on public.artist_profiles for select to authenticated using (true);
create policy "Artists create own profile" on public.artist_profiles for insert to authenticated with check ((select auth.uid())=id);
create policy "Artists update own profile" on public.artist_profiles for update to authenticated using ((select auth.uid())=id) with check ((select auth.uid())=id);
create table public.feed_posts (
 id uuid primary key,
 owner_id uuid not null references public.artist_profiles(id) on delete cascade,
 title text not null check(char_length(title) between 1 and 120),
 genre text not null check(char_length(genre) between 1 and 40),
 audio_path text not null unique,
 published boolean not null default true,
 created_at timestamptz not null default now(),
 check(audio_path=owner_id::text || '/' || id::text || '/mix.wav')
);
alter table public.feed_posts enable row level security;
revoke all on public.feed_posts from anon;
grant select,insert,update on public.feed_posts to authenticated;
create policy "Members read published songs" on public.feed_posts for select to authenticated using (published or (select auth.uid())=owner_id);
create policy "Artists publish own mixes" on public.feed_posts for insert to authenticated with check ((select auth.uid())=owner_id);
create policy "Artists change own releases" on public.feed_posts for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create index feed_posts_recent on public.feed_posts(created_at desc) where published;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('shared-mixes','shared-mixes',false,52428800,array['audio/wav']);
create policy "Artists upload shared mixes" on storage.objects for insert to authenticated with check(bucket_id='shared-mixes' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Members listen to published mixes" on storage.objects for select to authenticated using(bucket_id='shared-mixes' and ((storage.foldername(name))[1]=(select auth.uid())::text or exists(select 1 from public.feed_posts p where p.audio_path=name and p.published)));
create policy "Artists remove own shared files" on storage.objects for delete to authenticated using(bucket_id='shared-mixes' and (storage.foldername(name))[1]=(select auth.uid())::text);
