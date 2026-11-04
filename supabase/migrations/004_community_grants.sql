create or replace function public.keep_project_owner() returns trigger language plpgsql set search_path=public,pg_temp as $$begin if new.owner_id<>old.owner_id then raise exception 'Project ownership cannot change';end if;new.revision=old.revision+1;return new;end$$;
revoke all on public.collaborators,public.direct_messages,public.notifications from anon,authenticated;
grant select on public.collaborators,public.notifications to authenticated;
grant select,insert on public.direct_messages to authenticated;
