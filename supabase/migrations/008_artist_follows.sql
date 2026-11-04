create table public.artist_follows (
 follower_id uuid not null references public.artist_profiles(id) on delete cascade,
 artist_id uuid not null references public.artist_profiles(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(follower_id, artist_id),
 check(follower_id <> artist_id)
);
create index artist_follows_incoming on public.artist_follows(artist_id, created_at desc);
alter table public.artist_follows enable row level security;
revoke all on public.artist_follows from anon;
grant select,insert,delete on public.artist_follows to authenticated;
create policy "Members read follows" on public.artist_follows for select to authenticated using (true);
create policy "Artists follow as themselves" on public.artist_follows for insert to authenticated with check ((select auth.uid())=follower_id);
create policy "Artists unfollow as themselves" on public.artist_follows for delete to authenticated using ((select auth.uid())=follower_id);
