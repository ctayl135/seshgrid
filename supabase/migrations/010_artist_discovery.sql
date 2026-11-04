create function public.discover_artists(search_text text default '', suggestions boolean default false)
returns table(id uuid, display_name text, bio text, genre text, username text, avatar_path text, followed boolean)
language sql stable security invoker set search_path=public as $$
 select p.id,p.display_name,p.bio,p.genre,p.username,p.avatar_path,
 exists(select 1 from public.artist_follows f where f.follower_id=(select auth.uid()) and f.artist_id=p.id)
 from public.artist_profiles p
 where (select auth.uid()) is not null and p.id<>(select auth.uid())
 and (nullif(trim(search_text),'') is null or strpos(lower(p.display_name),lower(trim(left(search_text,60))))>0 or strpos(coalesce(p.username,''),lower(trim(left(search_text,60))))>0)
 and (not suggestions or not exists(select 1 from public.artist_follows f where f.follower_id=(select auth.uid()) and f.artist_id=p.id))
 order by (p.genre=(select me.genre from public.artist_profiles me where me.id=(select auth.uid()))) desc nulls last,p.updated_at desc,p.id
 limit case when suggestions then 6 else 50 end;
$$;
revoke all on function public.discover_artists(text,boolean) from public,anon;
grant execute on function public.discover_artists(text,boolean) to authenticated;
