create function public.notify_artist_follow() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.notifications(user_id,title,link)
 values(new.artist_id,coalesce((select display_name from public.artist_profiles where id=new.follower_id),'An artist') || ' started following you','/profile?artist=' || new.follower_id::text);
 return new;
end;
$$;
revoke all on function public.notify_artist_follow() from public,anon,authenticated;
create trigger artist_follow_notification after insert on public.artist_follows for each row execute function public.notify_artist_follow();
