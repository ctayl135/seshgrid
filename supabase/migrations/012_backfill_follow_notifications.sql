-- Restore inbox entries for follows created before notification delivery was enabled.
-- Match recipient + follower link so replaying this migration cannot duplicate notices.
insert into public.notifications(user_id,title,link,created_at)
select f.artist_id,p.display_name||' started following you','/profile?artist='||f.follower_id::text,f.created_at
from public.artist_follows f join public.artist_profiles p on p.id=f.follower_id
where not exists(select 1 from public.notifications n where n.user_id=f.artist_id and n.link='/profile?artist='||f.follower_id::text);
